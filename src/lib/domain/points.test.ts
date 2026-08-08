import { describe, expect, it } from 'vitest';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  levels,
  scoringContext
} from './fixtures';
import {
  collectionPoints,
  criterionMax,
  describePoints,
  flattenItems,
  itemPoints,
  rubricTotal
} from './points';

const fourPoint = levels(
  ['Exemplary', 4],
  ['Proficient', 3],
  ['Developing', 2],
  ['Beginning', 1]
);

describe('rubric scoring', () => {
  it('scores a criterion at its best level, not the sum of its levels', () => {
    // The whole point. 4 + 3 + 2 + 1 = 10 is the wrong answer and the tempting one.
    expect(criterionMax(aCriterion('Clarity', fourPoint), fourPoint)).toBe(4);
  });

  it('takes the best level even when levels are not ordered best-first', () => {
    const muddled = levels(['Developing', 2], ['Exemplary', 4], ['Beginning', 1]);
    expect(criterionMax(aCriterion('Clarity', muddled), muddled)).toBe(4);
  });

  it('totals a rubric as the sum of its criteria maxima', () => {
    const rubric = aRubric({
      levels: fourPoint,
      criteria: [
        aCriterion('Clarity', fourPoint),
        aCriterion('Evidence', fourPoint),
        aCriterion('Mechanics', fourPoint)
      ]
    });
    expect(rubricTotal(rubric)).toBe(12);
  });

  it('scores a rubric with no levels at zero rather than failing', () => {
    const rubric = aRubric({ levels: [], criteria: [aCriterion('Clarity', [])] });
    expect(rubricTotal(rubric)).toBe(0);
  });
});

describe('item points', () => {
  const empty = scoringContext();

  it('sums a group from its parts — parts are additive, unlike rubric levels', () => {
    const group = anItem('group', {
      parts: [anItem('choice', { points: 2 }), anItem('choice', { points: 3 })]
    });
    expect(itemPoints(group, empty)).toEqual({ points: 5, source: 'parts', isMaximum: false });
  });

  it('sums nested groups all the way down', () => {
    const group = anItem('group', {
      parts: [
        anItem('choice', { points: 1 }),
        anItem('group', {
          parts: [anItem('choice', { points: 2 }), anItem('choice', { points: 4 })]
        })
      ]
    });
    expect(itemPoints(group, empty).points).toBe(7);
  });

  it('lets an explicit value win over the parts it contains', () => {
    const group = anItem('group', {
      points: 10,
      parts: [anItem('choice', { points: 2 }), anItem('choice', { points: 3 })]
    });
    expect(itemPoints(group, empty)).toEqual({
      points: 10,
      source: 'explicit',
      isMaximum: false
    });
  });

  it('lets an explicit value win over an attached rubric', () => {
    const rubric = aRubric({ levels: fourPoint, criteria: [aCriterion('Clarity', fourPoint)] });
    const item = anItem('essay', { points: 7, rubricId: rubric.id });
    expect(itemPoints(item, scoringContext(rubric)).points).toBe(7);
  });

  it('takes a rubric total when there is no explicit value, and marks it a ceiling', () => {
    const rubric = aRubric({
      levels: fourPoint,
      criteria: [aCriterion('Clarity', fourPoint), aCriterion('Evidence', fourPoint)]
    });
    const item = anItem('essay', { rubricId: rubric.id });
    expect(itemPoints(item, scoringContext(rubric))).toEqual({
      points: 8,
      source: 'rubric',
      isMaximum: true
    });
  });

  it('scores a dangling rubric reference at zero instead of throwing', () => {
    const item = anItem('essay', { rubricId: 'rubric-that-was-deleted' });
    expect(itemPoints(item, empty)).toEqual({ points: 0, source: 'rubric', isMaximum: true });
  });

  it('treats a group containing anything rubric-scored as a ceiling', () => {
    const rubric = aRubric({ levels: fourPoint, criteria: [aCriterion('Clarity', fourPoint)] });
    const group = anItem('group', {
      parts: [anItem('choice', { points: 2 }), anItem('essay', { rubricId: rubric.id })]
    });
    const result = itemPoints(group, scoringContext(rubric));
    expect(result.points).toBe(6);
    expect(result.isMaximum).toBe(true);
  });

  it('scores a stimulus at zero even when someone has typed points on it', () => {
    // Otherwise a passage silently inflates the total of every exam that uses it.
    const stimulus = anItem('stimulus', { points: 5 });
    expect(itemPoints(stimulus, empty)).toEqual({
      points: 0,
      source: 'unscored',
      isMaximum: false
    });
  });

  it('distinguishes "worth nothing yet" from "explicitly worth zero"', () => {
    expect(itemPoints(anItem('choice'), empty).source).toBe('undeclared');
    expect(itemPoints(anItem('choice', { points: 0 }), empty).source).toBe('explicit');
  });
});

describe('collection points', () => {
  const empty = scoringContext();

  it('sums top-level items only, counting a group once through its parent', () => {
    const collection = aCollection();
    const items = [
      anItem('choice', { points: 1 }),
      anItem('group', {
        parts: [anItem('choice', { points: 2 }), anItem('choice', { points: 3 })]
      })
    ];
    // 1 + (2 + 3) = 6. Flattening first would give 11.
    expect(collectionPoints(collection, items, empty).points).toBe(6);
  });

  it('scores a rubric-assessed collection from its rubric, not its items', () => {
    const rubric = aRubric({
      levels: fourPoint,
      criteria: [aCriterion('Clarity', fourPoint), aCriterion('Evidence', fourPoint)]
    });
    const collection = aCollection({ rubricId: rubric.id });
    const items = [anItem('essay', { points: 99 })];
    expect(collectionPoints(collection, items, scoringContext(rubric))).toEqual({
      points: 8,
      source: 'rubric',
      isMaximum: true
    });
  });

  it('is zero for an empty collection', () => {
    expect(collectionPoints(aCollection(), [], empty).points).toBe(0);
  });
});

describe('flattenItems', () => {
  it('returns parents before their parts, depth first', () => {
    const child = anItem('choice', { stem: 'child' });
    const parent = anItem('group', { stem: 'parent', parts: [child] });
    const sibling = anItem('choice', { stem: 'sibling' });
    expect(flattenItems([parent, sibling]).map((item) => item.stem)).toEqual([
      'parent',
      'child',
      'sibling'
    ]);
  });
});

describe('describePoints', () => {
  it('says "up to" only when the number is a ceiling', () => {
    expect(describePoints({ points: 4, source: 'rubric', isMaximum: true })).toBe('up to 4 pt');
    expect(describePoints({ points: 4, source: 'explicit', isMaximum: false })).toBe('4 pt');
  });

  it('does not show floating-point noise', () => {
    expect(describePoints({ points: 0.1 + 0.2, source: 'parts', isMaximum: false })).toBe('0.3 pt');
  });
});
