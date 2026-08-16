import { newId, nowIso } from './ids';
import type { EntityType } from './validate';

/*
  What changed in this session, and the rules for putting a change back.

  Pure and storage-free on purpose: everything here is arithmetic over a list of
  entries, so the awkward parts — whether an entry can still be reverted, what a
  whole run of reverts would leave behind — can be tested without a database and
  without a renderer. `stores/undo.svelte.ts` supplies the storage side.

  WHOLE RECORDS, never field diffs. This app promises that a field it does not
  recognise round-trips untouched, and a diff over a `looseObject` is exactly where
  such a field gets dropped: the differ sees a key it has no rule for, and the
  cheapest thing it can do is the wrong thing. A before-image costs a few kilobytes
  and cannot be wrong.
*/

/**
 * A stored record, as the journal holds it.
 *
 * Deliberately not `Vault | Outcome | …`. The journal never reads anything but the
 * two fields below — it identifies a record and checks whether storage still holds
 * the version it remembers — and a union would invite code that branches on which
 * kind it got and then reaches for a field.
 */
export type JournalRecord = Record<string, unknown> & { id: string; updatedAt: string };

export interface Change {
  type: EntityType;
  id: string;
  /** The record as storage held it before the write. `null` when it did not exist. */
  before: JournalRecord | null;
  /** The record as storage held it after. `null` when the write removed it. */
  after: JournalRecord | null;
}

export type EntryState = 'applied' | 'reverted';

export interface JournalEntry {
  id: string;
  /** ISO timestamp, for the list. */
  at: string;
  vaultId: string;
  /** What the user did, in their words: "Deleted an item". */
  label: string;
  changes: Change[];
  /**
   * Which side of `changes` storage currently holds.
   *
   * Redo is not a second stack. An entry that has been reverted is still in the list,
   * in the same position, with this flipped — so redoing it is the same operation in
   * the other direction, and a new change further down clears nothing. Two stacks
   * would need a rule for what a new edit does to the redo one, and every such rule
   * throws work away that the user could still have wanted.
   */
  state: EntryState;
}

/**
 * How many entries are kept.
 *
 * The journal is memory only — see the note on `stores/journal.svelte.ts` — so this
 * is a bound on a session, not on a course. Whole before-images of a hundred writes
 * is a few megabytes at the very worst, and a session that has made more than a
 * hundred changes has long since stopped wanting the first one back.
 */
export const JOURNAL_LIMIT = 100;

export function newEntry(input: {
  vaultId: string;
  label: string;
  changes: Change[];
}): JournalEntry {
  return { id: newId(), at: nowIso(), state: 'applied', ...input };
}

/** Every record id an entry touches. The unit both the blocking rules work in. */
export function touchedIds(entry: JournalEntry): Set<string> {
  return new Set(entry.changes.map((change) => change.id));
}

/**
 * Applied entries newer than this one that touch any of the same records.
 *
 * Reverting out of order is allowed only when this comes back empty, which is
 * conservative and meant to be: a later applied entry is what storage currently
 * reflects for those ids, so putting an older version back would silently discard it.
 * Comparing whole records instead — "would this actually change anything?" — would be
 * cleverer and would still be wrong the moment the two entries edited different
 * fields of the same record, because the older before-image carries BOTH.
 */
export function blockedBy(
  entry: JournalEntry,
  entries: readonly JournalEntry[]
): JournalEntry[] {
  const position = entries.findIndex((candidate) => candidate.id === entry.id);
  if (position < 0) return [];

  const ids = touchedIds(entry);
  return entries
    .slice(position + 1)
    .filter(
      (later) =>
        later.state === 'applied' &&
        later.changes.some((change) => ids.has(change.id))
    );
}

/**
 * The whole run back to and including `entry`, newest first.
 *
 * This is what "Undo everything back to here" offers when `blockedBy` refuses a
 * single entry. Only applied entries are in it; one already reverted is skipped
 * rather than reverted twice.
 */
export function runBackTo(
  entry: JournalEntry,
  entries: readonly JournalEntry[]
): JournalEntry[] {
  const position = entries.findIndex((candidate) => candidate.id === entry.id);
  if (position < 0) return [];

  return entries
    .slice(position)
    .filter((candidate) => candidate.state === 'applied')
    .reverse();
}

