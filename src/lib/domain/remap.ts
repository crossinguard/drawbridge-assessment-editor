import { newId } from './ids';
import type { Item, VaultSnapshot } from './schema';

/*
  Rewrites every id in a snapshot, keeping every relationship intact.

  This exists for "import as a new vault". Without it, importing the same bundle twice
  would produce two vaults whose outcomes, items and rubrics all share ids — and since
  the repository stores by id, the second import would overwrite the first. Losing a
  vault by restoring a backup is the exact failure this app cannot have.

  Two rules make it safe.

  1. One map for the whole snapshot. Every id-defining position contributes to it, and
     every reference is rewritten through it. Doing this per-entity-type instead would
     be where a relationship quietly breaks.

  2. Only known reference fields are rewritten — never a blanket search-and-replace
     over the JSON. An id-shaped string can legitimately appear inside a Markdown stem
     or a custom field, and rewriting that would corrupt the author's text.

  `fields` is passed through untouched, in both directions. If a user's custom field
  happens to hold an id, this will not follow it; that is the cost of promising those
  values round-trip verbatim, and it is the right trade.
*/

export interface RemapResult {
  snapshot: VaultSnapshot;
  /** Old id → new id, for callers that need to report or follow the change. */
  idMap: Map<string, string>;
}

export function remapSnapshotIds(
  snapshot: VaultSnapshot,
  generate: () => string = newId
): RemapResult {
  const idMap = new Map<string, string>();

  const define = (id: string): void => {
    if (!idMap.has(id)) idMap.set(id, generate());
  };

  /*
    Unknown ids pass through unchanged rather than being minted fresh. A reference to
    something that is not in the bundle is already broken, and inventing an id for it
    would turn a reported dangling reference into a silent one.
  */
  const ref = (id: string): string => idMap.get(id) ?? id;

  const defineItem = (item: Item): void => {
    define(item.id);
    for (const option of item.options) define(option.id);
    for (const entry of item.log) define(entry.id);
    for (const part of item.parts) defineItem(part);
  };

  // ---- pass 1: every position that DEFINES an id -------------------------
  define(snapshot.vault.id);
  for (const levelSet of snapshot.vault.config.levelSets) {
    define(levelSet.id);
    for (const level of levelSet.levels) define(level.id);
  }
  for (const outcome of snapshot.outcomes) define(outcome.id);
  for (const collection of snapshot.collections) {
    define(collection.id);
    for (const section of collection.sections) define(section.id);
  }
  for (const item of snapshot.items) defineItem(item);
  for (const rubric of snapshot.rubrics) {
    define(rubric.id);
    for (const level of rubric.levels) define(level.id);
    for (const criterion of rubric.criteria) define(criterion.id);
  }

  // ---- pass 2: rewrite ---------------------------------------------------
  const newVaultId = ref(snapshot.vault.id);

  const remapItem = (item: Item): Item => ({
    ...item,
    id: ref(item.id),
    collectionId: ref(item.collectionId),
    ...(item.sectionId === undefined ? {} : { sectionId: ref(item.sectionId) }),
    ...(item.rubricId === undefined ? {} : { rubricId: ref(item.rubricId) }),
    ...(item.stimulusId === undefined ? {} : { stimulusId: ref(item.stimulusId) }),
    outcomeIds: item.outcomeIds.map(ref),
    options: item.options.map((option) => ({ ...option, id: ref(option.id) })),
    log: item.log.map((entry) => ({ ...entry, id: ref(entry.id) })),
    parts: item.parts.map(remapItem)
  });

  return {
    idMap,
    snapshot: {
      ...snapshot,
      vault: {
        ...snapshot.vault,
        id: newVaultId,
        config: {
          ...snapshot.vault.config,
          levelSets: snapshot.vault.config.levelSets.map((levelSet) => ({
            ...levelSet,
            id: ref(levelSet.id),
            levels: levelSet.levels.map((level) => ({ ...level, id: ref(level.id) }))
          }))
        }
      },
      outcomes: snapshot.outcomes.map((outcome) => ({
        ...outcome,
        id: ref(outcome.id),
        vaultId: newVaultId,
        parentId: outcome.parentId === null ? null : ref(outcome.parentId)
      })),
      collections: snapshot.collections.map((collection) => ({
        ...collection,
        id: ref(collection.id),
        vaultId: newVaultId,
        ...(collection.rubricId === undefined ? {} : { rubricId: ref(collection.rubricId) }),
        sections: collection.sections.map((section) => ({ ...section, id: ref(section.id) }))
      })),
      items: snapshot.items.map(remapItem),
      rubrics: snapshot.rubrics.map((rubric) => ({
        ...rubric,
        id: ref(rubric.id),
        vaultId: newVaultId,
        levels: rubric.levels.map((level) => ({ ...level, id: ref(level.id) })),
        criteria: rubric.criteria.map((criterion) => ({
          ...criterion,
          id: ref(criterion.id),
          outcomeIds: criterion.outcomeIds.map(ref),
          /*
            Both of these are keyed BY LEVEL ID, and both have to be remapped with the
            levels or they are orphaned: the descriptors blank the grid, and the points
            revert every criterion to its column heading — quietly, and with the rubric
            total, the items it scores and their collection totals all coming out lower.

            The second one shipped broken for exactly as long as it took to open the
            imported sample course and read the total off the rubric list.
          */
          descriptors: Object.fromEntries(
            Object.entries(criterion.descriptors).map(([levelId, text]) => [ref(levelId), text])
          ),
          levelPoints: Object.fromEntries(
            Object.entries(criterion.levelPoints).map(([levelId, points]) => [
              ref(levelId),
              points
            ])
          )
        }))
      }))
    }
  };
}
