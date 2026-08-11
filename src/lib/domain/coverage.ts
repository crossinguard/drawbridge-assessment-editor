import { criterionMax, flattenItems, itemPoints, type ScoringContext } from './points';
import { effectiveCriteria } from './rubrics';
import { leavesOf } from './outcomes';
import type { Collection, Item, Outcome } from './schema';

/*
  Coverage: which outcomes the assessments actually reach, and with how much weight.

  Two attribution decisions worth stating, because both are choices and neither is the
  only defensible one.

  1. An item aligned to three outcomes contributes its FULL points to each of them, not
     a third to each. The question this table answers is "how much assessment touches
     this outcome", and splitting the points would make a thoroughly-assessed outcome
     look neglected. A consequence is that outcome totals sum to more than the
     collection total whenever items are multiply aligned. That is expected.

  2. Within a single item, an outcome is counted ONCE even if it arrives by two routes
     — listed on the item and again on a criterion of the item's rubric. The larger of
     the two contributions wins.
*/

export interface CoverageEntry {
  /** Items in this collection that reach this outcome. */
  itemCount: number;
  points: number;
}

export interface CoverageCell extends CoverageEntry {
  outcomeId: string;
  collectionId: string;
}

export interface CoverageReport {
  /** Only non-empty pairs. A missing cell means no coverage. Iteration and CSV order. */
  cells: CoverageCell[];
  /**
   * The same cells keyed for lookup. The matrix view asks for every outcome × collection
   * pair, so scanning `cells` per lookup would make rendering quadratic in a vault
   * where both lists are already long.
   */
  index: ReadonlyMap<string, CoverageCell>;
  byOutcome: Map<string, CoverageEntry>;
  byCollection: Map<string, CoverageEntry>;
  /**
   * Leaf outcomes nothing assesses. Leaves only: a parent outcome is reached through
   * its children, so flagging it as well would bury the real gaps in noise.
   */
  uncoveredOutcomeIds: string[];
  /** Scorable items with no outcome alignment at all — the other side of the gap. */
  unalignedItemIds: string[];
  /** Alignments naming an outcome that does not exist in this vault. */
  danglingOutcomeIds: string[];
}

export interface CoverageInput {
  outcomes: readonly Outcome[];
  collections: readonly Collection[];
  /** Top-level items per collection id. Group parts are reached through their parent. */
  itemsByCollection: ReadonlyMap<string, readonly Item[]>;
  context: ScoringContext;
}

/*
  Length-prefixed so the two halves cannot be confused for one another. Ids are
  generated as uuids but imported ones are arbitrary strings, so any plain separator
  is one hand-edited id away from a collision that would silently merge two cells.
*/
const cellKey = (outcomeId: string, collectionId: string) =>
  `${outcomeId.length}:${outcomeId}:${collectionId}`;

/**
 * What one item contributes, as outcome id → points.
 *
 * Direct alignments carry the item's own points. Alignments that come from the
 * criteria of an attached rubric carry that criterion's maximum, which is more precise
 * than spreading the whole rubric total across every outcome it mentions.
 */
function contributionsOf(item: Item, context: ScoringContext): Map<string, number> {
  const contributions = new Map<string, number>();
  const record = (outcomeId: string, points: number) => {
    contributions.set(outcomeId, Math.max(contributions.get(outcomeId) ?? 0, points));
  };

  const own = itemPoints(item, context).points;
  for (const outcomeId of item.outcomeIds) record(outcomeId, own);

  if (item.rubricId !== undefined) {
    const rubric = context.rubricsById.get(item.rubricId);
    if (rubric) {
      // Effective, not own: an outcome aligned only on a criterion the rubric inherits
      // from a tail is still assessed, and reading it as a gap would send the author
      // looking for a hole that is not there.
      for (const { criterion, source } of effectiveCriteria(rubric, context.rubricsById)) {
        const max = criterionMax(criterion, source.levels);
        for (const outcomeId of criterion.outcomeIds) record(outcomeId, max);
      }
    }
  }

  return contributions;
}

