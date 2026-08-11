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

/** How much of the grid is filled in. Drives the "12 of 16 cells written" hint. */
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
