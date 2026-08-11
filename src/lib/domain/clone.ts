import type { Collection, Criterion, Item, Outcome, Rubric, VaultSnapshot } from './schema';

/*
  Copying a course.

  The heavy lifting is already done elsewhere: `importVault(_, 'new')` routes through
  `remapSnapshotIds`, so a snapshot handed to it comes back with every id rewritten and
  every reference re-pointed. There is exactly ONE remapper in this codebase and this
  file does not become a second one.

  What is left is what a copy means, which is not what a restore means. Three things
  differ from a round trip:

  1. The code must change. It is indexed, and it is the fallback key a merge-import
     matches on, so two vaults sharing a code make a later merge pick an arbitrary row.
     That is a correctness requirement, not a nicety — see `codeIsTaken`.
  2. The timestamps are new. A clone is work starting today, not a backup of work done
     in March.
  3. Content is optional and settings are not. `VaultConfig` always comes across whole —
     that is the entire point of cloning rather than starting fresh — while outcomes,
     rubrics, collections and items each come or do not.

  Everything here is pure, so the combinations can be enumerated in a test rather than
  reasoned about. There are sixteen and `clone.test.ts` runs all of them.
*/

export interface CloneInclude {
  outcomes: boolean;
  rubrics: boolean;
  collections: boolean;
  /** Ignored unless `collections` is also true — an item with no collection is unreachable. */
  items: boolean;
}

export interface CloneOptions {
  name: string;
  code: string;
  term?: string;
  include: CloneInclude;
  /** Injected rather than read from the clock, so the result is a pure function of input. */
  now: string;
}

/**
 * Is this code already in use?
 *
 * Compared case-insensitively, which is deliberately stricter than the index that makes
 * this matter: Dexie's `where('code').equals()` is case-sensitive, so `stat101` and
 * `STAT101` would not actually collide on a merge. They would still be the same course
 * to the person reading the list, and a copy that looks like a duplicate is a bad enough
 * outcome on its own.
 */
export function codeIsTaken(code: string, existing: readonly { code: string }[]): boolean {
  const wanted = code.trim().toLowerCase();
  if (wanted === '') return false;
  return existing.some((vault) => vault.code.trim().toLowerCase() === wanted);
}

/**
 * A code not yet in use, derived from one that is — `STAT101` → `STAT101-2`.
 *
 * A suggestion, not a rule: the field stays editable and the form still refuses a
 * duplicate. It exists so the commonest answer is already typed in.
 */
export function suggestCode(code: string, existing: readonly { code: string }[]): string {
  const base = code.trim().replace(/-\d+$/, '');
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!codeIsTaken(candidate, existing)) return candidate;
  }
  return '';
}

/** Applies new timestamps. A clone is new work, so both dates move, not just one. */
function restamp<T extends { createdAt: string; updatedAt: string }>(record: T, now: string): T {
  return { ...record, createdAt: now, updatedAt: now };
}

/**
 * Strips references to things that are not coming, all the way down a group's parts.
 *
 * The alternative is a new course that opens red. Dangling references are `error`
 * severity — correctly, since they are broken — and a first impression of "this copy
 * arrived damaged" is worth more than the handful of ids it would have preserved.
 */
function cleanItem(item: Item, include: CloneInclude, now: string): Item {
  const cleaned: Item = {
    ...restamp(item, now),
    parts: item.parts.map((part) => cleanItem(part, include, now))
  };

  if (!include.outcomes) cleaned.outcomeIds = [];
  if (!include.rubrics) delete cleaned.rubricId;
  return cleaned;
}

function cleanCriterion(criterion: Criterion, include: CloneInclude): Criterion {
  return include.outcomes ? criterion : { ...criterion, outcomeIds: [] };
}

function cleanCollection(
  collection: Collection,
  include: CloneInclude,
  now: string
): Collection {
  const cleaned = restamp(collection, now);
  if (!include.rubrics) delete cleaned.rubricId;

  /*
    A declared total describes items that are not coming with it. Carried forward onto
    an empty shell it is a statement about content that does not exist, and it reports
    itself as a points mismatch on the new course's first screen. The structure is what
    was asked for; the number belonged to the questions.
  */
  if (!include.items) delete cleaned.declaredPoints;

  return cleaned;
}

/**
 * A copy of this course, carrying as much of it as was asked for.
 *
 * Returns a snapshot with the ORIGINAL ids still in place. It is meant to be handed
 * straight to `importVault(_, 'new')`, which is what rewrites them — doing it here would
 * be the second remapper this file exists not to be.
 */
export function cloneSnapshot(snapshot: VaultSnapshot, options: CloneOptions): VaultSnapshot {
  const { include, now } = options;

  // Items without their collections would be unreachable, so the combination is not
  // merely discouraged here, it is impossible. The UI disables it as well; this is the
  // half that holds when the UI is wrong.
  const keepItems = include.collections && include.items;

  const vault = {
    ...restamp(snapshot.vault, now),
    name: options.name,
    code: options.code
  };
  if (options.term === undefined || options.term === '') delete vault.term;
  else vault.term = options.term;

  const outcomes: Outcome[] = include.outcomes
    ? snapshot.outcomes.map((outcome) => restamp(outcome, now))
    : [];

  const rubrics: Rubric[] = include.rubrics
    ? snapshot.rubrics.map((rubric) => ({
        ...restamp(rubric, now),
        criteria: rubric.criteria.map((criterion) => cleanCriterion(criterion, include))
      }))
    : [];

  const collections: Collection[] = include.collections
    ? snapshot.collections.map((collection) => cleanCollection(collection, include, now))
    : [];

  const items: Item[] = keepItems
    ? snapshot.items.map((item) => cleanItem(item, include, now))
    : [];

  return { vault, outcomes, collections, items, rubrics };
}
