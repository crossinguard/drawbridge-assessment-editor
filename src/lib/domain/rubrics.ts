import { newId } from './ids';
import type { Criterion, Level, LevelSet, Rubric } from './schema';

/*
  Pure rubric operations.

  Everything here exists because `Criterion.descriptors` is keyed by LEVEL ID. That one
  fact makes changing a rubric's levels the most destructive thing in the app: get it
  wrong and a grid someone spent an afternoon writing comes back blank, with no error
  and nothing to undo. Every function below is about not doing that.

  `Criterion.levelPoints` is keyed the same way and so carries the same hazard, with a
  worse failure mode: a lost descriptor is visibly missing, whereas a lost points
  override just makes the total quietly smaller. Every function here handles the two
  together, and any future one has to as well.

  THE LINE THAT MATTERS SINCE STAGE 16: `applyLevels`, `withoutLevel` and
  `descriptorCoverage` operate on `rubric.criteria` — the rubric's OWN criteria — and
  must never be handed the output of `effectiveCriteria`. An inherited criterion belongs
  to a different record, and rewriting its descriptors from a screen that is not editing
  it would silently change every other rubric sharing that tail. The temptation is real
  because "make the grid editor work on the whole grid" sounds like a fix.
*/

export function newLevel(name = '', points = 0): Level {
  return { id: newId(), name, points };
}

export function newCriterion(order: number): Criterion {
  return { id: newId(), title: '', order, outcomeIds: [], descriptors: {}, levelPoints: {} };
}

/** A level set's levels, copied with fresh ids so the rubric owns them outright. */
export function levelsFromSet(levelSet: LevelSet, generate: () => string = newId): Level[] {
  return levelSet.levels.map((level) => ({ ...level, id: generate() }));
}

/** What a level change would discard. Descriptors and overrides are counted apart
 *  because they read differently in a warning: one is writing, the other is a total. */
export interface Dropped {
  descriptors: number;
  points: number;
}

/**
 * Replaces a rubric's levels, carrying descriptors and points overrides across BY
 * POSITION.
 *
 * Positional rather than by id, because the incoming levels are new objects with new
 * ids — matching on id would find nothing and blank the whole grid. Position is the
 * only correspondence available, and it is the right one in practice: swapping a
 * four-point scale for a differently-named four-point scale should keep the text that
 * was written for "best", "second best" and so on.
 *
 * A points override travels with its descriptor for the same reason. Carrying the text
 * and leaving the number behind would keep the grid looking right while changing what
 * it is worth, which is the worst of the two outcomes.
 *
 * Anything past the end of the new level list is dropped, because there is nowhere for
 * it to go. `dropped` reports how much of each, so the UI can warn BEFORE the user
 * commits rather than apologising afterwards.
 */
export function applyLevels(
  rubric: Rubric,
  levels: readonly Level[]
): { rubric: Rubric; dropped: Dropped } {
  const oldLevels = rubric.levels;
  const dropped: Dropped = { descriptors: 0, points: 0 };

  const criteria = rubric.criteria.map((criterion) => {
    const descriptors: Record<string, string> = {};
    const levelPoints: Record<string, number> = {};

    oldLevels.forEach((oldLevel, index) => {
      const replacement = levels[index];

      const text = criterion.descriptors[oldLevel.id];
      if (text !== undefined && text !== '') {
        if (replacement) descriptors[replacement.id] = text;
        else dropped.descriptors += 1;
      }

      const points = criterion.levelPoints[oldLevel.id];
      if (points !== undefined) {
        if (replacement) levelPoints[replacement.id] = points;
        else dropped.points += 1;
      }
    });

    return { ...criterion, descriptors, levelPoints };
  });

  return { rubric: { ...rubric, levels: [...levels], criteria }, dropped };
}

/**
 * Removes a level, everything written for it and everything it was worth.
 *
 * Both records have to be pruned: keyed by an id no level has any more, they are
 * unreachable but still present, and they would reappear as noise the moment anything
 * iterated the record — or be silently re-adopted if that id ever came back.
 */
export function withoutLevel(rubric: Rubric, levelId: string): Rubric {
  return {
    ...rubric,
    levels: rubric.levels.filter((level) => level.id !== levelId),
    criteria: rubric.criteria.map((criterion) => {
      const descriptors = { ...criterion.descriptors };
      const levelPoints = { ...criterion.levelPoints };
      delete descriptors[levelId];
      delete levelPoints[levelId];
      return { ...criterion, descriptors, levelPoints };
    })
  };
}

// ---------------------------------------------------------------------------
// Shared tails
// ---------------------------------------------------------------------------

/**
 * A criterion as it appears in a composed grid, together with the rubric it came from.
 *
 * The source is carried because scoring needs it, not for display. See
 * `effectiveCriteria` for why nothing may score a criterion against the host's levels.
 */
