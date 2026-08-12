import { newId, nowIso } from './ids';
import type { Item, ItemKind } from './schema';

/*
  Pure item helpers. No storage, no DOM.
*/

/**
 * An independent copy of an item, with fresh ids throughout.
 *
 * This backs both "duplicate" and the "Copy items to…" the brief describes. Copies
 * are meant to diverge — there is no reference back to the original and nothing
 * links the two afterwards, which is the intended behaviour rather than a limitation.
 *
 * The revision log comes along. Those entries are the author's notes about this
 * content, and the copy starts life with exactly that content; dropping them would
 * quietly lose the reasoning behind wording somebody agonised over.
 *
 * `stimulusId` is left pointing where it pointed. A duplicate lands in the same
 * collection as its original, so the passage it reads from is still the right one.
 * The caller is responsible for repointing it if the copy is moved elsewhere.
 */
export function duplicateItem(item: Item, generate: () => string = newId): Item {
  const at = nowIso();

  return {
    ...item,
    id: generate(),
    createdAt: at,
    updatedAt: at,
    options: item.options.map((option) => ({ ...option, id: generate() })),
    log: item.log.map((entry) => ({ ...entry, id: generate() })),
    parts: item.parts.map((part) => duplicateItem(part, generate))
  };
}

/**
 * The same item, belonging to another collection.
 *
 * Ownership moves; nothing is copied and no id changes. Two references cannot come with
 * it, and both would otherwise dangle silently:
 *
 * - `sectionId` names a section of the collection being LEFT. Sections belong to their
 *   collection, so the id means nothing in the new one — the item arrives outside every
 *   section, which is where a new arrival belongs anyway.
 * - `stimulusId` names a passage that stayed behind. An item reading from a passage in
 *   a different collection is not a shape this app has: the passage would not appear in
 *   its "Reads from" picker, and the exported document would reference something not in
 *   it. Better to arrive unlinked and visibly so.
 *
 * `collectionId` recurses into `parts`. A group's parts are not rows, but the items
 * store stamps each one with its own `collectionId`, and a group moved without the
 * recursion leaves its parts claiming a collection they are no longer in — invisible on
 * every screen, and surfacing only when something reads the field directly.
 *
 * `outcomeIds` and `rubricId` stay: both name things owned by the VAULT, and the move
 * is within one vault.
 */
export function relocateItem(item: Item, toCollectionId: string, order: number): Item {
  const moved: Item = {
    ...item,
    collectionId: toCollectionId,
    order,
    updatedAt: nowIso(),
    // Parts keep their own order within the group; only the collection changes.
    parts: item.parts.map((part) => relocateItem(part, toCollectionId, part.order))
  };

  delete moved.sectionId;
  delete moved.stimulusId;
  return moved;
}

/** Kinds whose answer is chosen from a fixed list. */
export const OPTION_KINDS: readonly ItemKind[] = ['choice', 'multi', 'trueFalse'];

export function usesOptions(kind: ItemKind): boolean {
  return OPTION_KINDS.includes(kind);
}

/** Kinds the author writes an expected response for, rather than picking one. */
export function usesExpected(kind: ItemKind): boolean {
  return kind === 'shortAnswer' || kind === 'essay';
}

/**
 * How many correct answers a kind should have, for the UI to explain itself with.
 *
 * Returns null where there is no rule. This is presentation only — `validate.ts` is
 * the authority on whether an item is actually wrong, and it never blocks either way.
 */
export function expectedKeyCount(kind: ItemKind): { min: number; max: number | null } | null {
  if (kind === 'choice' || kind === 'trueFalse') return { min: 1, max: 1 };
  if (kind === 'multi') return { min: 2, max: null };
  return null;
}

/** Sorts a group of items into display order. */
export function inOrder(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => a.order - b.order);
}

/**
 * Items belonging to one section, in order. Pass `undefined` for the ones that sit
 * outside every section.
 *
 * `order` is scoped to the group an item sits in, not to the whole collection, so
 * moving an item between sections never has to renumber the ones it left behind
 * beyond closing the gap.
 */
export function itemsInSection(items: readonly Item[], sectionId: string | undefined): Item[] {
  return inOrder(items.filter((item) => (item.sectionId ?? undefined) === sectionId));
}
