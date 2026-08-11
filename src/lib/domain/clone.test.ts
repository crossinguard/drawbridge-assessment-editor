import { describe, expect, it } from 'vitest';
import { cloneSnapshot, codeIsTaken, suggestCode, type CloneInclude } from './clone';
import { sampleSnapshot } from './sample';
import { flattenItems } from './points';
import { validateVault } from './validate';
import { VaultSnapshotSchema, type VaultSnapshot } from './schema';

/*
  The sample course is the fixture, because it is the only thing in the repo that has
  one of everything the cleaning has to handle: criteria aligned to outcomes, items
  pointing at rubrics, a group whose parts carry their own alignments, a stimulus other
  items read from, a collection scored by a rubric, and a rubric appending another.

  Every combination is run rather than a chosen few. There are sixteen, the function is
  pure, and the failure mode being guarded against — a new course that opens red — is
  invisible until someone picks the combination nobody tried.
*/

const NOW = '2026-08-11T12:00:00.000Z';

const COMBINATIONS: CloneInclude[] = [false, true].flatMap((outcomes) =>
  [false, true].flatMap((rubrics) =>
    [false, true].flatMap((collections) =>
      [false, true].map((items) => ({ outcomes, rubrics, collections, items }))
    )
  )
);

const describeInclude = (include: CloneInclude) =>
  (Object.keys(include) as (keyof CloneInclude)[]).filter((key) => include[key]).join('+') ||
  'settings only';

function clone(include: CloneInclude, snapshot = sampleSnapshot()): VaultSnapshot {
  return cloneSnapshot(snapshot, {
    name: 'Introductory Statistics (copy)',
    code: 'STAT101-2',
    include,
    now: NOW
  });
}

function errorsIn(snapshot: VaultSnapshot) {
  return validateVault({
    vault: snapshot.vault,
    outcomes: snapshot.outcomes,
    collections: snapshot.collections,
    itemsByCollection: new Map(
      snapshot.collections.map((collection) => [
        collection.id,
        snapshot.items.filter((item) => item.collectionId === collection.id)
      ])
    ),
    rubrics: snapshot.rubrics
  }).filter((issue) => issue.severity === 'error');
}

