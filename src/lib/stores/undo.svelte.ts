import { repository } from '$lib/repo';
import {
  blockedBy,
  ownershipOrphans,
  planFlip,
  project,
  runBackTo,
  type FlipStep,
  type JournalEntry,
  type JournalRecord,
  type Owned
} from '$lib/domain/journal';
import type { EntityType } from '$lib/domain/validate';
import { Autosave } from './autosave.svelte';
import { journal } from './journal.svelte';
import { plain } from './plain.svelte';
import { writer } from './writer.svelte';
import { activeVault } from './vault.svelte';
import { collections } from './collections.svelte';
import { items } from './items.svelte';
import { outcomes } from './outcomes.svelte';
import { review } from './review.svelte';
import { rubrics } from './rubrics.svelte';
import { describe } from './vaults.svelte';

/*
  Putting a change back.

  The order below is the whole of it and every line of it is load-bearing:

    1. Flush every debounce. A keystroke still sitting in a saver would land on top of
       the restored record a moment later and quietly undo the undo — the highest-cost
       failure in this stage, and one an indicator reading "Saved" would not show.
    2. Read storage once.
    3. Decide, against that read, whether the whole flip is safe. All of it or none:
       a run that stops halfway leaves the user with neither the old state nor the new.
    4. Write.
    5. Reload the stores that were holding the records, or the screen keeps showing
       what was there before.

  The writes go through the funnel with `journal: false`. An undo that journalled
  itself would add an entry whose own undo is the thing just undone, and the list would
  grow a rung every time somebody changed their mind.
*/

/** Records whose owner is one id away: an item's collection, an outcome's parent. */
function ownedIn(snapshot: {
  items: readonly { id: string; collectionId: string }[];
  outcomes: readonly { id: string; parentId: string | null }[];
}): Owned[] {
  return [
    ...snapshot.items.map((item) => ({ id: item.id, ownerId: item.collectionId })),
    ...snapshot.outcomes.map((outcome) => ({ id: outcome.id, ownerId: outcome.parentId }))
  ];
}

function quoted(entry: JournalEntry): string {
  return `“${entry.label}”`;
}

class UndoStore {
  /** One flip at a time. Two overlapping runs would each check against the other's before-state. */
  busy = $state(false);

  /** The newest entry the keyboard shortcut would act on, or nothing. */
  nextUndo(vaultId: string): JournalEntry | undefined {
    return journal.newest(vaultId, 'applied');
  }

  nextRedo(vaultId: string): JournalEntry | undefined {
    return journal.newest(vaultId, 'reverted');
  }

  /** `Ctrl+Z`. */
  async undoLast(vaultId: string): Promise<boolean> {
    const entry = this.nextUndo(vaultId);
    if (!entry) {
      journal.notice = 'Nothing left to undo in this course.';
      return false;
    }
    return this.flip(entry);
  }

  /** `Ctrl+Shift+Z`. */
  async redoLast(vaultId: string): Promise<boolean> {
    const entry = this.nextRedo(vaultId);
    if (!entry) {
      journal.notice = 'Nothing to redo.';
      return false;
    }
    return this.flip(entry);
  }

  /**
   * Undoes an applied entry, or redoes a reverted one.
   *
   * Refuses out of order when anything newer and still applied touched the same
   * records — see `blockedBy`. The change list offers the run instead, which is why
   * this says so rather than silently doing the run itself: "undo one thing" and "undo
   * the last six things" are different decisions and only one of them is the user's.
   */
  async flip(entry: JournalEntry): Promise<boolean> {
    const blockers = blockedBy(entry, journal.entries);
    if (blockers.length > 0) {
      const count = blockers.length;
      journal.notice =
        `${count} later ${count === 1 ? 'change' : 'changes'} touched the same records, ` +
        `so ${quoted(entry)} cannot be undone on its own.`;
      return false;
    }
    return this.#apply([entry]);
  }

  /** "Undo everything back to here" — every applied entry from the newest down to this one. */
  async undoBackTo(entry: JournalEntry): Promise<boolean> {
    return this.#apply(runBackTo(entry, journal.entries));
  }

