import { repository } from '$lib/repo';
import { newItem } from '$lib/domain/defaults';
import { nowIso } from '$lib/domain/ids';
import { duplicateItem, itemsInSection } from '$lib/domain/items';
import type { Item, ItemKind } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
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

  #dirty = new Set<string>();

  readonly saver = new Autosave<Item[]>(async (records) => {
    if (records.length === 0) return;
    await repository.items.putMany(records.map((item) => ({ ...item, updatedAt: nowIso() })));
    this.#dirty.clear();
  });

  async load(collectionId: string): Promise<void> {
    if (this.collectionId === collectionId && this.status === 'ready') return;

    this.status = 'loading';
    this.collectionId = collectionId;
    this.#dirty.clear();
    this.saver.cancel();
    try {
      this.items = await repository.items.listByCollection(collectionId);
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
    await this.#write([item]);
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
    await this.#renumber(reordered);
    return copy;
  }

  async remove(id: string): Promise<void> {
    const item = this.items.find((existing) => existing.id === id);
    if (!item) return;
    const sectionId = item.sectionId ?? undefined;

    try {
      this.#dirty.delete(id);
      await repository.items.remove(id);
      this.items = this.items.filter((existing) => existing.id !== id);
      // Drop it from any pending write, or the debounce puts it straight back.
      this.#requeue();
      await this.#renumber(this.inSection(sectionId));
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
    await this.#renumber(reordered);
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
    await this.#renumber(leftBehind, arrivedIn);
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

  /** Writes `order` as a dense 0..n-1 run over each supplied group. */
  async #renumber(...groups: Item[][]): Promise<void> {
    const changed: Item[] = [];
    for (const group of groups) {
      group.forEach((item, index) => {
        if (item.order !== index) item.order = index;
        changed.push(item);
      });
    }
    await this.#write(changed);
  }

  async #write(records: Item[]): Promise<void> {
    if (records.length === 0) return;
    try {
      await repository.items.putMany(
        records.map((item) => plain({ ...item, updatedAt: nowIso() }))
      );
      this.saver.markSaved();
    } catch (cause) {
      this.saver.markFailed(cause);
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
