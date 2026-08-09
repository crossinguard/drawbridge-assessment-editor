import { repository } from '$lib/repo';
import { newOutcome } from '$lib/domain/defaults';
import { ancestorsOf, childrenOf, descendantsOf } from '$lib/domain/outcomes';
import { nowIso } from '$lib/domain/ids';
import type { Outcome } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  The outcome tree, and the operations an outliner needs.

  Two save paths, on purpose.

  Typing into a code or a text field goes through `queueFieldSave`, debounced, because
  it fires on every keystroke and touches one record.

  Structural changes — add, delete, move, indent, outdent — write immediately. They
  touch several records at once and they renumber siblings, so a half-applied debounce
  would leave the tree in a shape that never existed. They are also discrete actions
  the user took deliberately, so there is nothing to coalesce.
*/

class OutcomesStore {
  items = $state<Outcome[]>([]);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);
  vaultId = $state('');

  /** Ids edited since the last successful write. */
  #dirty = new Set<string>();

  /*
    The queued value is the record CONTENT, not a list of ids.

    Queueing ids seems tidier — the write would then read the freshest object — but it
    breaks the no-op check in Autosave: the id list is identical between two successive
    edits to the same outcome, so the second one is discarded as "already saved". That
    lost real text with no error and no change to the indicator.

    `updatedAt` is deliberately stamped at write time rather than queue time. Stamping
    it here would make every keystroke produce a different value and defeat the no-op
    check in the other direction, so typing something and undoing it would still write.
  */
  readonly saver = new Autosave<Outcome[]>(async (records) => {
    if (records.length === 0) return;
    await repository.outcomes.putMany(
      records.map((outcome) => ({ ...outcome, updatedAt: nowIso() }))
    );
    this.#dirty.clear();
  });

  async load(vaultId: string): Promise<void> {
    if (this.vaultId === vaultId && this.status === 'ready') return;

    this.status = 'loading';
    this.vaultId = vaultId;
    try {
      this.items = await repository.outcomes.listByVault(vaultId);
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  siblingsOf(parentId: string | null): Outcome[] {
    return childrenOf(this.items, parentId);
  }

  descendantsOf(id: string): Outcome[] {
    return descendantsOf(this.items, id);
  }

  // -------------------------------------------------------------------------
  // Field edits
  // -------------------------------------------------------------------------

  queueFieldSave(id: string): void {
    this.#dirty.add(id);
    this.#requeue();
  }

  /**
   * Rebuilds the queued write from whatever is still dirty AND still exists.
   *
   * Called after a delete as well as after an edit: a record removed while its edit
   * was still pending would otherwise be written straight back out of the queue and
   * reappear.
   */
  #requeue(): void {
    const records = [...this.#dirty]
      .map((dirtyId) => this.items.find((outcome) => outcome.id === dirtyId))
      .filter((outcome): outcome is Outcome => outcome !== undefined)
      .map((outcome) => plain(outcome));

    if (records.length === 0) this.saver.cancel();
    else this.saver.queue(records);
  }

  async flush(): Promise<void> {
    await this.saver.flush();
  }

  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  /**
   * Suggests the next code under a parent, e.g. EO1.1 → EO1.1.3.
   *
   * Only ever a suggestion — the field stays editable, and a course whose codes do not
   * follow this shape is not doing anything wrong.
   */
  suggestCode(parentId: string | null): string {
    const siblings = this.siblingsOf(parentId);
    const next = siblings.length + 1;
    if (parentId === null) return `CO${next}`;

    const parent = this.items.find((outcome) => outcome.id === parentId);
    if (!parent || parent.code.trim() === '') return `${next}`;
    return `${parent.code}.${next}`;
  }

  async add(parentId: string | null, afterId?: string): Promise<Outcome> {
    const siblings = this.siblingsOf(parentId);
    const afterIndex = afterId ? siblings.findIndex((s) => s.id === afterId) : siblings.length - 1;

    const outcome = newOutcome({
      vaultId: this.vaultId,
      parentId,
      code: this.suggestCode(parentId),
      text: '',
      order: afterIndex + 1
    });

    // Splice into position, then renumber so `order` stays a dense 0..n-1 run. Dense
    // integers mean move-up/move-down is a swap and never has to invent a midpoint.
    const reordered = [...siblings];
    reordered.splice(afterIndex + 1, 0, outcome);

    this.items = [...this.items, outcome];
    await this.#persistOrder(reordered);
    return outcome;
  }

  async remove(id: string): Promise<void> {
    // The subtree goes with it. Promoting orphans instead would scatter a branch
    // across the top level, which is harder to undo by hand than re-typing it.
    const doomed = [id, ...this.descendantsOf(id).map((outcome) => outcome.id)];
    const parentId = this.items.find((outcome) => outcome.id === id)?.parentId ?? null;

    try {
      for (const doomedId of doomed) {
        // Drop it from the pending set first, or a queued field save would try to
        // write a record that no longer exists.
        this.#dirty.delete(doomedId);
        await repository.outcomes.remove(doomedId);
      }
      this.items = this.items.filter((outcome) => !doomed.includes(outcome.id));
      // Drop the deleted records from anything still queued, or the pending write
      // puts them back.
      this.#requeue();
      await this.#persistOrder(this.siblingsOf(parentId));
    } catch (cause) {
      this.saver.markFailed(cause);
    }
  }

  async move(id: string, delta: -1 | 1): Promise<void> {
    const outcome = this.items.find((o) => o.id === id);
    if (!outcome) return;

    const siblings = this.siblingsOf(outcome.parentId);
    const index = siblings.findIndex((s) => s.id === id);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    if (moved) reordered.splice(target, 0, moved);
    await this.#persistOrder(reordered);
  }

  /** Makes the outcome a child of the sibling immediately above it. */
  async indent(id: string): Promise<void> {
    const outcome = this.items.find((o) => o.id === id);
    if (!outcome) return;

    const siblings = this.siblingsOf(outcome.parentId);
    const index = siblings.findIndex((s) => s.id === id);
    const newParent = siblings[index - 1];
    // The first child of a group has nothing to nest under; that is not an error, it
    // is just the edge of the operation.
    if (!newParent) return;

    const oldSiblings = siblings.filter((s) => s.id !== id);
    outcome.parentId = newParent.id;
    const newSiblings = [...this.siblingsOf(newParent.id).filter((s) => s.id !== id), outcome];

    await this.#persistOrder(oldSiblings, newSiblings);
  }

  /** Makes the outcome a sibling of its parent, immediately after it. */
  async outdent(id: string): Promise<void> {
    const outcome = this.items.find((o) => o.id === id);
    if (!outcome || outcome.parentId === null) return;

    const parent = this.items.find((o) => o.id === outcome.parentId);
    if (!parent) return;

    const oldSiblings = this.siblingsOf(outcome.parentId).filter((s) => s.id !== id);
    const grandparentId = parent.parentId;

    outcome.parentId = grandparentId;
    const uncles = this.siblingsOf(grandparentId).filter((s) => s.id !== id);
    const parentIndex = uncles.findIndex((s) => s.id === parent.id);
    const newSiblings = [...uncles];
    newSiblings.splice(parentIndex + 1, 0, outcome);

    await this.#persistOrder(oldSiblings, newSiblings);
  }

  /**
   * Writes `order` as a dense 0..n-1 run over each supplied sibling group.
   *
   * Everything structural funnels through here so ordering is repaired in one place.
   * Imported data with duplicate or sparse orders gets tidied the first time anything
   * in that group is touched.
   */
  async #persistOrder(...groups: Outcome[][]): Promise<void> {
    const changed: Outcome[] = [];
    for (const group of groups) {
      group.forEach((outcome, index) => {
        if (outcome.order !== index) outcome.order = index;
        changed.push(outcome);
      });
    }
    if (changed.length === 0) return;

    try {
      await repository.outcomes.putMany(
        changed.map((outcome) => plain({ ...outcome, updatedAt: nowIso() }))
      );
      // Reported explicitly: this write skipped the debounce, so without this the
      // indicator would read "No changes" immediately after the user moved a row.
      this.saver.markSaved();
    } catch (cause) {
      this.saver.markFailed(cause);
    }
  }

  /** Ancestor codes for a breadcrumb, outermost first. */
  trail(id: string): string[] {
    return ancestorsOf(this.items, id)
      .map((outcome) => outcome.code)
      .reverse();
  }

  close(): void {
    this.items = [];
    this.vaultId = '';
    this.status = 'idle';
    this.#dirty.clear();
  }
}

export const outcomes = new OutcomesStore();
