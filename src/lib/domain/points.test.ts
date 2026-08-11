import { describe, expect, it } from 'vitest';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  levels,
  noTails,
  scoringContext,
  worth
} from './fixtures';
import {
  collectionPoints,
  criterionMax,
  describePoints,
  flattenItems,
  itemPoints,
  pointsAt,
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
    expect(rubricTotal(rubric, noTails)).toBe(12);
  });

  it('scores a rubric with no levels at zero rather than failing', () => {
    const rubric = aRubric({ levels: [], criteria: [aCriterion('Clarity', [])] });
    expect(rubricTotal(rubric, noTails)).toBe(0);
  });

  it("lets a criterion set its own points, so one can matter more than another", () => {
    // The whole of stage 15: Thesis runs 10/7/4/0 on the same grid where Mechanics
    // still runs 4/3/2/1.
    const thesis = {
      ...aCriterion('Thesis', fourPoint),
      levelPoints: worth(fourPoint, 10, 7, 4, 0)
    };
    expect(criterionMax(thesis, fourPoint)).toBe(10);

    const rubric = aRubric({
      levels: fourPoint,
      criteria: [thesis, aCriterion('Mechanics', fourPoint)]
    });
    expect(rubricTotal(rubric, noTails)).toBe(14);
  });

  it('falls back to the column for a level the criterion does not override', () => {
    // Sparse on purpose: overriding the top of a scale should not force the author to
    // restate every level below it.
    const partial = { ...aCriterion('Thesis', fourPoint), levelPoints: worth(fourPoint, 10) };

    expect(pointsAt(partial, fourPoint[0]!)).toBe(10);
    expect(pointsAt(partial, fourPoint[1]!)).toBe(3);
    expect(criterionMax(partial, fourPoint)).toBe(10);
  });

  it('treats an override of 0 as a real value, not as "not set"', () => {
    /*
      The distinction the editor depends on. Clearing the field means "worth what the
      column says"; typing 0 means "worth nothing here", which a "Not evident" column
      legitimately wants. Collapsing them would silently re-inherit.
    */
    const scale = levels(['Yes', 5], ['No', 2]);
    const zeroed = { ...aCriterion('Clarity', scale), levelPoints: worth(scale, 0, 0) };

    expect(pointsAt(zeroed, scale[0]!)).toBe(0);
    expect(criterionMax(zeroed, scale)).toBe(0);
    expect(rubricTotal(aRubric({ levels: scale, criteria: [zeroed] }), noTails)).toBe(0);
  });

  it('takes the best override even when the overrides do not descend', () => {
    // Same tolerance as a muddled level order: the maximum is the honest answer to
    // "what is the best this can score", however the row was typed.
    const muddled = { ...aCriterion('Thesis', fourPoint), levelPoints: worth(fourPoint, 2, 9) };
    expect(criterionMax(muddled, fourPoint)).toBe(9);
  });

  it('reaches an item and its collection through the rubric total', () => {
    // The reason an older reader misreads a stage-15 bundle: the override does not stop
    // at the rubric, it lands on the exam.
    const thesis = {
      ...aCriterion('Thesis', fourPoint),
      levelPoints: worth(fourPoint, 10, 7, 4, 0)
    };
    const rubric = aRubric({ levels: fourPoint, criteria: [thesis] });
    const context = scoringContext(rubric);
    const essay = anItem('essay', { rubricId: rubric.id });

    expect(itemPoints(essay, context)).toEqual({ points: 10, source: 'rubric', isMaximum: true });
    expect(collectionPoints(aCollection(), [essay], context).points).toBe(10);
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
