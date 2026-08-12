import { repository } from '$lib/repo';
import { newCollection } from '$lib/domain/defaults';
import { newId, nowIso } from '$lib/domain/ids';
import type { Collection, Section } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
import { writer } from './writer.svelte';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  Collections in a vault, and the one currently open.

  A collection is the single container shape — bank, quiz, exam, task, discussion all
  differ only by `kind`, which is a key from vault config. There is deliberately no
  per-kind branching anywhere in this file.
*/

class CollectionsStore {
  items = $state<Collection[]>([]);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);
  vaultId = $state('');

  /** The collection open in the authoring screen. Bound to directly by its editors. */
  open = $state<Collection | null>(null);

  readonly saver = new Autosave<Collection>(async (value) => {
    // No `report`: the saver marks its own outcome around this callback.
    await writer.put(
      'collection',
      { ...value, updatedAt: nowIso() },
      { label: 'Edited a collection', vaultId: this.vaultId }
    );
    // Keep the list in step, so the collections index does not show a stale title.
    const index = this.items.findIndex((collection) => collection.id === value.id);
    if (index >= 0) this.items[index] = { ...value };
  });

  async load(vaultId: string): Promise<void> {
    if (this.vaultId === vaultId && this.status === 'ready') return;

    this.status = 'loading';
    this.vaultId = vaultId;
    try {
      this.items = await repository.collections.listByVault(vaultId);
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  async openCollection(collectionId: string): Promise<void> {
    if (this.open?.id === collectionId) return;
    const collection = await repository.collections.get(collectionId);
    this.open = collection ?? null;
    if (collection) this.saver.accept(collection);
  }

  queueSave(): void {
    if (!this.open) return;
    this.saver.queue(plain(this.open));
  }

  async flush(): Promise<void> {
    await this.saver.flush();
  }

  async create(input: { kind: string; title: string }): Promise<Collection> {
    const collection = newCollection({
      vaultId: this.vaultId,
      kind: input.kind,
      title: input.title,
      order: this.items.filter((existing) => existing.kind === input.kind).length
    });
    await writer.put('collection', plain(collection), {
      label: 'Added a collection',
      vaultId: this.vaultId,
      report: this.saver
    });
    this.items = [...this.items, collection];
    return collection;
  }

  /** Removes the collection and, through the repository cascade, its items. */
  async remove(collectionId: string): Promise<void> {
    await writer.remove('collection', collectionId, {
      label: 'Deleted a collection',
      vaultId: this.vaultId,
      report: this.saver
    });
    this.items = this.items.filter((collection) => collection.id !== collectionId);
    if (this.open?.id === collectionId) {
      this.saver.cancel();
      this.open = null;
    }
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  addSection(title: string): Section | null {
    if (!this.open) return null;
    const section: Section = { id: newId(), title, order: this.open.sections.length };
    this.open.sections = [...this.open.sections, section];
    this.queueSave();
    return section;
  }

  moveSection(sectionId: string, delta: -1 | 1): void {
    if (!this.open) return;
    const ordered = [...this.open.sections].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((section) => section.id === sectionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const [moved] = ordered.splice(index, 1);
    if (moved) ordered.splice(target, 0, moved);
    this.open.sections = ordered.map((section, position) => ({ ...section, order: position }));
    this.queueSave();
  }

  /**
   * Removes a section. Its items are NOT deleted — they fall back to the ungrouped
   * list at the top. Deleting a heading should never delete the questions under it.
   */
  removeSection(sectionId: string): void {
    if (!this.open) return;
    this.open.sections = this.open.sections
      .filter((section) => section.id !== sectionId)
      .map((section, position) => ({ ...section, order: position }));
    this.queueSave();
  }

  close(): void {
    this.open = null;
    this.saver.cancel();
  }

  reset(): void {
    this.items = [];
    this.vaultId = '';
    this.status = 'idle';
    this.close();
  }
}

export const collections = new CollectionsStore();
