import { ItemKindSchema, type ItemKind, type VaultConfig } from './schema';

/*
  What a collection of a given kind can do.

  There is one Collection shape and there are no subtypes: a bank, an exam, a discussion
  set and a task differ only by `kind`, which is a key from `config.collectionKinds`.
  This file turns that key into the handful of yes/no answers the editor needs, so that
  the screen can vary without any code anywhere asking which kind it is looking at.

  The rule this exists to keep: **never branch on a kind key**. Not here, not in a
  component. A course that invents "lab practical" has to be able to get the behaviour
  it wants by editing settings, and the moment one `kind === 'task'` appears it cannot.
*/

/** Every kind, in schema order. The answer when a kind does not narrow the list. */
const ALL_ITEM_KINDS = ItemKindSchema.options as readonly ItemKind[];

export interface KindCapabilities {
  /** Item kinds this collection offers when adding. Already resolved — never undefined. */
  itemKinds: readonly ItemKind[];
  /** Per-item points, answer keys and the item-kind picker. */
  itemScoring: boolean;
  sections: boolean;
  /** Lead with the collection's rubric rather than burying it in the header. */
  rubricFirst: boolean;
}

/**
 * Everything on: what an unrecognised kind gets, and what a screen shows before its
 * vault has finished loading. Exported so no caller has to invent a placeholder — the
 * safe answer is always "show the full editor".
 */
export const ALL_CAPABILITIES: KindCapabilities = {
  itemKinds: ALL_ITEM_KINDS,
  itemScoring: true,
  sections: true,
  rubricFirst: false
};

/**
 * What a collection of this kind can do.
 *
 * **An unknown kind gets everything.** A collection whose kind was renamed, or which
 * arrived in a bundle from a course that defines kinds this vault has never heard of,
 * must open with its full editor rather than a degraded one — the alternative is a
 * screen that silently withholds the controls needed to fix the very problem that
 * caused it. `validate.ts` reports the unknown kind; the editor stays usable.
 *
 * `itemKinds` resolves `undefined` to every kind here, so callers never have to
 * remember which of absent and empty means which. The distinction is preserved where
 * it is written, in the schema and in settings.
 */
export function capabilitiesOf(config: VaultConfig, kind: string): KindCapabilities {
  const defined = config.collectionKinds.find((entry) => entry.key === kind);
  if (!defined) return ALL_CAPABILITIES;

  return {
    itemKinds: defined.itemKinds ?? ALL_ITEM_KINDS,
    itemScoring: defined.itemScoring,
    sections: defined.sections,
    rubricFirst: defined.rubricFirst
  };
}

/**
 * The kinds to offer in a picker that is showing `current`.
 *
 * A narrowed palette must never produce a `<select>` whose value is not among its
 * options — the control would render blank and changing anything else would silently
 * rewrite the kind. So whatever the item already is stays on the list, even where the
 * collection would not offer it today. Narrowing what can be ADDED is a preference;
 * trapping or misreporting what already exists is a bug.
 */
export function kindOptions(
  capabilities: KindCapabilities,
  current: ItemKind
): readonly ItemKind[] {
  if (capabilities.itemKinds.includes(current)) return capabilities.itemKinds;
  return [...capabilities.itemKinds, current];
}