export function computeCoverage(input: CoverageInput): CoverageReport {
  const { outcomes, collections, itemsByCollection, context } = input;

  const knownOutcomeIds = new Set(outcomes.map((outcome) => outcome.id));
  const cells = new Map<string, CoverageCell>();
  const unalignedItemIds: string[] = [];
  const danglingOutcomeIds = new Set<string>();

  const add = (outcomeId: string, collectionId: string, points: number, items: number) => {
    const key = cellKey(outcomeId, collectionId);
    const existing = cells.get(key);
    if (existing) {
      existing.itemCount += items;
      existing.points += points;
    } else {
      cells.set(key, { outcomeId, collectionId, itemCount: items, points });
    }
  };

  for (const collection of collections) {
    const topLevel = itemsByCollection.get(collection.id) ?? [];

    // Flattened, because a group's parts carry their own alignments and a part that
    // assesses an outcome its parent does not mention still covers that outcome.
    for (const item of flattenItems(topLevel)) {
      const contributions = contributionsOf(item, context);

      for (const [outcomeId, points] of contributions) {
        if (!knownOutcomeIds.has(outcomeId)) {
          danglingOutcomeIds.add(outcomeId);
          continue;
        }
        add(outcomeId, collection.id, points, 1);
      }

      // A stimulus is not answered and a group is a container, so neither is a gap.
      const expectsAlignment = item.kind !== 'stimulus' && item.kind !== 'group';
      if (expectsAlignment && contributions.size === 0) unalignedItemIds.push(item.id);
    }

    // A collection scored by one rubric covers whatever its criteria name, with no item
    // standing behind it — hence itemCount 0. Without this, a rubric-assessed task
    // would read as covering nothing.
    if (collection.rubricId !== undefined) {
      const rubric = context.rubricsById.get(collection.rubricId);
      const composed = rubric ? effectiveCriteria(rubric, context.rubricsById) : [];
      for (const { criterion, source } of composed) {
        const max = criterionMax(criterion, source.levels);
        for (const outcomeId of criterion.outcomeIds) {
          if (!knownOutcomeIds.has(outcomeId)) {
            danglingOutcomeIds.add(outcomeId);
            continue;
          }
          add(outcomeId, collection.id, max, 0);
        }
      }
    }
  }

  const byOutcome = new Map<string, CoverageEntry>();
  const byCollection = new Map<string, CoverageEntry>();
  for (const cell of cells.values()) {
    const outcomeTotal = byOutcome.get(cell.outcomeId) ?? { itemCount: 0, points: 0 };
    outcomeTotal.itemCount += cell.itemCount;
    outcomeTotal.points += cell.points;
    byOutcome.set(cell.outcomeId, outcomeTotal);

    const collectionTotal = byCollection.get(cell.collectionId) ?? { itemCount: 0, points: 0 };
    collectionTotal.itemCount += cell.itemCount;
    collectionTotal.points += cell.points;
    byCollection.set(cell.collectionId, collectionTotal);
  }

  const uncoveredOutcomeIds = leavesOf(outcomes)
    .filter((outcome) => !byOutcome.has(outcome.id))
    .map((outcome) => outcome.id);

  return {
    cells: [...cells.values()],
    index: cells,
    byOutcome,
    byCollection,
    uncoveredOutcomeIds,
    unalignedItemIds,
    danglingOutcomeIds: [...danglingOutcomeIds]
  };
}

/**
 * Coverage for one outcome × collection pair, zeroed when there is none.
 *
 * Returns a bare `CoverageEntry` even when a cell exists, so a caller comparing two
 * lookups is never comparing a four-field object against a two-field one.
 */
export function coverageAt(
  report: CoverageReport,
  outcomeId: string,
  collectionId: string
): CoverageEntry {
  const cell = report.index.get(cellKey(outcomeId, collectionId));
  return cell
    ? { itemCount: cell.itemCount, points: cell.points }
    : { itemCount: 0, points: 0 };
}