  async #apply(entries: readonly JournalEntry[]): Promise<boolean> {
    const first = entries[0];
    if (this.busy || !first) return false;

    this.busy = true;
    try {
      // Before the read, not after: a debounce landing between the read and the write
      // would make the whole check describe a state that no longer exists.
      await Autosave.flushAll();

      const vaultId = first.vaultId;
      /*
        `exportVault` rather than five queries. It already gathers every record in the
        course in one pass — which is exactly what both checks below need, one to
        compare stamps and the other to find what would be stranded — and it is the
        gather path the review screens already use.
      */
      const snapshot = await repository.exportVault(vaultId);
      const stored = new Map<string, JournalRecord | null>(
        [
          snapshot.vault,
          ...snapshot.outcomes,
          ...snapshot.collections,
          ...snapshot.items,
          ...snapshot.rubrics
        ].map((entity) => [entity.id, entity as JournalRecord])
      );

      const steps = planFlip(entries);
      const { conflicts, final } = project(steps, stored);
      if (conflicts.length > 0) {
        journal.notice = this.#staleMessage(conflicts);
        return false;
      }

      const deleting = new Set(
        [...final].filter(([, record]) => record === null).map(([id]) => id)
      );
      const orphans = ownershipOrphans(deleting, ownedIn(snapshot));
      if (orphans.length > 0) {
        const count = orphans.length;
        journal.notice =
          `Undoing ${quoted(first)} would leave ${count} ` +
          `${count === 1 ? 'record' : 'records'} inside something that no longer exists. ` +
          `Undo the later changes first.`;
        return false;
      }

      for (const step of steps) {
        const intent = {
          label: `Undid ${step.entryLabel}`,
          vaultId,
          journal: false
        };
        // `plain()` even though `journal.entries` is raw. The rule in this codebase is
        // that everything crossing into the repository goes through it, and a store
        // that is raw today is one refactor from not being.
        if (step.write === null) await writer.remove(step.type, step.id, intent);
        else await writer.restore(step.type, plain(step.write), intent);
      }

      for (const entry of entries) {
        journal.setState(entry.id, entry.state === 'applied' ? 'reverted' : 'applied');
      }

      await this.#reload(new Set(steps.map((step) => step.type)), vaultId);
      journal.notice = this.#doneMessage(entries, first);
      return true;
    } catch (cause) {
      journal.notice = `That could not be undone: ${describe(cause)}`;
      return false;
    } finally {
      this.busy = false;
    }
  }

  #staleMessage(conflicts: readonly FlipStep[]): string {
    const label = conflicts[0]?.entryLabel ?? 'That change';
    return (
      `“${label}” cannot be undone: one of the records it changed has been written ` +
      `since, and putting the old version back would discard that.`
    );
  }

  #doneMessage(entries: readonly JournalEntry[], first: JournalEntry): string {
    // `entries` were read BEFORE the flip, so their `state` is the direction just taken.
    if (entries.length > 1) {
      return `Undid ${entries.length} changes, back to ${quoted(first)}.`;
    }
    return first.state === 'applied' ? `Undid ${quoted(first)}.` : `Redid ${quoted(first)}.`;
  }

  /**
   * Re-reads whatever was holding the records that just changed.
   *
   * Every one of these goes past the store's own load guard on purpose. `load()`
   * returns early when it is already showing the vault or collection it is being asked
   * for — which is right for navigation and exactly wrong here, where the id has not
   * changed and the records underneath it have.
   */
  async #reload(types: ReadonlySet<EntityType>, vaultId: string): Promise<void> {
    if (types.has('vault')) await activeVault.refresh();
    if (types.has('outcome')) await outcomes.refresh();
    if (types.has('collection')) await collections.refresh();
    if (types.has('item')) await items.refresh();
    if (types.has('rubric')) await rubrics.refresh();

    // The review snapshot is deliberately not live, but leaving it stale after an undo
    // would have the coverage matrix and the notes panel describing a course that no
    // longer exists.
    if (review.status === 'ready' && review.vaultId === vaultId) await review.reload();
  }
}

export const undo = new UndoStore();