export interface EffectiveCriterion {
  criterion: Criterion;
  /** The rubric that owns this criterion — the host itself when `inherited` is false. */
  source: Rubric;
  inherited: boolean;
}

/**
 * How deep a chain of tails may run before it is treated as a mistake.
 *
 * The `seen` set below already makes termination guaranteed, so this is not there to
 * stop an infinite loop. It stops a pathological-but-acyclic chain — a hundred rubrics
 * each appending the next — from making every points calculation on screen walk a
 * hundred records. Eight is far past any real use of a boilerplate tail.
 */
const MAX_APPEND_DEPTH = 8;

/**
 * A rubric's own criteria, then those of every rubric it appends, in order.
 *
 * **Each criterion carries the rubric it came from, and must be scored against THAT
 * rubric's levels.** This is the decision the whole feature rests on. `criterionMax`
 * resolves `levelPoints` through `pointsAt`, which is keyed by level id — and a tail's
 * overrides are keyed by the TAIL's level ids. Score a tail criterion against the
 * host's levels and every lookup misses: the overrides silently fall back to the host's
 * column points and every descriptor renders blank, with no error anywhere.
 *
 * It is also the answer that matches what anyone expects. A 2-point complete/incomplete
 * tail on a 4-point rubric adds 2, not 4.
 *
 * Robust rather than strict, like everything else that reads a reference here: an
 * append naming a rubric that no longer exists is skipped, and a cycle stops at the
 * repeat instead of throwing. `validate.ts` reports both — a half-written course must
 * still open, and this runs on every screen that shows a total.
 */
export function effectiveCriteria(
  rubric: Rubric,
  rubricsById: ReadonlyMap<string, Rubric>
): EffectiveCriterion[] {
  const out: EffectiveCriterion[] = [];
  const seen = new Set<string>();

  const walk = (current: Rubric, inherited: boolean, depth: number) => {
    if (seen.has(current.id) || depth > MAX_APPEND_DEPTH) return;
    seen.add(current.id);

    for (const criterion of inOrder(current.criteria)) {
      out.push({ criterion, source: current, inherited });
    }

    for (const appendedId of current.appends) {
      const tail = rubricsById.get(appendedId);
      if (tail) walk(tail, true, depth + 1);
    }
  };

  walk(rubric, false, 0);
  return out;
}

/** Criteria sorted the way every screen and document shows them. */
function inOrder(criteria: readonly Criterion[]): Criterion[] {
  return [...criteria].sort((a, b) => a.order - b.order);
}

/**
 * Would following this rubric's appends lead back to itself?
 *
 * `effectiveCriteria` already survives a cycle, so this exists only so `validate.ts` can
 * say so out loud. A cycle is not harmless just because it terminates: half the tail
 * silently goes missing, because whichever rubric was reached first claims the criteria
 * and the second visit is skipped.
 */
export function hasAppendCycle(
  rubric: Rubric,
  rubricsById: ReadonlyMap<string, Rubric>
): boolean {
  const seen = new Set<string>();

  const reaches = (id: string, depth: number): boolean => {
    if (id === rubric.id) return true;
    if (seen.has(id) || depth > MAX_APPEND_DEPTH) return false;
    seen.add(id);
    const next = rubricsById.get(id);
    return next ? next.appends.some((id) => reaches(id, depth + 1)) : false;
  };

  return rubric.appends.some((id) => reaches(id, 0));
}

/**
 * Which rubrics use this one as a tail.
 *
 * Drives the list badge and the delete confirmation. Deleting a rubric that three
 * others append quietly shortens three grids, so the count has to be in the question.
 */
export function rubricsAppending(
  rubricId: string,
  all: readonly Rubric[]
): Rubric[] {
  return all.filter((rubric) => rubric.appends.includes(rubricId));
}

/**
 * How much of the grid is filled in. Drives the "12 of 16 cells written" hint.
 *
 * The rubric's OWN criteria only. An inherited row is another record's responsibility
 * and is reported on that rubric's own screen; counting it here would tell the author
 * their grid is incomplete because of cells they cannot reach from it.
 */
export function descriptorCoverage(rubric: Rubric): { written: number; total: number } {
  const total = rubric.levels.length * rubric.criteria.length;
  let written = 0;
  for (const criterion of rubric.criteria) {
    for (const level of rubric.levels) {
      if ((criterion.descriptors[level.id] ?? '').trim() !== '') written += 1;
    }
  }
  return { written, total };
}

/**
 * Does this rubric's level list match a set defined in vault config?
 *
 * Compared on names and points, not ids — the rubric's levels are always copies with
 * their own ids, so an id comparison would never match anything.
 */
export function matchingLevelSet(
  rubric: Rubric,
  levelSets: readonly LevelSet[]
): LevelSet | undefined {
  const shape = (levels: readonly Level[]) =>
    JSON.stringify(levels.map((level) => [level.name, level.points]));

  const target = shape(rubric.levels);
  return levelSets.find((set) => shape(set.levels) === target);
}
