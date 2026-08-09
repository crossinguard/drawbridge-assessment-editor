import { newId } from './ids';
import type { Criterion, Level, LevelSet, Rubric } from './schema';

/*
  Pure rubric operations.

  Everything here exists because `Criterion.descriptors` is keyed by LEVEL ID. That one
  fact makes changing a rubric's levels the most destructive thing in the app: get it
  wrong and a grid someone spent an afternoon writing comes back blank, with no error
  and nothing to undo. Every function below is about not doing that.
*/

export function newLevel(name = '', points = 0): Level {
  return { id: newId(), name, points };
}

export function newCriterion(order: number): Criterion {
  return { id: newId(), title: '', order, outcomeIds: [], descriptors: {} };
}

/** A level set's levels, copied with fresh ids so the rubric owns them outright. */
export function levelsFromSet(levelSet: LevelSet, generate: () => string = newId): Level[] {
  return levelSet.levels.map((level) => ({ ...level, id: generate() }));
}

/**
 * Replaces a rubric's levels, carrying descriptors across BY POSITION.
 *
 * Positional rather than by id, because the incoming levels are new objects with new
 * ids — matching on id would find nothing and blank the whole grid. Position is the
 * only correspondence available, and it is the right one in practice: swapping a
 * four-point scale for a differently-named four-point scale should keep the text that
 * was written for "best", "second best" and so on.
 *
 * Descriptors past the end of the new level list are dropped, because there is nowhere
 * for them to go. `droppedDescriptors` reports how many, so the UI can warn BEFORE the
 * user commits rather than apologising afterwards.
 */
export function applyLevels(
  rubric: Rubric,
  levels: readonly Level[]
): { rubric: Rubric; droppedDescriptors: number } {
  const oldLevels = rubric.levels;
  let dropped = 0;

  const criteria = rubric.criteria.map((criterion) => {
    const descriptors: Record<string, string> = {};

    oldLevels.forEach((oldLevel, index) => {
      const text = criterion.descriptors[oldLevel.id];
      if (text === undefined || text === '') return;

      const replacement = levels[index];
      if (replacement) descriptors[replacement.id] = text;
      else dropped += 1;
    });

    return { ...criterion, descriptors };
  });

  return { rubric: { ...rubric, levels: [...levels], criteria }, droppedDescriptors: dropped };
}

/**
 * Removes a level and every descriptor written for it.
 *
 * The descriptors have to go: keyed by an id no level has any more, they are
 * unreachable but still present, and they would reappear as noise the moment anything
 * iterated the record — or be silently re-adopted if that id ever came back.
 */
export function withoutLevel(rubric: Rubric, levelId: string): Rubric {
  return {
    ...rubric,
    levels: rubric.levels.filter((level) => level.id !== levelId),
    criteria: rubric.criteria.map((criterion) => {
      const descriptors = { ...criterion.descriptors };
      delete descriptors[levelId];
      return { ...criterion, descriptors };
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
