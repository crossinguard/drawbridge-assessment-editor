import { inOrder, itemsInSection } from '$lib/domain/items';
import { flattenItems, type ScoringContext } from '$lib/domain/points';
import type {
  Collection,
  Item,
  Outcome,
  Rubric,
  Section,
  Vault,
  VaultSnapshot
} from '$lib/domain/schema';

/*
  Shared ground for the human-readable halves of a bundle.

  The Markdown and the CSV describe the same course from two angles, and the one way
  they can embarrass the app is by disagreeing — question 4 in the exam document being
  a different question from the row numbered 4 in items.csv. So the lookups and, more
  importantly, the DOCUMENT ORDER are worked out once here and both writers follow it.

  Nothing in this file is lossless and nothing is read back. JSON is the authoritative
  form; these are derived views, and they are allowed to collapse whitespace and drop
  detail in the service of being readable.
*/

export interface ReadableContext {
  vault: Vault;
  outcomesById: ReadonlyMap<string, Outcome>;
  rubricsById: ReadonlyMap<string, Rubric>;
  /**
   * Rubric id → its filename stem inside this bundle, so a collection document can
   * link to the rubric document sitting next to it. Empty when the caller is rendering
   * one file on its own rather than a whole bundle; links then degrade to plain text.
   */
  rubricSlugs: ReadonlyMap<string, string>;
  /** Every item including group parts, so a `stimulusId` can be named rather than shown raw. */
  itemsById: ReadonlyMap<string, Item>;
  scoring: ScoringContext;
}

export function readableContext(
  snapshot: VaultSnapshot,
  rubricSlugs: ReadonlyMap<string, string> = new Map()
): ReadableContext {
  const rubricsById = new Map(snapshot.rubrics.map((rubric) => [rubric.id, rubric]));

  return {
    vault: snapshot.vault,
    outcomesById: new Map(snapshot.outcomes.map((outcome) => [outcome.id, outcome])),
    rubricsById,
    rubricSlugs,
    itemsById: new Map(flattenItems(snapshot.items).map((item) => [item.id, item])),
    scoring: { rubricsById }
  };
}

// ---------------------------------------------------------------------------
// Document order
// ---------------------------------------------------------------------------

export interface ItemGroup {
  /** Undefined for the items that sit outside every section. */
  section: Section | undefined;
  items: Item[];
}

/**
 * A collection's items grouped the way the authoring screen shows them: the ones
 * outside any section first, then each section in order.
 *
 * Sections with no items are kept. An empty "Part III" is something the author made
 * on purpose and is about to fill, and a readable export that quietly omitted it
 * would read as though the work were smaller than it is.
 *
 * An item whose `sectionId` names a section that is not here — which an edited or
 * merged bundle can produce — is treated as unsectioned rather than dropped. Losing a
 * question from the readable form because a heading went missing would be far worse
 * than showing it in the wrong place.
 */
export function documentGroups(collection: Collection, items: readonly Item[]): ItemGroup[] {
  const sections = [...collection.sections].sort((a, b) => a.order - b.order);
  const known = new Set(sections.map((section) => section.id));

  const loose = items.filter(
    (item) => item.sectionId === undefined || !known.has(item.sectionId)
  );

  return [
    { section: undefined, items: inOrder(loose) },
    ...sections.map((section) => ({ section, items: itemsInSection(items, section.id) }))
  ];
}

/**
 * Numbering, as a reader would say it out loud: "question 4", "question 4.2".
 *
 * Numbers run continuously across the whole collection rather than restarting per
 * section, because that is how a printed test numbers itself, and they are the join
 * between the Markdown headings and the CSV rows.
 */
export function partNumber(parent: string, index: number): string {
  return `${parent}${index + 1}.`;
}

// ---------------------------------------------------------------------------
// Small text helpers, shared because both writers need the same answers
// ---------------------------------------------------------------------------

/** Collapses every run of whitespace, including newlines, to a single space. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Points, rounded the way the UI rounds them, so a document never shows 3.0000000004. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The label a vocabulary gives a key, falling back to the key itself. */
export function labelOf(
  vocab: readonly { key: string; label: string }[] | undefined,
  key: string
): string {
  return vocab?.find((entry) => entry.key === key)?.label || key;
}

/**
 * An outcome's code, or the raw id when the alignment points at nothing.
 *
 * A dangling id is shown rather than hidden: `validate.ts` reports it, and someone
 * reading the export needs to see that the reference exists and is broken, not a gap
 * where an outcome should have been.
 */
export function outcomeCode(context: ReadableContext, outcomeId: string): string {
  return context.outcomesById.get(outcomeId)?.code || outcomeId;
}

/**
 * A custom field value as text.
 *
 * `fields` holds whatever the user declared plus anything a newer version wrote, so
 * the value can be any JSON. Returns an empty string for anything with nothing to
 * show, which is the signal to leave the field out of the line entirely.
 */
export function fieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((entry) => fieldValue(entry)).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Custom fields as `Label: value` pairs, in the order the record carries them. */
export function fieldPairs(
  context: ReadableContext,
  fields: Record<string, unknown>
): string[] {
  return Object.entries(fields).flatMap(([key, value]) => {
    const shown = fieldValue(value);
    if (!shown) return [];
    return [`${labelOf(context.vault.config.customFields, key)}: ${shown}`];
  });
}
