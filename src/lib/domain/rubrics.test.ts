import { describe, expect, it } from 'vitest';
import {
  applyLevels,
  descriptorCoverage,
  levelsFromSet,
  matchingLevelSet,
  withoutLevel
} from './rubrics';
import { rubricTotal } from './points';
import { aCriterion, aRubric, levels } from './fixtures';
import { RubricSchema, type Level } from './schema';

function counter(prefix = 'lvl') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** A rubric with every cell written, so a lost descriptor is obvious. */
function filledRubric(levelList: Level[]) {
  return aRubric({
    levels: levelList,
    criteria: [aCriterion('Clarity', levelList), aCriterion('Evidence', levelList)]
  });
}

describe('applyLevels', () => {
  const fourPoint = levels(['Exemplary', 4], ['Proficient', 3], ['Developing', 2], ['Beginning', 1]);

  it('carries descriptors across by position when swapping to a same-sized scale', () => {
    /*
      The case that matters. The incoming levels are new objects with new ids, so
      matching on id would find nothing and blank an afternoon's writing.
    */
    const before = filledRubric(fourPoint);
    const renamed = levels(['Outstanding', 4], ['Strong', 3], ['Emerging', 2], ['Starting', 1]);

    const { rubric, droppedDescriptors } = applyLevels(before, renamed);

    expect(droppedDescriptors).toBe(0);
    expect(rubric.criteria[0]?.descriptors[renamed[0]!.id]).toBe('Clarity at Exemplary');
    expect(rubric.criteria[0]?.descriptors[renamed[3]!.id]).toBe('Clarity at Beginning');
    expect(rubric.criteria[1]?.descriptors[renamed[1]!.id]).toBe('Evidence at Proficient');
  });

  it('reports how many descriptors a shorter scale would drop', () => {
    // Reported rather than silently discarded, so the UI can warn before committing.
    const before = filledRubric(fourPoint);
    const twoPoint = levels(['Complete', 1], ['Incomplete', 0]);

    const { rubric, droppedDescriptors } = applyLevels(before, twoPoint);

    // Two criteria × the two levels that no longer exist.
    expect(droppedDescriptors).toBe(4);
    expect(Object.keys(rubric.criteria[0]?.descriptors ?? {})).toHaveLength(2);
  });

  it('leaves the extra columns empty when growing the scale', () => {
    const before = filledRubric(levels(['Yes', 1], ['No', 0]));
    const fourNew = levels(['A', 4], ['B', 3], ['C', 2], ['D', 1]);

    const { rubric, droppedDescriptors } = applyLevels(before, fourNew);

    expect(droppedDescriptors).toBe(0);
    expect(rubric.criteria[0]?.descriptors[fourNew[0]!.id]).toBe('Clarity at Yes');
    expect(rubric.criteria[0]?.descriptors[fourNew[2]!.id]).toBeUndefined();
  });

  it('never leaves a descriptor keyed to a level that is gone', () => {
    const before = filledRubric(fourPoint);
    const { rubric } = applyLevels(before, levels(['Only', 1]));
    const liveIds = new Set(rubric.levels.map((level) => level.id));

    for (const criterion of rubric.criteria) {
      for (const key of Object.keys(criterion.descriptors)) expect(liveIds.has(key)).toBe(true);
    }
  });

  it('does not mutate the rubric it was given', () => {
    const before = filledRubric(fourPoint);
    const snapshot = JSON.stringify(before);
    applyLevels(before, levels(['Only', 1]));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('changes the total, since scoring reads the levels', () => {
    const before = filledRubric(fourPoint);
    expect(rubricTotal(before)).toBe(8); // 2 criteria × best level 4

    const { rubric } = applyLevels(before, levels(['Complete', 1], ['Incomplete', 0]));
    expect(rubricTotal(rubric)).toBe(2);
  });

  it('produces something the schema still accepts', () => {
    const { rubric } = applyLevels(filledRubric(fourPoint), levels(['A', 2], ['B', 1]));
    expect(RubricSchema.safeParse(rubric).success).toBe(true);
  });
});

describe('withoutLevel', () => {
  it('removes the level and the descriptors written for it', () => {
    const threePoint = levels(['High', 3], ['Mid', 2], ['Low', 1]);
    const before = filledRubric(threePoint);

    const after = withoutLevel(before, threePoint[1]!.id);

    expect(after.levels.map((level) => level.name)).toEqual(['High', 'Low']);
    for (const criterion of after.criteria) {
      expect(criterion.descriptors[threePoint[1]!.id]).toBeUndefined();
      // The survivors are untouched.
      expect(criterion.descriptors[threePoint[0]!.id]).toBeDefined();
    }
  });

  it('is a no-op for a level that is not there', () => {
    const before = filledRubric(levels(['A', 1]));
    expect(withoutLevel(before, 'not-a-level')).toEqual(before);
  });
});

describe('levelsFromSet', () => {
  it('copies with fresh ids, so the rubric owns its levels', () => {
    // Sharing ids with the config set would make editing one rubric's levels look
    // like it changed every rubric built from the same set.
    const set = { id: 'set-1', name: 'Four-point', levels: levels(['A', 4], ['B', 3]) };
    const copied = levelsFromSet(set, counter());

    expect(copied.map((level) => level.name)).toEqual(['A', 'B']);
    expect(copied.map((level) => level.id)).toEqual(['lvl-1', 'lvl-2']);
    expect(copied.map((level) => level.id)).not.toEqual(set.levels.map((level) => level.id));
  });
});

describe('descriptorCoverage', () => {
  it('counts written cells against the size of the grid', () => {
    const twoPoint = levels(['Yes', 1], ['No', 0]);
    const rubric = filledRubric(twoPoint);
    expect(descriptorCoverage(rubric)).toEqual({ written: 4, total: 4 });
  });

  it('does not count whitespace as written', () => {
    const twoPoint = levels(['Yes', 1], ['No', 0]);
    const rubric = aRubric({
      levels: twoPoint,
      criteria: [
        {
          ...aCriterion('Clarity', twoPoint),
          descriptors: { [twoPoint[0]!.id]: 'Real text', [twoPoint[1]!.id]: '   ' }
        }
      ]
    });
    expect(descriptorCoverage(rubric)).toEqual({ written: 1, total: 2 });
  });

  it('is zero-total for an empty rubric rather than dividing by nothing', () => {
    expect(descriptorCoverage(aRubric({ levels: [], criteria: [] }))).toEqual({
      written: 0,
      total: 0
    });
  });
});

describe('matchingLevelSet', () => {
  const set = { id: 'set-1', name: 'Four-point', levels: levels(['A', 4], ['B', 3]) };

  it('matches on shape, not on ids', () => {
    // The rubric's levels are always copies, so an id comparison never matches.
    const rubric = aRubric({ levels: levelsFromSet(set, counter()) });
    expect(matchingLevelSet(rubric, [set])?.name).toBe('Four-point');
  });

  it('does not match once the levels have been edited', () => {
    const rubric = aRubric({ levels: levels(['A', 4], ['B', 2]) });
    expect(matchingLevelSet(rubric, [set])).toBeUndefined();
  });
});
