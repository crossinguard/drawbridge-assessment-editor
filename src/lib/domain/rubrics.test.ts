import { describe, expect, it } from 'vitest';
import {
  applyLevels,
  descriptorCoverage,
  effectiveCriteria,
  hasAppendCycle,
  levelsFromSet,
  matchingLevelSet,
  rubricsAppending,
  withoutLevel
} from './rubrics';
import { rubricTotal } from './points';
import { aCriterion, aRubric, levels, noTails, scoringContext, worth } from './fixtures';
import { RubricSchema, type Level, type Rubric } from './schema';

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

    const { rubric, dropped } = applyLevels(before, renamed);

    expect(dropped.descriptors).toBe(0);
    expect(rubric.criteria[0]?.descriptors[renamed[0]!.id]).toBe('Clarity at Exemplary');
    expect(rubric.criteria[0]?.descriptors[renamed[3]!.id]).toBe('Clarity at Beginning');
    expect(rubric.criteria[1]?.descriptors[renamed[1]!.id]).toBe('Evidence at Proficient');
  });

  it('reports how many descriptors a shorter scale would drop', () => {
    // Reported rather than silently discarded, so the UI can warn before committing.
    const before = filledRubric(fourPoint);
    const twoPoint = levels(['Complete', 1], ['Incomplete', 0]);

    const { rubric, dropped } = applyLevels(before, twoPoint);

    // Two criteria × the two levels that no longer exist.
    expect(dropped.descriptors).toBe(4);
    expect(Object.keys(rubric.criteria[0]?.descriptors ?? {})).toHaveLength(2);
  });

  it('leaves the extra columns empty when growing the scale', () => {
    const before = filledRubric(levels(['Yes', 1], ['No', 0]));
    const fourNew = levels(['A', 4], ['B', 3], ['C', 2], ['D', 1]);

    const { rubric, dropped } = applyLevels(before, fourNew);

    expect(dropped.descriptors).toBe(0);
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
    expect(rubricTotal(before, noTails)).toBe(8); // 2 criteria × best level 4

    const { rubric } = applyLevels(before, levels(['Complete', 1], ['Incomplete', 0]));
    expect(rubricTotal(rubric, noTails)).toBe(2);
  });

  it('produces something the schema still accepts', () => {
    const { rubric } = applyLevels(filledRubric(fourPoint), levels(['A', 2], ['B', 1]));
    expect(RubricSchema.safeParse(rubric).success).toBe(true);
  });

  it('carries points overrides across by position, alongside their descriptors', () => {
    /*
      The half that fails silently. Carrying the text but leaving the numbers behind
      would keep the grid looking right while changing what it is worth.
    */
    const before = aRubric({
      levels: fourPoint,
      criteria: [
        { ...aCriterion('Thesis', fourPoint), levelPoints: worth(fourPoint, 10, 7, 4, 0) }
      ]
    });
    expect(rubricTotal(before, noTails)).toBe(10);

    const renamed = levels(['Outstanding', 4], ['Strong', 3], ['Emerging', 2], ['Starting', 1]);
    const { rubric, dropped } = applyLevels(before, renamed);

    expect(dropped.points).toBe(0);
    expect(rubric.criteria[0]?.levelPoints[renamed[0]!.id]).toBe(10);
    expect(rubric.criteria[0]?.levelPoints[renamed[3]!.id]).toBe(0);
    // Which is the only reason the carrying matters: the total survives the swap.
    expect(rubricTotal(rubric, noTails)).toBe(10);
  });

  it('counts dropped overrides apart from dropped descriptors', () => {
    // They read differently in the warning: one is writing you can see is gone, the
    // other just makes the total quietly smaller.
    const before = aRubric({
      levels: fourPoint,
      criteria: [
        { ...aCriterion('Thesis', fourPoint), levelPoints: worth(fourPoint, 10, 7, 4, 0) }
      ]
    });

    const { rubric, dropped } = applyLevels(before, levels(['A', 2], ['B', 1]));

    expect(dropped).toEqual({ descriptors: 2, points: 2 });
    expect(Object.keys(rubric.criteria[0]?.levelPoints ?? {})).toHaveLength(2);
  });

  it('never leaves a points override keyed to a level that is gone', () => {
    const before = aRubric({
      levels: fourPoint,
      criteria: [
        { ...aCriterion('Thesis', fourPoint), levelPoints: worth(fourPoint, 10, 7, 4, 0) }
      ]
    });
    const { rubric } = applyLevels(before, levels(['Only', 1]));
    const liveIds = new Set(rubric.levels.map((level) => level.id));

    for (const criterion of rubric.criteria) {
      for (const key of Object.keys(criterion.levelPoints)) expect(liveIds.has(key)).toBe(true);
    }
  });

  it('carries an override written for a level with no descriptor', () => {
    // Sparse in both directions: a criterion may be worth something at a level nobody
    // has written a descriptor for yet. Keying the carry off the descriptor would lose
    // exactly those, which is the case the author is least likely to check.
    const bare = aRubric({
      levels: fourPoint,
      criteria: [
        {
          ...aCriterion('Thesis', fourPoint),
          descriptors: {},
          levelPoints: worth(fourPoint, 10, 7, 4, 0)
        }
      ]
    });

    const renamed = levels(['A', 4], ['B', 3], ['C', 2], ['D', 1]);
    const { rubric, dropped } = applyLevels(bare, renamed);

    expect(dropped).toEqual({ descriptors: 0, points: 0 });
    expect(rubric.criteria[0]?.levelPoints[renamed[0]!.id]).toBe(10);
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

  it('removes what that level was worth, too', () => {
    // Left behind, the override is unreachable arithmetic that would be re-adopted if
    // the id ever came back — and would show up as noise the moment anything iterated.
    const threePoint = levels(['High', 3], ['Mid', 2], ['Low', 1]);
    const before = aRubric({
      levels: threePoint,
      criteria: [
        { ...aCriterion('Thesis', threePoint), levelPoints: worth(threePoint, 9, 6, 3) }
      ]
    });

    const after = withoutLevel(before, threePoint[0]!.id);

    expect(after.criteria[0]?.levelPoints[threePoint[0]!.id]).toBeUndefined();
    expect(after.criteria[0]?.levelPoints[threePoint[1]!.id]).toBe(6);
    // Losing the best level lowers the criterion to the best of what is left.
    expect(rubricTotal(after, noTails)).toBe(6);
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

describe('effectiveCriteria', () => {
  /*
    A 4-point host and a 2-point tail, which is the pairing the whole feature turns on.
    If the tail were ever scored against the host's levels the difference would show up
    here and nowhere else — every descriptor would render blank and the total would be
    four points too high, with no error raised by anything.
  */
  const hostLevels = levels(['Exemplary', 4], ['Proficient', 3], ['Beginning', 1]);
  const tailLevels = levels(['Met', 2], ['Not met', 0]);

  function pair(): { host: Rubric; tail: Rubric } {
    const tail = aRubric({
      id: 'tail',
      title: 'Professionalism',
      levels: tailLevels,
      criteria: [aCriterion('On time', tailLevels)]
    });
    const host = aRubric({
      id: 'host',
      title: 'Written report',
      levels: hostLevels,
      criteria: [aCriterion('Thesis', hostLevels), aCriterion('Evidence', hostLevels)],
      appends: [tail.id]
    });
    return { host, tail };
  }

  it('scores a tail against ITS OWN levels, not the host it hangs off', () => {
    /*
      THE test for this stage. Host is 2 criteria × best level 4 = 8; the tail adds its
      own best level, 2. Scoring the tail against the host's levels would give 12, which
      is both wrong and exactly what a naive implementation produces — the levels are
      right there on the rubric being totalled.
    */
    const { host, tail } = pair();
    expect(rubricTotal(host, scoringContext(host, tail))).toBe(10);
    expect(rubricTotal(host, scoringContext(host, tail))).not.toBe(12);
  });

  it('puts the tail after the host, in each rubric’s own order', () => {
    const { host, tail } = pair();
    const composed = effectiveCriteria(host, scoringContext(host, tail).rubricsById);

    expect(composed.map((entry) => entry.criterion.title)).toEqual([
      'Thesis',
      'Evidence',
      'On time'
    ]);
    expect(composed.map((entry) => entry.inherited)).toEqual([false, false, true]);
  });

  it('carries the source rubric, which is the only reason scoring can be right', () => {
    const { host, tail } = pair();
    const composed = effectiveCriteria(host, scoringContext(host, tail).rubricsById);

    expect(composed[0]?.source.id).toBe('host');
    expect(composed[2]?.source.id).toBe('tail');
    expect(composed[2]?.source.levels).toEqual(tailLevels);
  });

  it('skips an append naming a rubric that is gone, rather than throwing', () => {
    // Half a course arriving in a bundle must still open. validate.ts reports it.
    const { host } = pair();
    const composed = effectiveCriteria(host, scoringContext(host).rubricsById);

    expect(composed.map((entry) => entry.criterion.title)).toEqual(['Thesis', 'Evidence']);
    expect(rubricTotal(host, scoringContext(host))).toBe(8);
  });

  it('terminates on a rubric that appends itself', () => {
    const selfish = aRubric({
      id: 'self',
      levels: hostLevels,
      criteria: [aCriterion('Thesis', hostLevels)],
      appends: ['self']
    });

    const composed = effectiveCriteria(selfish, scoringContext(selfish).rubricsById);
    // Counted once, not twice: the `seen` set stops the second visit.
    expect(composed).toHaveLength(1);
    expect(rubricTotal(selfish, scoringContext(selfish))).toBe(4);
  });

  it('terminates on an A → B → A cycle', () => {
    const a = aRubric({
      id: 'a',
      levels: hostLevels,
      criteria: [aCriterion('From A', hostLevels)],
      appends: ['b']
    });
    const b = aRubric({
      id: 'b',
      levels: tailLevels,
      criteria: [aCriterion('From B', tailLevels)],
      appends: ['a']
    });

    const composed = effectiveCriteria(a, scoringContext(a, b).rubricsById);
    expect(composed.map((entry) => entry.criterion.title)).toEqual(['From A', 'From B']);
    // 4 from A's best level, 2 from B's — each against its own scale, cycle or not.
    expect(rubricTotal(a, scoringContext(a, b))).toBe(6);
  });

  it('composes a chain, each link against its own levels', () => {
    const c = aRubric({ id: 'c', levels: tailLevels, criteria: [aCriterion('C', tailLevels)] });
    const b = aRubric({
      id: 'b',
      levels: tailLevels,
      criteria: [aCriterion('B', tailLevels)],
      appends: ['c']
    });
    const a = aRubric({
      id: 'a',
      levels: hostLevels,
      criteria: [aCriterion('A', hostLevels)],
      appends: ['b']
    });

    expect(rubricTotal(a, scoringContext(a, b, c))).toBe(8); // 4 + 2 + 2
  });

  it('resolves a tail’s per-criterion points against the tail’s level ids', () => {
    /*
      Where the two stages meet, and the specific way this fails silently: levelPoints
      is keyed by level id, so a tail scored against the host's levels finds no entry
      for any of them and falls back to the host's column points. The wrong answer here
      is 4 — the host's best level — not 6.
    */
    const tail = aRubric({
      id: 'tail',
      levels: tailLevels,
      criteria: [{ ...aCriterion('On time', tailLevels), levelPoints: worth(tailLevels, 6, 0) }]
    });
    const host = aRubric({
      id: 'host',
      levels: hostLevels,
      criteria: [aCriterion('Thesis', hostLevels)],
      appends: [tail.id]
    });

    expect(rubricTotal(host, scoringContext(host, tail))).toBe(10); // 4 + 6
  });

  it('leaves the host’s own record untouched', () => {
    // Composition is a read. Anything that wrote inherited criteria back onto the host
    // would turn a shared tail into a copy the first time a screen rendered it.
    const { host, tail } = pair();
    const before = JSON.stringify(host);
    effectiveCriteria(host, scoringContext(host, tail).rubricsById);
    expect(JSON.stringify(host)).toBe(before);
    expect(host.criteria).toHaveLength(2);
  });
});

describe('hasAppendCycle', () => {
  const scale = levels(['Yes', 1], ['No', 0]);

  it('sees a rubric that appends itself', () => {
    const selfish = aRubric({ id: 'self', levels: scale, appends: ['self'] });
    expect(hasAppendCycle(selfish, scoringContext(selfish).rubricsById)).toBe(true);
  });

  it('sees an A → B → A loop', () => {
    const a = aRubric({ id: 'a', levels: scale, appends: ['b'] });
    const b = aRubric({ id: 'b', levels: scale, appends: ['a'] });
    expect(hasAppendCycle(a, scoringContext(a, b).rubricsById)).toBe(true);
    expect(hasAppendCycle(b, scoringContext(a, b).rubricsById)).toBe(true);
  });

  it('does not call a plain shared tail a cycle', () => {
    // Two rubrics appending the same tail is the intended use, not a loop.
    const tail = aRubric({ id: 'tail', levels: scale });
    const one = aRubric({ id: 'one', levels: scale, appends: ['tail'] });
    const two = aRubric({ id: 'two', levels: scale, appends: ['tail'] });

    const context = scoringContext(one, two, tail).rubricsById;
    expect(hasAppendCycle(one, context)).toBe(false);
    expect(hasAppendCycle(two, context)).toBe(false);
    expect(hasAppendCycle(tail, context)).toBe(false);
  });

  it('is false for a dangling append rather than throwing', () => {
    const orphan = aRubric({ id: 'orphan', levels: scale, appends: ['deleted'] });
    expect(hasAppendCycle(orphan, scoringContext(orphan).rubricsById)).toBe(false);
  });
});

describe('rubricsAppending', () => {
  it('finds which rubrics lean on a tail, so deleting it can say so', () => {
    const tail = aRubric({ id: 'tail', title: 'Professionalism' });
    const one = aRubric({ id: 'one', title: 'Report', appends: ['tail'] });
    const two = aRubric({ id: 'two', title: 'Presentation', appends: ['tail'] });
    const alone = aRubric({ id: 'alone', title: 'Quiz' });

    expect(rubricsAppending('tail', [one, two, alone, tail]).map((r) => r.title)).toEqual([
      'Report',
      'Presentation'
    ]);
    expect(rubricsAppending('alone', [one, two, alone, tail])).toEqual([]);
  });
});
