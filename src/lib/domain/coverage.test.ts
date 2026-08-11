import { describe, expect, it } from 'vitest';
import { computeCoverage, coverageAt } from './coverage';
import { aCollection, aCriterion, aRubric, anItem, anOutcome, levels, scoringContext } from './fixtures';
import type { Collection, Item } from './schema';

const co1 = anOutcome({ id: 'co1', code: 'CO1', parentId: null });
const eo11 = anOutcome({ id: 'eo11', code: 'EO1.1', parentId: 'co1' });
const eo12 = anOutcome({ id: 'eo12', code: 'EO1.2', parentId: 'co1' });
const outcomes = [co1, eo11, eo12];

function report(collections: Collection[], items: Record<string, Item[]>, rubrics = scoringContext()) {
  return computeCoverage({
    outcomes,
    collections,
    itemsByCollection: new Map(Object.entries(items)),
    context: rubrics
  });
}

describe('computeCoverage', () => {
  it('counts items and points per outcome and collection', () => {
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [
        anItem('choice', { collectionId: 'quiz', points: 2, outcomeIds: ['eo11'] }),
        anItem('choice', { collectionId: 'quiz', points: 3, outcomeIds: ['eo11'] })
      ]
    });

    expect(coverageAt(result, 'eo11', 'quiz')).toEqual({ itemCount: 2, points: 5 });
    expect(coverageAt(result, 'eo12', 'quiz')).toEqual({ itemCount: 0, points: 0 });
  });

  it('gives an outcome the full points of a multiply-aligned item, not a share', () => {
    // Deliberate: the table answers "how much assessment touches this outcome". A
    // consequence is that outcome totals can exceed the collection total.
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [anItem('choice', { collectionId: 'quiz', points: 4, outcomeIds: ['eo11', 'eo12'] })]
    });

    expect(coverageAt(result, 'eo11', 'quiz').points).toBe(4);
    expect(coverageAt(result, 'eo12', 'quiz').points).toBe(4);
  });

  it('reaches alignments on a group part that the parent does not carry', () => {
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [
        anItem('group', {
          collectionId: 'quiz',
          outcomeIds: ['eo11'],
          parts: [anItem('choice', { collectionId: 'quiz', points: 3, outcomeIds: ['eo12'] })]
        })
      ]
    });

    expect(coverageAt(result, 'eo12', 'quiz')).toEqual({ itemCount: 1, points: 3 });
  });

  it('picks up outcomes named by the criteria of an item rubric', () => {
    const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({
      id: 'rubric-1',
      levels: fourPoint,
      criteria: [aCriterion('Clarity', fourPoint, { outcomeIds: ['eo12'] })]
    });
    const quiz = aCollection({ id: 'quiz' });
    const result = report(
      [quiz],
      { quiz: [anItem('essay', { collectionId: 'quiz', rubricId: 'rubric-1' })] },
      scoringContext(rubric)
    );

    // The criterion's own maximum, not the whole rubric total spread around.
    expect(coverageAt(result, 'eo12', 'quiz')).toEqual({ itemCount: 1, points: 4 });
  });

  it('counts an outcome once per item even when it arrives by two routes', () => {
    const fourPoint = levels(['Exemplary', 4]);
    const rubric = aRubric({
      id: 'rubric-1',
      levels: fourPoint,
      criteria: [aCriterion('Clarity', fourPoint, { outcomeIds: ['eo11'] })]
    });
    const quiz = aCollection({ id: 'quiz' });
    const result = report(
      [quiz],
      { quiz: [anItem('essay', { collectionId: 'quiz', rubricId: 'rubric-1', outcomeIds: ['eo11'] })] },
      scoringContext(rubric)
    );

    expect(coverageAt(result, 'eo11', 'quiz').itemCount).toBe(1);
  });

  it('credits a collection scored by one rubric, with no item behind it', () => {
    const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({
      id: 'rubric-1',
      levels: fourPoint,
      criteria: [aCriterion('Participation', fourPoint, { outcomeIds: ['eo11'] })]
    });
    const task = aCollection({ id: 'task', rubricId: 'rubric-1' });
    const result = report([task], { task: [] }, scoringContext(rubric));

    expect(coverageAt(result, 'eo11', 'task')).toEqual({ itemCount: 0, points: 4 });
    expect(result.uncoveredOutcomeIds).not.toContain('eo11');
  });

  it('flags uncovered leaves only, never their parents', () => {
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [anItem('choice', { collectionId: 'quiz', points: 1, outcomeIds: ['eo11'] })]
    });

    // co1 is reached through eo11; listing it too would bury the real gap.
    expect(result.uncoveredOutcomeIds).toEqual(['eo12']);
  });

  it('reports unaligned items but exempts stimuli and groups', () => {
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [
        anItem('choice', { id: 'bare', collectionId: 'quiz' }),
        anItem('stimulus', { id: 'passage', collectionId: 'quiz' }),
        anItem('group', {
          id: 'grp',
          collectionId: 'quiz',
          parts: [anItem('choice', { collectionId: 'quiz', outcomeIds: ['eo11'] })]
        })
      ]
    });

    expect(result.unalignedItemIds).toEqual(['bare']);
  });

  it('reports alignments to an outcome that no longer exists', () => {
    const quiz = aCollection({ id: 'quiz' });
    const result = report([quiz], {
      quiz: [anItem('choice', { collectionId: 'quiz', outcomeIds: ['deleted'] })]
    });

    expect(result.danglingOutcomeIds).toEqual(['deleted']);
    expect(result.cells).toEqual([]);
  });

  it('rolls up totals across collections', () => {
    const quiz = aCollection({ id: 'quiz' });
    const exam = aCollection({ id: 'exam' });
    const result = report([quiz, exam], {
      quiz: [anItem('choice', { collectionId: 'quiz', points: 2, outcomeIds: ['eo11'] })],
      exam: [anItem('choice', { collectionId: 'exam', points: 5, outcomeIds: ['eo11'] })]
    });

    expect(result.byOutcome.get('eo11')).toEqual({ itemCount: 2, points: 7 });
    expect(result.byCollection.get('exam')).toEqual({ itemCount: 1, points: 5 });
  });

  it('treats a vault with no collections as entirely uncovered', () => {
    const result = report([], {});
    expect(result.uncoveredOutcomeIds.sort()).toEqual(['eo11', 'eo12']);
    expect(result.cells).toEqual([]);
  });
});