describe('cloneSnapshot', () => {
  for (const include of COMBINATIONS) {
    it(`opens with no errors: ${describeInclude(include)}`, () => {
      // The whole point of the stripping. A dangling reference is error severity —
      // correctly, it is broken — and a copy that arrives damaged is the worst first
      // impression this feature could make.
      const cloned = clone(include);
      expect(errorsIn(cloned).map((issue) => `${issue.ruleId}: ${issue.message}`)).toEqual([]);
    });

    it(`still parses: ${describeInclude(include)}`, () => {
      expect(() => VaultSnapshotSchema.parse(clone(include))).not.toThrow();
    });
  }

  it('always carries the settings, whatever else is left behind', () => {
    // The reason to clone rather than start fresh. Statuses, kinds, level sets, tag
    // dimensions and custom fields are the part that took an afternoon to get right.
    const source = sampleSnapshot();
    const bare = clone({ outcomes: false, rubrics: false, collections: false, items: false }, source);

    expect(bare.vault.config).toEqual(source.vault.config);
    expect(bare.outcomes).toEqual([]);
    expect(bare.collections).toEqual([]);
    expect(bare.items).toEqual([]);
    expect(bare.rubrics).toEqual([]);
  });

  it('takes the new name, code and term, and nothing else about the old one', () => {
    const source = sampleSnapshot();
    const cloned = cloneSnapshot(source, {
      name: 'Statistics II',
      code: 'STAT201',
      term: 'Spring 2027',
      include: { outcomes: true, rubrics: true, collections: true, items: true },
      now: NOW
    });

    expect(cloned.vault.name).toBe('Statistics II');
    expect(cloned.vault.code).toBe('STAT201');
    expect(cloned.vault.term).toBe('Spring 2027');
    expect(cloned.vault.description).toBe(source.vault.description);
  });

  it('drops the term rather than carrying the old one when it is left blank', () => {
    const cloned = cloneSnapshot(sampleSnapshot(), {
      name: 'A copy',
      code: 'X1',
      term: '',
      include: { outcomes: true, rubrics: true, collections: true, items: true },
      now: NOW
    });
    expect('term' in cloned.vault).toBe(false);
  });

  it('restamps every record, because a clone is new work and not a restore', () => {
    const cloned = clone({ outcomes: true, rubrics: true, collections: true, items: true });
    const records = [
      cloned.vault,
      ...cloned.outcomes,
      ...cloned.collections,
      ...cloned.rubrics,
      ...flattenItems(cloned.items)
    ];

    expect(records.length).toBeGreaterThan(10);
    for (const record of records) {
      expect(record.createdAt, JSON.stringify(record).slice(0, 40)).toBe(NOW);
      expect(record.updatedAt).toBe(NOW);
    }
  });

  it('refuses items without their collections, whatever it is asked for', () => {
    // An item whose collection is not here is unreachable — there is no screen that
    // could show it. The UI disables the combination; this is the half that holds when
    // the UI is wrong.
    const cloned = clone({ outcomes: true, rubrics: true, collections: false, items: true });
    expect(cloned.items).toEqual([]);
  });

  it('strips rubric references when the rubrics stay behind', () => {
    const cloned = clone({ outcomes: true, rubrics: false, collections: true, items: true });

    for (const collection of cloned.collections) expect(collection.rubricId).toBeUndefined();
    for (const item of flattenItems(cloned.items)) expect(item.rubricId).toBeUndefined();
    // And the source had some, or this asserts nothing at all.
    const source = sampleSnapshot();
    expect(
      source.collections.some((c) => c.rubricId) && flattenItems(source.items).some((i) => i.rubricId)
    ).toBe(true);
  });

  it('strips outcome alignments — on items, on parts, and on criteria', () => {
    const cloned = clone({ outcomes: false, rubrics: true, collections: true, items: true });

    for (const item of flattenItems(cloned.items)) expect(item.outcomeIds).toEqual([]);
    for (const rubric of cloned.rubrics) {
      for (const criterion of rubric.criteria) expect(criterion.outcomeIds).toEqual([]);
    }

    // A group's parts carry their own alignments, and are the ones a shallow pass misses.
    const source = sampleSnapshot();
    const parts = source.items.flatMap((item) => item.parts);
    expect(parts.some((part) => part.outcomeIds.length > 0)).toBe(true);
  });

  it('keeps a rubric’s shared tail intact, since rubrics come as a set', () => {
    // `appends` points at another rubric, so it survives on the all-or-nothing rule
    // rather than needing cleaning of its own. Worth pinning: if rubrics ever became
    // individually selectable, this is the reference that would dangle.
    const cloned = clone({ outcomes: true, rubrics: true, collections: true, items: true });
    const ids = new Set(cloned.rubrics.map((rubric) => rubric.id));
    const appended = cloned.rubrics.flatMap((rubric) => rubric.appends);

    expect(appended.length).toBeGreaterThan(0);
    for (const id of appended) expect(ids.has(id)).toBe(true);
  });

  it('keeps the collections but not their declared totals when items are left behind', () => {
    /*
      The main case: same structure, same settings, new questions. A declared total
      describes items that are not coming, so carried onto an empty shell it reports
      itself as a points mismatch on the new course's first screen.
    */
    const source = sampleSnapshot();
    expect(source.collections.some((c) => c.declaredPoints !== undefined)).toBe(true);

    // Cloned from THIS source: ids are freshly generated per sampleSnapshot() call, so
    // comparing against a second one finds nothing and asserts nothing.
    const cloned = clone({ outcomes: true, rubrics: true, collections: true, items: false }, source);
    expect(cloned.collections.length).toBe(source.collections.length);
    expect(cloned.items).toEqual([]);
    for (const collection of cloned.collections) {
      expect(collection.declaredPoints).toBeUndefined();
      // Sections are structure, and structure is what was asked for.
      expect(collection.sections).toEqual(
        source.collections.find((c) => c.id === collection.id)?.sections
      );
    }
  });

  it('does not mutate the snapshot it was given', () => {
    const source = sampleSnapshot();
    const before = JSON.stringify(source);
    clone({ outcomes: false, rubrics: false, collections: true, items: true }, source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('leaves the ids alone, because remapping them here would be a second remapper', () => {
    const source = sampleSnapshot();
    const cloned = clone({ outcomes: true, rubrics: true, collections: true, items: true }, source);

    expect(cloned.vault.id).toBe(source.vault.id);
    expect(cloned.outcomes.map((o) => o.id)).toEqual(source.outcomes.map((o) => o.id));
  });
});

describe('codeIsTaken', () => {
  const existing = [{ code: 'STAT101' }, { code: 'BIO200' }];

  it('matches regardless of case or surrounding space', () => {
    // Stricter than the index that makes this matter — Dexie's equals() is
    // case-sensitive — because two courses that only differ in case are the same
    // course to whoever is reading the list.
    expect(codeIsTaken('stat101', existing)).toBe(true);
    expect(codeIsTaken('  STAT101 ', existing)).toBe(true);
    expect(codeIsTaken('STAT102', existing)).toBe(false);
  });

  it('does not call an empty code taken, so a blank field is not an error yet', () => {
    expect(codeIsTaken('', existing)).toBe(false);
    expect(codeIsTaken('   ', existing)).toBe(false);
  });
});

describe('suggestCode', () => {
  it('offers the next free variant', () => {
    expect(suggestCode('STAT101', [{ code: 'STAT101' }])).toBe('STAT101-2');
    expect(suggestCode('STAT101', [{ code: 'STAT101' }, { code: 'STAT101-2' }])).toBe('STAT101-3');
  });

  it('does not stack suffixes when cloning a clone', () => {
    expect(suggestCode('STAT101-2', [{ code: 'STAT101-2' }])).toBe('STAT101-3');
  });
});
