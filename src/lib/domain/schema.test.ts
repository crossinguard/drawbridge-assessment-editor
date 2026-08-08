import { describe, expect, it } from 'vitest';
import {
  CollectionSchema,
  ItemSchema,
  OutcomeSchema,
  RubricSchema,
  VaultSchema,
  VaultSnapshotSchema
} from './schema';
import { aCollection, aRubric, anItem, anOutcome, aVault, levels, aCriterion } from './fixtures';

describe('unknown fields survive', () => {
  /*
    The extension seam. If any of these start failing, the app has begun quietly
    deleting data written by a newer version of itself — the failure mode this whole
    convention exists to prevent, and one that leaves no trace when it happens.
  */

  it('keeps unrecognised top-level keys on every entity', () => {
    const cases = [
      [VaultSchema, aVault()],
      [OutcomeSchema, anOutcome()],
      [CollectionSchema, aCollection()],
      [ItemSchema, anItem('choice')],
      [RubricSchema, aRubric()]
    ] as const;

    for (const [schema, value] of cases) {
      const parsed = schema.parse({ ...value, fromAFutureVersion: { nested: true } });
      expect(parsed).toHaveProperty('fromAFutureVersion', { nested: true });
    }
  });

  it('keeps the user custom-field bag verbatim, including nulls and nesting', () => {
    const fields = { reviewedBy: 'BE', attempts: null, meta: { a: [1, 2] } };
    expect(ItemSchema.parse({ ...anItem('essay'), fields }).fields).toEqual(fields);
  });

  it('keeps unrecognised keys on a nested group part, not just the top level', () => {
    const parsed = ItemSchema.parse({
      ...anItem('group'),
      parts: [{ ...anItem('choice'), annotation: 'keep me' }]
    });
    expect(parsed.parts[0]).toHaveProperty('annotation', 'keep me');
  });
});

describe('defaults', () => {
  it('fills array and record defaults so callers never see undefined', () => {
    const parsed = ItemSchema.parse({
      id: 'item-1',
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
      collectionId: 'collection-1',
      kind: 'choice'
    });

    expect(parsed.options).toEqual([]);
    expect(parsed.parts).toEqual([]);
    expect(parsed.outcomeIds).toEqual([]);
    expect(parsed.accepted).toEqual([]);
    expect(parsed.log).toEqual([]);
    expect(parsed.tags).toEqual({});
    expect(parsed.fields).toEqual({});
    expect(parsed.stem).toBe('');
    expect(parsed.status).toBe('');
  });

  it('applies defaults at every depth of a group', () => {
    const parsed = ItemSchema.parse({
      ...anItem('group'),
      parts: [
        {
          id: 'part-1',
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
          collectionId: 'collection-1',
          kind: 'group',
          parts: [
            {
              id: 'part-1-a',
              createdAt: '2026-08-08T00:00:00.000Z',
              updatedAt: '2026-08-08T00:00:00.000Z',
              collectionId: 'collection-1',
              kind: 'choice'
            }
          ]
        }
      ]
    });

    expect(parsed.parts[0]?.parts[0]?.tags).toEqual({});
    expect(parsed.parts[0]?.parts[0]?.parts).toEqual([]);
  });
});

describe('rejections', () => {
  it('rejects an item kind the app has no shape for', () => {
    // ItemKind is the one closed vocabulary — each member implies different structure.
    expect(ItemSchema.safeParse({ ...anItem('choice'), kind: 'matching' }).success).toBe(false);
  });

  it('accepts any status string, because statuses are vault data', () => {
    // The opposite of the rule above, and deliberately so: a course that invents
    // "needs-stats-review" must not require a code change.
    expect(ItemSchema.safeParse({ ...anItem('choice'), status: 'needs-stats-review' }).success).toBe(
      true
    );
    expect(CollectionSchema.safeParse({ ...aCollection(), kind: 'lab-practical' }).success).toBe(
      true
    );
  });

  it('rejects an empty id', () => {
    expect(OutcomeSchema.safeParse({ ...anOutcome(), id: '' }).success).toBe(false);
  });
});

describe('snapshot round-trip', () => {
  it('survives JSON serialisation unchanged, including unknown keys', () => {
    const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({ levels: fourPoint, criteria: [aCriterion('Clarity', fourPoint)] });
    const outcome = anOutcome();
    const collection = aCollection();

    const snapshot = VaultSnapshotSchema.parse({
      vault: { ...aVault(), houseKeeping: 'preserve me' },
      outcomes: [outcome],
      collections: [collection],
      items: [
        anItem('group', {
          collectionId: collection.id,
          outcomeIds: [outcome.id],
          parts: [anItem('choice', { collectionId: collection.id, points: 2 })]
        })
      ],
      rubrics: [rubric]
    });

    // This is the property that makes the export bundle trustworthy: what comes back
    // out of a file has to be indistinguishable from what went in.
    const roundTripped = VaultSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    expect(roundTripped).toEqual(snapshot);
    expect(roundTripped.vault).toHaveProperty('houseKeeping', 'preserve me');
  });
});
