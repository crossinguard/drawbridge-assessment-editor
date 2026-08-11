import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from './sample';
import { VaultSnapshotSchema } from './schema';
import { validateVault } from './validate';
import { flattenItems, rubricTotal } from './points';
import { noTails, scoringContext } from './fixtures';

/*
  What makes a hand-written fixture worth shipping is that these hold. The sample is
  loaded by a user who has never seen the app before, so the bar is not "it parses" —
  it is "nothing in it looks broken".
*/

describe('the sample course', () => {
  it('is a valid snapshot', () => {
    // The point of writing it as a module rather than shipping a zip: a schema change
    // breaks this, loudly, instead of leaving a stale binary that only fails on import.
    expect(() => VaultSnapshotSchema.parse(sampleSnapshot())).not.toThrow();
  });

  it('opens with nothing to fix', () => {
    const snapshot = sampleSnapshot();
    const issues = validateVault({
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
    });

    // Errors are dangling references and broken answer keys. A demo that opens red
    // teaches the wrong lesson about a validator whose whole point is that it advises.
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('has something for the problems panel and the coverage screen to report', () => {
    /*
      The inverse of the rule above, and just as deliberate. A sample with a clean bill
      of health would leave both screens looking broken-because-empty, which is exactly
      the thing they exist to avoid.
    */
    const snapshot = sampleSnapshot();
    const issues = validateVault({
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
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(snapshot.outcomes.some((outcome) => outcome.code === 'CO3')).toBe(true);
  });

  it('resolves every reference it makes', () => {
    // The thing a hand-written fixture gets wrong, and the one the schema cannot catch:
    // every id here is a plain string as far as Zod is concerned.
    const snapshot = sampleSnapshot();
    const outcomeIds = new Set(snapshot.outcomes.map((outcome) => outcome.id));
    const rubricIds = new Set(snapshot.rubrics.map((rubric) => rubric.id));
    const collectionIds = new Set(snapshot.collections.map((collection) => collection.id));
    const itemIds = new Set(flattenItems(snapshot.items).map((item) => item.id));

    for (const outcome of snapshot.outcomes) {
      if (outcome.parentId !== null) expect(outcomeIds.has(outcome.parentId), outcome.code).toBe(true);
    }

    for (const rubric of snapshot.rubrics) {
      for (const criterion of rubric.criteria) {
        for (const id of criterion.outcomeIds) expect(outcomeIds.has(id), criterion.title).toBe(true);
      }
    }

    for (const collection of snapshot.collections) {
      if (collection.rubricId) expect(rubricIds.has(collection.rubricId)).toBe(true);
    }

    const sectionsFor = new Map(
      snapshot.collections.map((collection) => [
        collection.id,
        new Set(collection.sections.map((section) => section.id))
      ])
    );

    for (const item of flattenItems(snapshot.items)) {
      expect(collectionIds.has(item.collectionId), item.stem.slice(0, 30)).toBe(true);
      for (const id of item.outcomeIds) expect(outcomeIds.has(id), item.stem.slice(0, 30)).toBe(true);
      if (item.rubricId) expect(rubricIds.has(item.rubricId)).toBe(true);
      if (item.stimulusId) expect(itemIds.has(item.stimulusId)).toBe(true);
      if (item.sectionId) {
        expect(sectionsFor.get(item.collectionId)?.has(item.sectionId), item.stem.slice(0, 30)).toBe(
          true
        );
      }
    }
  });

  it('gives two independent courses when loaded twice', () => {
    // It is a normal vault the user can edit and delete, not a shared demo.
    const first = sampleSnapshot();
    const second = sampleSnapshot();

    expect(first.vault.id).not.toBe(second.vault.id);
    const firstIds = new Set(flattenItems(first.items).map((item) => item.id));
    for (const item of flattenItems(second.items)) expect(firstIds.has(item.id)).toBe(false);
  });

  it('shows a criterion carrying its own points', () => {
    /*
      Same argument as showing every item kind: a feature the demo omits is a feature
      a first-time reader has to discover by accident. This one especially, because a
      grid where every row is worth the same looks like the only kind there is.
    */
    const rubrics = sampleSnapshot().rubrics;
    const weighted = rubrics.flatMap((rubric) =>
      rubric.criteria.filter((criterion) =>
        rubric.levels.some((level) => criterion.levelPoints[level.id] !== undefined)
      )
    );

    expect(weighted.length).toBeGreaterThan(0);

    // And it has to actually change the total, or it demonstrates nothing.
    const shown = rubrics.find((rubric) => rubric.criteria.some((c) => weighted.includes(c)))!;
    const flat = shown.criteria.map((criterion) => ({ ...criterion, levelPoints: {} }));
    expect(rubricTotal(shown, noTails)).not.toBe(rubricTotal({ ...shown, criteria: flat }, noTails));
  });

  it('shows a shared tail, appended rather than copied', () => {
    /*
      And on a SHORTER scale than the rubric appending it, which is the whole design in
      one number: the tail contributes its own best level, not the host's. A demo where
      both scales matched would look identical whether or not the code got that right.
    */
    const snapshot = sampleSnapshot();
    const context = scoringContext(...snapshot.rubrics);
    const host = snapshot.rubrics.find((rubric) => rubric.appends.length > 0);

    expect(host).toBeDefined();
    const tail = snapshot.rubrics.find((rubric) => rubric.id === host!.appends[0]);
    expect(tail).toBeDefined();

    const tailBest = Math.max(...tail!.levels.map((level) => level.points));
    const hostBest = Math.max(...host!.levels.map((level) => level.points));
    expect(tailBest).toBeLessThan(hostBest);

    // The composed total is the host's plus the tail's own maximum per criterion.
    const alone = rubricTotal({ ...host!, appends: [] }, context);
    expect(rubricTotal(host!, context)).toBe(alone + tailBest * tail!.criteria.length);
  });

  it('shows every item kind the app has', () => {
    // A demo that quietly omits a kind is how a kind stops getting exercised at all.
    const kinds = new Set(flattenItems(sampleSnapshot().items).map((item) => item.kind));
    expect([...kinds].sort()).toEqual([
      'choice',
      'discussion',
      'essay',
      'group',
      'multi',
      'shortAnswer',
      'stimulus',
      'trueFalse'
    ]);
  });
});