/** One record to write, and what storage must already hold for it to be safe. */
export interface FlipStep {
  entryId: string;
  entryLabel: string;
  type: EntityType;
  id: string;
  /** What the entry says storage holds now. */
  expect: JournalRecord | null;
  /** What the flip writes. `null` removes the record. */
  write: JournalRecord | null;
}

/**
 * The writes that flipping these entries would perform, in the order given.
 *
 * Pass entries newest-first for a revert run: entry 8's revert restores what entry 5
 * left behind, so 5 must be undone after 8 rather than before it.
 */
export function planFlip(entries: readonly JournalEntry[]): FlipStep[] {
  return entries.flatMap((entry) =>
    entry.changes.map((change) => ({
      entryId: entry.id,
      entryLabel: entry.label,
      type: change.type,
      id: change.id,
      expect: entry.state === 'applied' ? change.after : change.before,
      write: entry.state === 'applied' ? change.before : change.after
    }))
  );
}

export interface Projection {
  /** Steps whose expectation does not match what storage would hold by then. */
  conflicts: FlipStep[];
  /** What each touched record would be left as. */
  final: Map<string, JournalRecord | null>;
}

/**
 * Plays the plan against storage without writing anything.
 *
 * Two answers from one pass, and both are needed BEFORE the first write. Checking
 * each step as it is reached would be simpler and would leave a half-applied run
 * behind the first refusal — which is the one outcome an undo feature must never
 * produce, because the user now has neither the old state nor the new one.
 *
 * The projection is what makes a multi-entry run checkable at all: within a run the
 * same record is often written twice, and the second write's expectation is the first
 * write's result rather than anything storage currently holds.
 */
export function project(
  steps: readonly FlipStep[],
  stored: ReadonlyMap<string, JournalRecord | null>
): Projection {
  const current = new Map<string, JournalRecord | null>();
  const conflicts: FlipStep[] = [];

  for (const step of steps) {
    const held = current.has(step.id) ? (current.get(step.id) ?? null) : (stored.get(step.id) ?? null);
    if (stampOf(held) !== stampOf(step.expect)) conflicts.push(step);
    current.set(step.id, step.write);
  }

  return { conflicts, final: current };
}

/**
 * A record's `updatedAt`, or `null` for a record that is not there.
 *
 * Comparing the stamp rather than the whole record is deliberate: a deep compare would
 * additionally report cosmetic differences in key order, which this codebase already
 * knows to ignore, and a false refusal is a refusal all the same.
 *
 * The stamp is millisecond-resolution, so two DIFFERENT versions written inside the
 * same millisecond compare equal. That is not a real risk here and it is worth knowing
 * why: the writes this check is guarding against are the ones the journal did not see
 * — an import, another tab — and an import carries the stamps from the bundle, which
 * came off a different machine at a different time. Two same-millisecond writes where
 * only one was journalled is not a thing this app can produce on its own.
 */
export function stampOf(record: JournalRecord | null): string | null {
  return record === null ? null : record.updatedAt;
}

/** A record and whatever owns it: an item's collection, an outcome's parent. */
export interface Owned {
  id: string;
  ownerId: string | null;
}

/**
 * Records that would be left with no owner.
 *
 * OWNERSHIP, not reference. An item whose collection is gone cannot be reached by any
 * screen in this app — items are only ever listed by collection — so undoing the
 * creation of a collection that now has questions in it has to be refused rather than
 * performed. A dangling `rubricId` is not in this category: the item is still there,
 * the notes panel says the reference is broken, and fixing it is one dropdown.
 *
 * Anything the same flip deletes is not an orphan; a run that removes the questions
 * and then the collection they were in is exactly the run this refusal offers.
 */
export function ownershipOrphans(
  deleting: ReadonlySet<string>,
  owned: readonly Owned[]
): string[] {
  return owned
    .filter(
      (record) =>
        record.ownerId !== null &&
        deleting.has(record.ownerId) &&
        !deleting.has(record.id)
    )
    .map((record) => record.id);
}

/** Appends an entry, dropping the oldest once the cap is reached. */
export function appendEntry(
  entries: readonly JournalEntry[],
  entry: JournalEntry,
  limit = JOURNAL_LIMIT
): JournalEntry[] {
  const next = [...entries, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
