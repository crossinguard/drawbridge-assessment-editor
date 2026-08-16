import {
  appendEntry,
  JOURNAL_LIMIT,
  newEntry,
  type Change,
  type EntryState,
  type JournalEntry
} from '$lib/domain/journal';

/*
  What changed this session, in memory.

  IN MEMORY, and that is the design rather than an omission. "What changed in this
  session" taken literally: reload the tab and the list is empty, because the thing it
  was describing is over.

  Persisting it would mean a sixth table, a sixth branch in `deleteVault`'s cascade, a
  decision about whether it travels inside a bundle (it must not — a journal of someone
  else's session is meaningless against your records, and it would double the size of
  every export with before-images), and unbounded growth from whole-record snapshots
  that nothing ever prunes. None of that buys anything: an undo you want tomorrow is a
  restore from a bundle, which this app already does properly.

  This file is the LOG and nothing else — no repository, no writer, no reload. The
  funnel files changes into it; `stores/undo.svelte.ts` reads it and performs the
  reverts. Keeping the log ignorant of both is what stops the funnel and the undo
  operation importing each other in a circle.
*/

class Journal {
  /**
   * Oldest first, which is the order everything in `domain/journal.ts` assumes.
   *
   * `$state.raw`, and it has to be. Plain `$state` proxies DEEPLY, so every
   * before-image in here would be handed back as a Proxy — and the first thing undo
   * does with one is write it to IndexedDB, which structured-clones and throws
   * `DataCloneError` on a Proxy. That is the failure this app's `plain()` exists for,
   * arriving from the one direction nothing was watching: a value on its way OUT of a
   * store rather than in.
   *
   * Raw is also simply right for the data. Nothing ever mutates an entry in place —
   * `record` and `setState` both reassign the array — and deep-proxying a hundred
   * whole records to observe changes that never happen is pure cost.
   */
  entries = $state.raw<JournalEntry[]>([]);

  /**
   * How many entries have aged out of the cap.
   *
   * Surfaced rather than kept quiet: a list that silently stops at a hundred looks
   * like a list of everything, and someone hunting for a change they made an hour ago
   * deserves to be told it is gone rather than left to conclude it never happened.
   */
  dropped = $state(0);

  /**
   * What the last undo or redo did, or refused to do.
   *
   * Undo is reachable by keyboard from every screen in the course, and a `Ctrl+Z` that
   * silently declines is indistinguishable from one the app did not receive. The vault
   * layout renders this in a live region for exactly that reason.
   */
  notice = $state<string | null>(null);

  /**
   * Files one user action.
   *
   * Called by the funnel, once per write — or once per GROUP of writes, when the store
   * collected them into a single `Change[]` first. Deleting an item is a removal
   * followed by a renumber of its siblings; recorded separately they would be two
   * entries, and undoing one of them would leave the questions numbered as though the
   * deleted one were still there.
   */
  record(label: string, vaultId: string, changes: readonly Change[]): void {
    /*
      An empty list is a group whose writes all failed, or one the caller opened and
      never used. Anything else is recorded as it stands — there is deliberately NO
      filter here for changes that look like no-ops.

      That filter existed for an afternoon and dropped real work. It judged a change
      no-op when its before and after carried the same `updatedAt`, which is true of
      any two writes landing in the same millisecond — and a record created and then
      saved once, which is what adding an item and typing into it is, does exactly
      that. The entry simply never appeared, with nothing anywhere to say so.
    */
    if (changes.length === 0) return;

    const before = this.entries.length;
    this.entries = appendEntry(this.entries, newEntry({ vaultId, label, changes: [...changes] }));
    // One in and none more out means the cap pushed the oldest off the front.
    if (this.entries.length === before) this.dropped += 1;
  }

  /** Newest first, which is how a change list reads. */
  forVault(vaultId: string): JournalEntry[] {
    return this.entries.filter((entry) => entry.vaultId === vaultId).reverse();
  }

  newest(vaultId: string, state: EntryState): JournalEntry | undefined {
    return this.forVault(vaultId).find((entry) => entry.state === state);
  }

  setState(entryId: string, state: EntryState): void {
    this.entries = this.entries.map((entry) =>
      entry.id === entryId ? { ...entry, state } : entry
    );
  }

  /**
   * Drops a course's entries.
   *
   * Deleting a course is not journalled, so nothing here could put it back — and every
   * entry that named one of its records is now an undo onto nothing. Leaving them
   * would fill the list with rows that can only ever refuse.
   */
  forget(vaultId: string): void {
    this.entries = this.entries.filter((entry) => entry.vaultId !== vaultId);
  }

  get limit(): number {
    return JOURNAL_LIMIT;
  }

  reset(): void {
    this.entries = [];
    this.dropped = 0;
    this.notice = null;
  }
}

export const journal = new Journal();
