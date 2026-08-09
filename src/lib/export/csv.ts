import { computeCoverage, coverageAt } from '$lib/domain/coverage';
import { inOrder } from '$lib/domain/items';
import { buildTree, isLeaf, unreachableOutcomes, walkTree } from '$lib/domain/outcomes';
import { itemPoints } from '$lib/domain/points';
import type { Collection, Item, Outcome, VaultSnapshot } from '$lib/domain/schema';
import {
  documentGroups,
  labelOf,
  oneLine,
  outcomeCode,
  partNumber,
  round,
  type ReadableContext
} from './readable';

/*
  The two flat tables a bundle carries: every item in one, outcome coverage in the
  other. These are for pivoting, sorting and counting — the things a spreadsheet is
  good at and a Markdown document is not.

  Neither is read back. JSON is the lossless form, which is what licenses the one
  liberty taken here: a stem is collapsed onto a single line. A multi-paragraph
  question with its own bullet list is unusable in a cell either way, and a CSV whose
  rows are not rows is worse than one that has abbreviated.
*/

/*
  A UTF-8 byte-order mark.

  This app has to work on a locked-down Windows work machine, and Excel there still
  reads a BOM-less UTF-8 CSV as the system code page — so "Café" opens as "CafÃ©" and
  an em dash becomes junk. Every other reader of consequence (pandas, R, csvkit,
  LibreOffice, Numbers) skips the mark. Mojibake in the file an instructor actually
  double-clicks is the more expensive of the two failures.

  Written as an escape, never as the character. A literal U+FEFF in source is
  invisible in an editor and in a diff, which is how this class of bug survives review.
*/
export const BOM = '\ufeff';

/** CRLF, per RFC 4180 — and what Excel expects. */
const EOL = '\r\n';

/**
 * One field, quoted only when it has to be.
 *
 * Values are written through untouched otherwise. It is tempting to defuse the
 * leading `=` that Excel would treat as a formula, but the fix is to prefix the cell
 * with an apostrophe, which corrupts the data — and in a statistics course `=MEAN(x)`
 * is a plausible thing to have written in a stem. Faithfulness wins; the JSON beside
 * it agrees.
 */
function field(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  const mustQuote = /["\r\n,]/.test(text) || text !== text.trim();
  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(field).join(','));
  return BOM + lines.join(EOL) + EOL;
}

// ---------------------------------------------------------------------------
// items.csv
// ---------------------------------------------------------------------------

const ITEM_HEADER = [
  'number',
  'id',
  'collection',
  'collectionId',
  'section',
  'kind',
  'parentId',
  'stem',
  'outcomes',
  'points',
  'pointsSource',
  'pointsAreMaximum',
  'status',
  'tags'
] as const;

function itemRows(
  item: Item,
  number: string,
  collection: Collection,
  sectionTitle: string,
  parentId: string,
  context: ReadableContext
): unknown[][] {
  const points = itemPoints(item, context.scoring);
  const config = context.vault.config;

  const row = [
    number,
    item.id,
    collection.title,
    collection.id,
    sectionTitle,
    item.kind,
    parentId,
    oneLine(item.stem),
    item.outcomeIds.map((outcomeId) => outcomeCode(context, outcomeId)).join(' '),
    round(points.points),
    points.source,
    points.isMaximum,
    labelOf(config.statuses, item.status),
    Object.entries(item.tags)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => `${labelOf(config.tagDimensions, key)}: ${value}`)
      .join('; ')
  ];

  return [
    row,
    // A group's parts get their own rows, keyed back to the parent. Their points are
    // already inside the parent's total, so summing this column double-counts them —
    // `parentId` is how a pivot filters them out.
    ...inOrder(item.parts).flatMap((part, index) =>
      itemRows(part, partNumber(number, index), collection, sectionTitle, item.id, context)
    )
  ];
}

/**
 * Every item in the vault, flattened: `items.csv`.
 *
 * Rows follow the same order and carry the same numbering as the Markdown documents,
 * so "question 4" means the same thing in both.
 */
export function itemsCsv(snapshot: VaultSnapshot, context: ReadableContext): string {
  const rows: unknown[][] = [];

  for (const collection of orderedCollections(snapshot.collections)) {
    const owned = snapshot.items.filter((item) => item.collectionId === collection.id);
    let number = 0;

    for (const group of documentGroups(collection, owned)) {
      const sectionTitle = group.section?.title ?? '';
      for (const item of group.items) {
        number += 1;
        rows.push(...itemRows(item, `${number}.`, collection, sectionTitle, '', context));
      }
    }
  }

  return toCsv(ITEM_HEADER, rows);
}

// ---------------------------------------------------------------------------
// coverage.csv
// ---------------------------------------------------------------------------

const COVERAGE_HEADER = [
  'outcomeCode',
  'outcomeText',
  'outcomeId',
  'outcomeIsLeaf',
  'collection',
  'collectionKind',
  'collectionId',
  'items',
  'points'
] as const;

/**
 * Outcome × collection, one row per pair that has anything in it: `coverage.csv`.
 *
 * An outcome nothing assesses still gets a row, with the collection columns blank and
 * zeros in the counts — otherwise the most important fact in the file would be its
 * only invisible one. `outcomeIsLeaf` is what tells a real gap from a parent that is
 * covered through its children, which is the same distinction the app's matrix draws
 * and the reason it does not flag every branch node as a problem.
 *
 * Points are attributed in full to each outcome an item names, never divided between
 * them, so this column sums to more than the course is worth whenever items are
 * aligned to more than one outcome. That is the intended reading: the question is how
 * much assessment touches an outcome, not how to split a mark.
 */
export function coverageCsv(snapshot: VaultSnapshot, context: ReadableContext): string {
  const collections = orderedCollections(snapshot.collections);

  const itemsByCollection = new Map<string, Item[]>(
    collections.map((collection) => [
      collection.id,
      snapshot.items.filter((item) => item.collectionId === collection.id)
    ])
  );

  const report = computeCoverage({
    outcomes: snapshot.outcomes,
    collections,
    itemsByCollection,
    context: context.scoring
  });

  const kinds = context.vault.config.collectionKinds;
  const rows: unknown[][] = [];

  for (const outcome of orderedOutcomes(snapshot.outcomes)) {
    const leaf = isLeaf(snapshot.outcomes, outcome.id);
    const head = [outcome.code, oneLine(outcome.text), outcome.id, leaf];
    let covered = false;

    for (const collection of collections) {
      const entry = coverageAt(report, outcome.id, collection.id);
      if (entry.itemCount === 0 && entry.points === 0) continue;
      covered = true;
      rows.push([
        ...head,
        collection.title,
        labelOf(kinds, collection.kind),
        collection.id,
        entry.itemCount,
        round(entry.points)
      ]);
    }

    if (!covered) rows.push([...head, '', '', '', 0, 0]);
  }

  return toCsv(COVERAGE_HEADER, rows);
}

// ---------------------------------------------------------------------------

function orderedCollections(collections: readonly Collection[]): Collection[] {
  return [...collections].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title, undefined, { numeric: true })
  );
}

/**
 * Outcomes in tree order, with anything the tree cannot reach appended.
 *
 * A `parentId` cycle — which a bad merge can produce — makes an outcome unreachable
 * from the roots. `buildTree` drops those rather than hanging; leaving them out of the
 * coverage table as well would hide exactly the records that need attention.
 */
function orderedOutcomes(outcomes: readonly Outcome[]): Outcome[] {
  const reachable = walkTree(buildTree(outcomes)).map((node) => node.outcome);
  return [...reachable, ...unreachableOutcomes(outcomes)];
}