describe('coverage through a shared tail', () => {
  const hostLevels = levels(['Exemplary', 4], ['Beginning', 1]);
  const tailLevels = levels(['Met', 2], ['Not met', 0]);

  function pair() {
    const tail = aRubric({
      id: 'tail',
      levels: tailLevels,
      criteria: [aCriterion('Sources credited', tailLevels, { outcomeIds: ['eo12'] })]
    });
    const host = aRubric({
      id: 'host',
      levels: hostLevels,
      criteria: [aCriterion('Thesis', hostLevels, { outcomeIds: ['eo11'] })],
      appends: [tail.id]
    });
    return { host, tail };
  }

  it('reaches an outcome aligned only on an inherited criterion', () => {
    /*
      Without this the outcome reads as a gap on the coverage screen and in the
      uncovered list, and the author goes looking for a hole that is not there — the
      assessment does cover it, through the tail.
    */
    const { host, tail } = pair();
    const task = aCollection({ id: 'task' });
    const essay = anItem('essay', { collectionId: 'task', rubricId: host.id });

    const result = report([task], { task: [essay] }, scoringContext(host, tail));

    expect(coverageAt(result, 'eo11', 'task').points).toBe(4);
    // The tail's criterion, at the TAIL's best level. Scored against the host's levels
    // this would read 4, which is the specific silent wrong answer.
    expect(coverageAt(result, 'eo12', 'task').points).toBe(2);
    expect(result.uncoveredOutcomeIds).toEqual([]);
  });

  it('reaches it through a rubric on the collection itself, too', () => {
    // The other criterionMax call site in this file, and it is a separate branch.
    const { host, tail } = pair();
    const task = aCollection({ id: 'task', rubricId: host.id });

    const result = report([task], { task: [] }, scoringContext(host, tail));

    expect(coverageAt(result, 'eo12', 'task')).toEqual({ itemCount: 0, points: 2 });
    expect(result.uncoveredOutcomeIds).toEqual([]);
  });

  it('treats a tail that has been deleted as simply absent', () => {
    const { host } = pair();
    const task = aCollection({ id: 'task', rubricId: host.id });

    const result = report([task], { task: [] }, scoringContext(host));

    expect(coverageAt(result, 'eo11', 'task').points).toBe(4);
    expect(result.uncoveredOutcomeIds).toEqual(['eo12']);
  });
});
