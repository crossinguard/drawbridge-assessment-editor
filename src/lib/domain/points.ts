import type { Collection, Criterion, Item, Level, Rubric } from './schema';

/*
  Points arithmetic.

  The one rule people get wrong, stated plainly: a rubric criterion is worth its BEST
  level, not the sum of its levels, because the levels are alternatives — a response is
  Exemplary or Proficient, never both. A multi-part item is the opposite: it IS the sum
  of its parts, because the parts all get answered.

  Everything returns a `PointsResult` rather than a bare number so the UI can say where
  a total came from and, crucially, whether it is a ceiling. "Worth up to 4 pt" and
  "worth 4 pt" mean different things to someone building an exam.
*/

export type PointsSource =
  /** The author typed a number. It wins over anything derivable. */
  | 'explicit'
  /** Derived from an attached rubric's total. */
  | 'rubric'
  /** Sum of a group's parts. */
  | 'parts'
  /** Structurally unscorable — a stimulus passage. */
  | 'unscored'
  /** Scorable, but nobody has said what it is worth yet. */
  | 'undeclared';

export interface PointsResult {
  points: number;
  source: PointsSource;
  /**
   * True when `points` is a ceiling rather than a fixed value — anything rubric-scored,
   * and any group containing something rubric-scored. Drives "worth up to N pt".
   */
  isMaximum: boolean;
}

export interface ScoringContext {
  rubricsById: ReadonlyMap<string, Rubric>;
}

/** Convenience for callers that only need the number. */
export function pointsOf(result: PointsResult): number {
  return result.points;
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

/**
 * What one criterion scores at one level.
 *
 * The level's own `points` is the column default; `criterion.levelPoints` overrides it
 * per cell, which is how Thesis runs 10/7/4 on the same grid where Mechanics runs
 * 4/3/2. Absent means "inherit the column", never zero — an override of 0 is a real
 * value a level list can legitimately hold, so the two have to stay distinguishable.
 */
export function pointsAt(criterion: Criterion, level: Level): number {
  const override = criterion.levelPoints[level.id];
  return override === undefined ? level.points : override;
}

/**
 * What a single criterion is worth: its best level.
 *
 * Computed as the maximum rather than by reading `levels[0]`, even though levels are
 * ordered best-first by convention. The two agree whenever the convention holds, and
 * when it does not — a user drags a level out of order in the grid editor, or writes a
 * set of overrides that do not descend — the maximum is still the honest answer to
 * "what is the best this can score".
 */
export function criterionMax(criterion: Criterion, levels: Rubric['levels']): number {
  if (levels.length === 0) return 0;
  return levels.reduce((best, level) => Math.max(best, pointsAt(criterion, level)), -Infinity);
}

/**
 * A rubric total is the sum of its criteria maxima.
 *
 * `Criterion.weight` is deliberately NOT applied here, and now never will be: per-level
 * overrides say the same thing outright and in the unit the reader already understands,
 * so a multiplier layered on top would be a second way to express one idea and a way
 * for the two to disagree. Weight is carried as metadata; `validate.ts` raises an
 * info-level note when it is set so the gap is visible rather than silent.
 */
export function rubricTotal(rubric: Rubric): number {
  return rubric.criteria.reduce(
    (total, criterion) => total + criterionMax(criterion, rubric.levels),
    0
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function itemPoints(item: Item, context: ScoringContext): PointsResult {
  /*
    A stimulus is checked before the explicit value on purpose. It is a passage or a
    data table that other items read from — it is not answered, so it cannot be worth
    anything, and letting a stray `points` on one inflate a collection total would be a
    quietly wrong number on an exam. Validation surfaces the ignored value instead.
  */
  if (item.kind === 'stimulus') {
    return { points: 0, source: 'unscored', isMaximum: false };
  }

  if (item.points !== undefined) {
    return { points: item.points, source: 'explicit', isMaximum: false };
  }

  if (item.rubricId !== undefined) {
    const rubric = context.rubricsById.get(item.rubricId);
    // A dangling rubricId scores zero rather than throwing; validate.ts reports it.
    return {
      points: rubric ? rubricTotal(rubric) : 0,
      source: 'rubric',
      isMaximum: true
    };
  }

  if (item.kind === 'group') {
    const parts = item.parts.map((part) => itemPoints(part, context));
    return {
      points: parts.reduce((total, part) => total + part.points, 0),
      source: 'parts',
      // A group is a ceiling if any part of it is.
      isMaximum: parts.some((part) => part.isMaximum)
    };
  }

  return { points: 0, source: 'undeclared', isMaximum: false };
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * A collection total is the sum of its TOP-LEVEL items.
 *
 * `items` must therefore be the collection's own items, not a flattened tree — a
 * group's parts are already counted inside the group, and passing them in alongside
 * would double every nested point.
 */
export function collectionPoints(
  collection: Collection,
  items: readonly Item[],
  context: ScoringContext
): PointsResult {
  // A rubric on the collection itself scores the whole thing; its items are then
  // structure rather than score.
  if (collection.rubricId !== undefined) {
    const rubric = context.rubricsById.get(collection.rubricId);
    return {
      points: rubric ? rubricTotal(rubric) : 0,
      source: 'rubric',
      isMaximum: true
    };
  }

  const scored = items.map((item) => itemPoints(item, context));
  return {
    points: scored.reduce((total, item) => total + item.points, 0),
    source: 'parts',
    isMaximum: scored.some((item) => item.isMaximum)
  };
}

/** Every item in a tree, parents before their parts. Useful for flattening and search. */
export function flattenItems(items: readonly Item[]): Item[] {
  return items.flatMap((item) => [item, ...flattenItems(item.parts)]);
}

/**
 * Phrasing helper, so the "up to" wording is written once and cannot drift between
 * the item card, the collection header and the export.
 */
export function describePoints(result: PointsResult, unit = 'pt'): string {
  const rounded = Math.round(result.points * 100) / 100;
  return result.isMaximum ? `up to ${rounded} ${unit}` : `${rounded} ${unit}`;
}
