import { repository } from '$lib/repo';
import { newItem } from '$lib/domain/defaults';
import { nowIso } from '$lib/domain/ids';
import { duplicateItem, itemsInSection, relocateItem } from '$lib/domain/items';
import type { Item, ItemKind } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
import { writer } from './writer.svelte';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  The items of the collection being authored.

  Same two save paths as the outcome tree, for the same reasons: typing debounces,
  structure writes immediately. The lessons from that stage are baked in here — the
  saver is queued with record CONTENT, and anything that stops being true gets its
  pending write cancelled. See CLAUDE.md for what happens when either is got wrong.

  `order` is scoped to the group an item sits in — a section, or the ungrouped run
  above the first section — never to the collection as a whole. Moving an item between
  sections then only has to close the gap it left.
*/

class ItemsStore {
  items = $state<Item[]>([]);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);
  collectionId = $state('');
  /*
    Carried so a write can say which course it belongs to. Read from the collection on
    load rather than passed in, because the alternative is the route remembering to
    supply it and a write intent quietly carrying an empty string when it forgets.
  */
  vaultId = $state('');

  #dirty = new Set<string>();

  readonly saver = new Autosave<Item[]>(async (records) => {
    if (records.length === 0) return;
    // No `report` here: the saver IS the reporter, and it marks its own outcome around
    // this callback. Passing itself would have it report twice on the same write.
    await writer.putMany(
      'item',
      records.map((item) => ({ ...item, updatedAt: nowIso() })),
      { label: 'Edited an item', vaultId: this.vaultId }
    );
    this.#dirty.clear();
  });

  async load(collectionId: string): Promise<void> {
    if (this.collectionId === collectionId && this.status === 'ready') return;

    this.status = 'loading';
    this.collectionId = collectionId;
    this.#dirty.clear();
    this.saver.cancel();
    try {
      const [loaded, collection] = await Promise.all([
        repository.items.listByCollection(collectionId),
        repository.collections.get(collectionId)
      ]);
      this.items = loaded;
      this.vaultId = collection?.vaultId ?? '';
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  inSection(sectionId: string | undefined): Item[] {
    return itemsInSection(this.items, sectionId);
  }

  // -------------------------------------------------------------------------
  // Field edits
  // -------------------------------------------------------------------------

  queueFieldSave(id: string): void {
    this.#dirty.add(id);
    this.#requeue();
  }

  #requeue(): void {
    const records = [...this.#dirty]
      .map((dirtyId) => this.items.find((item) => item.id === dirtyId))
      .filter((item): item is Item => item !== undefined)
      .map((item) => plain(item));

    if (records.length === 0) this.saver.cancel();
    else this.saver.queue(records);
  }

  async flush(): Promise<void> {
    await this.saver.flush();
  }

  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  async add(kind: ItemKind, sectionId: string | undefined, status = ''): Promise<Item> {
    const group = this.inSection(sectionId);
    const item = newItem({
      collectionId: this.collectionId,
      kind,
      order: group.length,
      status,
      ...(sectionId === undefined ? {} : { sectionId })
    });

    this.items = [...this.items, item];
    await this.#write([item], 'Added an item');
    return item;
  }

  async duplicate(id: string): Promise<Item | null> {
    const original = this.items.find((item) => item.id === id);
    if (!original) return null;

    const copy = duplicateItem(plain(original));
    const group = this.inSection(original.sectionId ?? undefined);
    const position = group.findIndex((item) => item.id === id);

    // Lands directly under its original rather than at the end, because the reason to
    // duplicate is almost always to make a variant of the question you are looking at.
    const reordered = [...group];
    reordered.splice(position + 1, 0, copy);

    this.items = [...this.items, copy];
    await this.#renumber('Duplicated an item', reordered);
    return copy;
  }

  async remove(id: string): Promise<void> {
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return;
    const sectionId = item.sectionId ?? undefined;

    try {
      this.#dirty.delete(id);
      await writer.remove('item', id, {
        label: 'Deleted an item',
        vaultId: this.vaultId,
        report: this.saver
      });
      this.items = this.items.filter((existing) => existing.id !== id);
      // Drop it from any pending write, or the debounce puts it straight back.
      this.#requeue();
      await this.#renumber('Deleted an item', this.inSection(sectionId));
    } catch (cause) {
      this.saver.markFailed(cause);
    }
  }

  async move(id: string, delta: -1 | 1): Promise<void> {
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return;

    const group = this.inSection(item.sectionId ?? undefined);
    const index = group.findIndex((existing) => existing.id === id);
    const target = index + delta;
    if (target < 0 || target >= group.length) return;

    const reordered = [...group];
    const [moved] = reordered.splice(index, 1);
    if (moved) reordered.splice(target, 0, moved);
    await this.#renumber('Reordered an item', reordered);
  }

  /** Moves an item into another section, or out of all of them with `undefined`. */
  async setSection(id: string, sectionId: string | undefined): Promise<void> {
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return;
    const from = item.sectionId ?? undefined;
    if (from === sectionId) return;

    const leftBehind = this.inSection(from).filter((existing) => existing.id !== id);

    if (sectionId === undefined) delete item.sectionId;
    else item.sectionId = sectionId;

    const arrivedIn = [...this.inSection(sectionId).filter((existing) => existing.id !== id), item];
    await this.#renumber('Moved an item to another section', leftBehind, arrivedIn);
  }

  /**
   * Moves an item to another collection. Returns false if there was nothing to move.
   *
   * The order below is the whole of it, and step one is the one that matters.
   */
  async moveToCollection(id: string, toCollectionId: string): Promise<boolean> {
    if (toCollectionId === '' || toCollectionId === this.collectionId) return false;

    /*
      Top-level only. A part is not a row — it lives inside its parent's `parts` array
      and has no independent existence to move — so a part id finds nothing here and
      the move is refused. Promoting a part to an item of its own is a different
      operation with different questions to answer.
    */
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return false;

    const from = item.sectionId ?? undefined;

    try {
      /*
        FLUSHED, not cancelled, and before anything else is read.

        Cancelling would also happen to work today, and it is worth writing down why it
        is still the wrong instruction. The moved record is built from the LIVE item
        below, which already carries anything typed a moment ago, and `#requeue()`
        afterwards rebuilds the queue for the items staying behind — so nothing is lost
        in the happy path either way. The tests below cannot tell the two apart, and
        that was checked rather than assumed.

        What flushing buys is the unhappy path. Everything below this line is `await`ed:
        a read, a write, a renumber. Cancel first and the pending keystrokes exist only
        in memory across all of it, with nothing queued to write them — so a failure
        there, or the tab closing, loses text that had already been typed. Flushing
        makes the pending work durable before a multi-step structural operation begins,
        which is what every other structural path here does too.
      */
      await this.saver.flush();

      // The append position in the collection it is arriving at, which this store does
      // not hold — it only ever has one collection's items loaded.
      const target = await repository.items.listByCollection(toCollectionId);
      const order = target.filter((existing) => existing.sectionId === undefined).length;

      /*
        `put`, not `update`. `relocateItem` returns a COMPLETE record and removes
        `sectionId` and `stimulusId` by deleting the keys — and `update` merges a patch
        over what is stored, so an absent key keeps its old value. Using it here would
        leave the item pointing at a section of the collection it just left, which is
        the precise thing `relocateItem` exists to prevent.
      */
      const moved = relocateItem(plain(item), toCollectionId, order);

      this.#dirty.delete(id);
      await writer.put('item', moved, {
        label: 'Moved an item to another collection',
        vaultId: this.vaultId,
        report: this.saver
      });

      this.items = this.items.filter((existing) => existing.id !== id);
      // Drop it from any pending write, or the debounce puts it straight back here.
      this.#requeue();
      await this.#renumber('Moved an item to another collection', this.inSection(from));
      return true;
    } catch (cause) {
      this.saver.markFailed(cause);
      return false;
    }
  }

  /** Changes an item's kind, leaving the content alone for the author to sort out. */
  async setKind(id: string, kind: ItemKind): Promise<void> {
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return;
    item.kind = kind;
    // Options for a kind that has none are left in place rather than deleted: a
    // mis-click that silently destroyed four authored distractors would be
    // unforgivable, and validation already points out that they are unused.
    this.queueFieldSave(id);
  }

  // -------------------------------------------------------------------------
  // Group parts
  //
  // A group's parts live inside the parent row, so every one of these is an edit to
  // ONE record. They go through the debounced field path rather than #write, because
  // that is what they are — and because a part's own field edits already queue the
  // parent, so mixing paths would race two writers over the same record.
  // -------------------------------------------------------------------------

  #findDeep(id: string): Item | undefined {
    const search = (list: readonly Item[]): Item | undefined => {
      for (const item of list) {
        if (item.id === id) return item;
        const found = search(item.parts);
        if (found) return found;
      }
      return undefined;
    };
    return search(this.items);
  }

  /** The record that actually gets written for a nested part: its top-level ancestor. */
  #ownerOf(id: string): Item | undefined {
    const owns = (item: Item): boolean =>
      item.id === id || item.parts.some((part) => part.id === id || owns(part));
    return this.items.find(owns);
  }

  addPart(parentId: string, kind: ItemKind): Item | null {
    const parent = this.#findDeep(parentId);
    const owner = this.#ownerOf(parentId);
    if (!parent || !owner) return null;

    const part = newItem({
      collectionId: this.collectionId,
      kind,
      order: parent.parts.length,
      status: parent.status
    });
    parent.parts = [...parent.parts, part];
    this.queueFieldSave(owner.id);
    return part;
  }

  removePart(parentId: string, partId: string): void {
    const parent = this.#findDeep(parentId);
    const owner = this.#ownerOf(parentId);
    if (!parent || !owner) return;

    parent.parts = parent.parts
      .filter((part) => part.id !== partId)
      .map((part, order) => ({ ...part, order }));
    this.queueFieldSave(owner.id);
  }

  movePart(parentId: string, partId: string, delta: -1 | 1): void {
    const parent = this.#findDeep(parentId);
    const owner = this.#ownerOf(parentId);
    if (!parent || !owner) return;

    const parts = [...parent.parts].sort((a, b) => a.order - b.order);
    const index = parts.findIndex((part) => part.id === partId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= parts.length) return;

    const [moved] = parts.splice(index, 1);
    if (moved) parts.splice(target, 0, moved);
    parent.parts = parts.map((part, order) => ({ ...part, order }));
    this.queueFieldSave(owner.id);
  }

  duplicatePart(parentId: string, partId: string): Item | null {
    const parent = this.#findDeep(parentId);
    const owner = this.#ownerOf(parentId);
    if (!parent || !owner) return null;

    const original = parent.parts.find((part) => part.id === partId);
    if (!original) return null;

    const copy = duplicateItem(plain(original));
    const parts = [...parent.parts].sort((a, b) => a.order - b.order);
    parts.splice(parts.findIndex((part) => part.id === partId) + 1, 0, copy);
    parent.parts = parts.map((part, order) => ({ ...part, order }));
    this.queueFieldSave(owner.id);
    return copy;
  }

  /** Queues a save for whichever top-level record owns this item. */
  queueSaveForOwnerOf(id: string): void {
    const owner = this.#ownerOf(id);
    if (owner) this.queueFieldSave(owner.id);
  }

  /** Writes `order` as a dense 0..n-1 run over each supplied group. */
  async #renumber(label: string, ...groups: Item[][]): Promise<void> {
    const changed: Item[] = [];
    for (const group of groups) {
      group.forEach((item, index) => {
        if (item.order !== index) item.order = index;
        changed.push(item);
      });
    }
    await this.#write(changed, label);
  }

  /**
   * The structural write path: immediate, and reported.
   *
   * Was already a funnel of its own before stage 21 — this is the same thing routed
   * through the shared one, so the `try`/`markSaved`/`markFailed` it used to spell out
   * now happens once, in `writer`, for every store.
   */
  async #write(records: Item[], label: string): Promise<void> {
    if (records.length === 0) return;
    try {
      await writer.putMany(
        'item',
        records.map((item) => plain({ ...item, updatedAt: nowIso() })),
        { label, vaultId: this.vaultId, report: this.saver }
      );
    } catch {
      // Already reported by the funnel. Swallowed here because a structural edit is
      // fire-and-forget from the UI's side: the indicator is the report.
    }
  }

  reset(): void {
    this.items = [];
    this.collectionId = '';
    this.status = 'idle';
    this.#dirty.clear();
    this.saver.cancel();
  }
}

export const items = new ItemsStore();
