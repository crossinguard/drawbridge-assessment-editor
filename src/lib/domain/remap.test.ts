import { describe, expect, it } from 'vitest';
import { remapSnapshotIds } from './remap';
import { VaultSnapshotSchema, type VaultSnapshot } from './schema';
import { rubricTotal } from './points';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels,
  worth
} from './fixtures';

/** Deterministic ids, so failures name the position rather than a random uuid. */
function counter(prefix = 'new') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function aSnapshot(): VaultSnapshot {
  const vault = aVault();
  const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
  const parent = anOutcome({ vaultId: vault.id, code: 'CO1' });
  const child = anOutcome({ vaultId: vault.id, code: 'EO1.1', parentId: parent.id });

  const rubric = aRubric({
    vaultId: vault.id,
    levels: fourPoint,
    criteria: [
      aCriterion('Clarity', fourPoint, {
        outcomeIds: [child.id],
        levelPoints: worth(fourPoint, 10, 7)
      })
    ]
  });

  const collection = aCollection({ vaultId: vault.id });
  const section = { id: 'section-1', title: 'Part I', order: 0 };
  collection.sections = [section];

  const stimulus = anItem('stimulus', { collectionId: collection.id, stem: 'A data table.' });
  const group = anItem('group', {
    collectionId: collection.id,
    sectionId: section.id,
    stimulusId: stimulus.id,
    outcomeIds: [child.id],
    parts: [
      anItem('choice', {
        collectionId: collection.id,
        outcomeIds: [child.id],
        options: [{ id: 'option-1', text: '25', correct: true }],
        log: [{ id: 'log-1', date: '2026-08-01', kind: 'note', text: 'Reworded.' }],
        fields: { reviewedBy: 'BE' }
      })
    ]
  });
  const essay = anItem('essay', { collectionId: collection.id, rubricId: rubric.id });

  return VaultSnapshotSchema.parse({
    vault,
    outcomes: [parent, child],
    collections: [collection],
    items: [stimulus, group, essay],
    rubrics: [rubric]
  });
}

describe('remapSnapshotIds', () => {
  it('rewrites every id so a re-import cannot overwrite the first one', () => {
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());

    const idsOf = (s: VaultSnapshot) => [
      s.vault.id,
      ...s.outcomes.map((o) => o.id),
      ...s.collections.map((c) => c.id),
      ...s.items.map((i) => i.id),
      ...s.rubrics.map((r) => r.id)
    ];

    expect(new Set(idsOf(snapshot)).size).toBe(idsOf(snapshot).length);
    for (const id of idsOf(snapshot)) expect(idsOf(original)).not.toContain(id);
  });

  it('keeps every relationship intact through the rewrite', () => {
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());

    const [parent, child] = snapshot.outcomes;
    const collection = snapshot.collections[0];
    const [stimulus, group, essay] = snapshot.items;
    const rubric = snapshot.rubrics[0];

    expect(child?.parentId).toBe(parent?.id);
    expect(parent?.vaultId).toBe(snapshot.vault.id);
    expect(collection?.vaultId).toBe(snapshot.vault.id);
    expect(group?.collectionId).toBe(collection?.id);
    expect(group?.sectionId).toBe(collection?.sections[0]?.id);
    expect(group?.stimulusId).toBe(stimulus?.id);
    expect(group?.outcomeIds).toEqual([child?.id]);
    expect(group?.parts[0]?.collectionId).toBe(collection?.id);
    expect(group?.parts[0]?.outcomeIds).toEqual([child?.id]);
    expect(essay?.rubricId).toBe(rubric?.id);
    expect(rubric?.criteria[0]?.outcomeIds).toEqual([child?.id]);
  });

  it('remaps descriptor keys along with the level ids they point at', () => {
    // Descriptors are keyed BY LEVEL ID. Missing this blanks an entire rubric grid
    // while leaving every other assertion in this file passing.
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());
    const rubric = snapshot.rubrics[0];
    const criterion = rubric?.criteria[0];

    expect(rubric?.levels.length).toBeGreaterThan(0);
    for (const level of rubric?.levels ?? []) {
      expect(criterion?.descriptors[level.id]).toBeDefined();
    }
    expect(Object.keys(criterion?.descriptors ?? {})).toEqual(
      rubric?.levels.map((level) => level.id)
    );
  });

  it('remaps points overrides along with the level ids they point at', () => {
    /*
      The same trap as descriptors, one field along, and worse: an orphaned descriptor
      leaves a visibly empty cell, whereas an orphaned override just reverts the
      criterion to its column heading and takes the rubric total, the items it scores
      and their collection totals down with it.

      This shipped broken. Every test in this file passed; opening the imported sample
      course and reading 12 pt where the module says 16 is what caught it.
    */
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());
    const rubric = snapshot.rubrics[0];
    const criterion = rubric?.criteria[0];

    expect(Object.keys(criterion?.levelPoints ?? {})).toEqual(
      rubric?.levels.map((level) => level.id)
    );
    expect(rubricTotal(rubric!)).toBe(rubricTotal(original.rubrics[0]!));
    expect(rubricTotal(rubric!)).toBe(10);
  });

  it('leaves a reference to something outside the bundle alone', () => {
    // Minting a fresh id here would turn a reported dangling reference into a silent
    // one that points at nothing and can never be traced back.
    const original = aSnapshot();
    original.items[2] = { ...original.items[2]!, rubricId: 'deleted-rubric' };

    const { snapshot } = remapSnapshotIds(original, counter());
    expect(snapshot.items[2]?.rubricId).toBe('deleted-rubric');
  });

  it('does not touch the user custom-field bag', () => {
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());
    expect(snapshot.items[1]?.parts[0]?.fields).toEqual({ reviewedBy: 'BE' });
  });

  it('changes nothing but ids', () => {
    const original = aSnapshot();
    const { snapshot } = remapSnapshotIds(original, counter());

    // Blank every id-shaped field on both sides; what is left must be identical.
    const shape = (s: VaultSnapshot) =>
      JSON.parse(
        JSON.stringify(s, (key, value) =>
          /^(id|vaultId|collectionId|sectionId|parentId|rubricId|stimulusId)$/.test(key) ||
          key === 'outcomeIds' ||
          key === 'descriptors' ||
          key === 'levelPoints'
            ? undefined
            : value
        )
      );

    expect(shape(snapshot)).toEqual(shape(original));
  });

  it('produces disjoint ids when the same bundle is imported twice', () => {
    const original = aSnapshot();
    const first = remapSnapshotIds(original, counter('a')).snapshot;
    const second = remapSnapshotIds(original, counter('b')).snapshot;

    expect(first.vault.id).not.toBe(second.vault.id);
    const firstItems = new Set(first.items.map((item) => item.id));
    for (const item of second.items) expect(firstItems.has(item.id)).toBe(false);
  });

  it('still validates against the schema afterwards', () => {
    const { snapshot } = remapSnapshotIds(aSnapshot(), counter());
    expect(VaultSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('reports the mapping it used', () => {
    const original = aSnapshot();
    const { idMap, snapshot } = remapSnapshotIds(original, counter());
    expect(idMap.get(original.vault.id)).toBe(snapshot.vault.id);
  });
});
