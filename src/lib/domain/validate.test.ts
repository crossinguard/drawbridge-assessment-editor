import { describe, expect, it } from 'vitest';
import { countBySeverity, sortIssues, validateVault, type ValidationInput } from './validate';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels,
  options
} from './fixtures';
import { VaultConfigSchema, type Collection, type Item, type Outcome, type Rubric } from './schema';

function check(input: {
  outcomes?: Outcome[];
  collections?: Collection[];
  items?: Record<string, Item[]>;
  rubrics?: Rubric[];
  vault?: ValidationInput['vault'];
}) {
  return validateVault({
    vault: input.vault ?? aVault(),
    outcomes: input.outcomes ?? [],
    collections: input.collections ?? [],
    itemsByCollection: new Map(Object.entries(input.items ?? {})),
    rubrics: input.rubrics ?? []
  });
}

const ruleIds = (issues: ReturnType<typeof check>) => issues.map((issue) => issue.ruleId);

describe('item shape rules', () => {
  const quiz = aCollection({ id: 'quiz', kind: 'quiz' });

  it('flags a single-answer item with no key and with more than one', () => {
    const none = check({
      collections: [quiz],
      items: { quiz: [anItem('choice', { options: options(['a', false], ['b', false]) })] }
    });
    expect(ruleIds(none)).toContain('item.choice-key');

    const two = check({
      collections: [quiz],
      items: { quiz: [anItem('choice', { options: options(['a', true], ['b', true]) })] }
    });
    expect(ruleIds(two)).toContain('item.choice-key');
  });

  it('accepts a single-answer item with exactly one key', () => {
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('choice', { options: options(['a', true], ['b', false]) })] }
    });
    expect(ruleIds(issues)).not.toContain('item.choice-key');
  });

  it('requires two or more correct on a multiple-response item', () => {
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('multi', { options: options(['a', true], ['b', false]) })] }
    });
    expect(ruleIds(issues)).toContain('item.multi-key');
  });

  it('requires exactly two options on true/false', () => {
    const issues = check({
      collections: [quiz],
      items: {
        quiz: [anItem('trueFalse', { options: options(['t', true], ['f', false], ['?', false]) })]
      }
    });
    expect(ruleIds(issues)).toContain('item.true-false-options');
  });

  it('flags a short answer with no expected response', () => {
    const issues = check({ collections: [quiz], items: { quiz: [anItem('shortAnswer')] } });
    expect(ruleIds(issues)).toContain('item.no-expected');
  });

  it('flags an empty group and stray options on a kind that has none', () => {
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('group'), anItem('essay', { options: options(['a', true]) })] }
    });
    expect(ruleIds(issues)).toContain('item.empty-group');
    expect(ruleIds(issues)).toContain('item.stray-options');
  });

  it('warns that points typed on a stimulus are not counted', () => {
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('stimulus', { points: 5, stem: 'A table.' })] }
    });
    expect(ruleIds(issues)).toContain('item.stimulus-points');
  });

  it('does not ask a stimulus or a group for outcomes or points', () => {
    // Both are exempt: a stimulus is not answered, and a group is scored and aligned
    // through its parts. The part itself is still fair game, which is why this asserts
    // per entity rather than across the whole list.
    const stimulus = anItem('stimulus', { id: 'passage', stem: 'A table.' });
    const group = anItem('group', {
      id: 'grp',
      parts: [anItem('choice', { id: 'part', points: 1, outcomeIds: ['o1'] })]
    });

    const issues = check({
      outcomes: [anOutcome({ id: 'o1' })],
      collections: [quiz],
      items: { quiz: [stimulus, group] }
    });

    const forExempt = issues.filter((i) => i.entityId === 'passage' || i.entityId === 'grp');
    expect(forExempt.map((i) => i.ruleId)).not.toContain('item.no-points');
    expect(forExempt.map((i) => i.ruleId)).not.toContain('item.no-outcome');
  });
});

describe('reference rules', () => {
  const quiz = aCollection({ id: 'quiz', kind: 'quiz' });

  it('reports every kind of dangling reference', () => {
    const issues = check({
      collections: [quiz],
      items: {
        quiz: [
          anItem('choice', {
            outcomeIds: ['gone'],
            rubricId: 'gone',
            stimulusId: 'gone',
            sectionId: 'gone'
          })
        ]
      }
    });

    expect(ruleIds(issues)).toEqual(
      expect.arrayContaining([
        'item.dangling-outcome',
        'item.dangling-rubric',
        'item.dangling-stimulus',
        'item.dangling-section'
      ])
    );
  });

  it('reports an outcome whose parent has been deleted', () => {
    const issues = check({ outcomes: [anOutcome({ id: 'o1', parentId: 'deleted' })] });
    expect(ruleIds(issues)).toContain('outcome.dangling-parent');
  });

  it('reports a collection pointing at a deleted rubric', () => {
    const issues = check({ collections: [aCollection({ id: 'c1', rubricId: 'gone' })] });
    expect(ruleIds(issues)).toContain('collection.dangling-rubric');
  });
});

describe('vocabulary rules read config, never literals', () => {
  it('accepts a status the vault defines and flags one it does not', () => {
    const vault = aVault();
    vault.config.statuses = [{ key: 'brewing', label: 'Brewing' }];
    const quiz = aCollection({ id: 'quiz', kind: 'quiz', status: 'brewing' });

    const ok = check({
      vault,
      collections: [quiz],
      items: { quiz: [anItem('essay', { status: 'brewing' })] }
    });
    expect(ruleIds(ok)).not.toContain('item.unknown-status');
    expect(ruleIds(ok)).not.toContain('collection.unknown-status');

    const bad = check({
      vault,
      collections: [aCollection({ id: 'q2', kind: 'quiz', status: 'ready' })]
    });
    // "ready" is a default elsewhere but not in THIS vault — the rule must not
    // special-case it.
    expect(ruleIds(bad)).toContain('collection.unknown-status');
  });

  it('flags a collection kind the vault does not define', () => {
    const issues = check({ collections: [aCollection({ kind: 'lab-practical' })] });
    expect(ruleIds(issues)).toContain('collection.unknown-kind');
  });

  it('treats an unset status as not-yet-set, not as wrong', () => {
    const issues = check({ collections: [aCollection({ kind: 'quiz', status: '' })] });
    expect(ruleIds(issues)).not.toContain('collection.unknown-status');
  });
});

describe('outcome rules', () => {
  it('flags duplicate codes on every outcome that shares one', () => {
    const issues = check({
      outcomes: [
        anOutcome({ id: 'a', code: 'EO1.1' }),
        anOutcome({ id: 'b', code: 'EO1.1' }),
        anOutcome({ id: 'c', code: 'EO1.2' })
      ]
    });
    expect(issues.filter((i) => i.ruleId === 'outcome.duplicate-code')).toHaveLength(2);
  });

  it('flags a code that does not match the vault pattern, at info level', () => {
    const issues = check({ outcomes: [anOutcome({ code: 'wobbly code' })] });
    const shape = issues.find((i) => i.ruleId === 'outcome.code-shape');
    expect(shape?.severity).toBe('info');
  });

  it('reports an unusable pattern instead of throwing on it', () => {
    const vault = aVault();
    vault.config.outcomePattern = '([unclosed';
    const issues = check({ vault, outcomes: [anOutcome()] });
    expect(ruleIds(issues)).toContain('vault.bad-outcome-pattern');
  });
});

describe('rubric rules', () => {
  const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);

  it('flags a criterion missing a descriptor for some level', () => {
    const sparse = aCriterion('Clarity', fourPoint);
    delete sparse.descriptors[fourPoint[1]!.id];

    const issues = check({ rubrics: [aRubric({ levels: fourPoint, criteria: [sparse] })] });
    expect(ruleIds(issues)).toContain('rubric.sparse-descriptors');
  });

  it('flags a rubric with no levels, because every criterion is then worth nothing', () => {
    const issues = check({ rubrics: [aRubric({ levels: [], criteria: [aCriterion('C', [])] })] });
    expect(ruleIds(issues)).toContain('rubric.no-levels');
  });

  it('says out loud that criterion weight is recorded but not applied', () => {
    const issues = check({
      rubrics: [
        aRubric({ levels: fourPoint, criteria: [aCriterion('Clarity', fourPoint, { weight: 2 })] })
      ]
    });
    expect(ruleIds(issues)).toContain('rubric.weight-not-applied');
  });

  it('reports points set for a level the rubric no longer has', () => {
    /*
      Only reachable by import or a hand-edited bundle — every level operation in the
      app prunes these. Worth saying anyway: unlike a stray descriptor, which is merely
      invisible text, this is arithmetic that looks present and does not apply, and
      someone comparing a total against their file needs to be told why.
    */
    const stranded = aCriterion('Clarity', fourPoint, { levelPoints: { 'gone-level': 12 } });
    const issues = check({ rubrics: [aRubric({ levels: fourPoint, criteria: [stranded] })] });

    expect(ruleIds(issues)).toContain('rubric.orphan-level-points');
  });

  it('reports an append naming a rubric that is gone', () => {
    // The grid just comes out shorter. Nothing on screen distinguishes that from a
    // rubric that never appended anything, which is why it has to be said.
    const orphan = aRubric({ levels: fourPoint, appends: ['deleted-rubric'] });
    expect(ruleIds(check({ rubrics: [orphan] }))).toContain('rubric.dangling-append');
  });

  it('reports an append loop, which terminates but still loses criteria', () => {
    const a = aRubric({ id: 'a', title: 'A', levels: fourPoint, appends: ['b'] });
    const b = aRubric({ id: 'b', title: 'B', levels: fourPoint, appends: ['a'] });

    const rules = ruleIds(check({ rubrics: [a, b] }));
    expect(rules).toContain('rubric.append-cycle');
    expect(rules).not.toContain('rubric.dangling-append');
  });

  it('mentions a tail that has no criteria to contribute', () => {
    const empty = aRubric({ id: 'tail', title: 'Professionalism', levels: fourPoint });
    const host = aRubric({ id: 'host', title: 'Report', levels: fourPoint, appends: ['tail'] });

    const issues = check({ rubrics: [host, empty] });
    const note = issues.find((issue) => issue.ruleId === 'rubric.append-empty');
    expect(note?.severity).toBe('info');
  });

  it('says nothing about an ordinary shared tail', () => {
    // Two rubrics appending the same tail is the intended use. If this fires, the
    // panel cries wolf on the feature's happy path.
    const tail = aRubric({
      id: 'tail',
      levels: fourPoint,
      criteria: [aCriterion('On time', fourPoint)]
    });
    const one = aRubric({ id: 'one', levels: fourPoint, appends: ['tail'] });
    const two = aRubric({ id: 'two', levels: fourPoint, appends: ['tail'] });

    const rules = ruleIds(check({ rubrics: [one, two, tail] }));
    expect(rules).not.toContain('rubric.dangling-append');
    expect(rules).not.toContain('rubric.append-cycle');
    expect(rules).not.toContain('rubric.append-empty');
  });

  it('says nothing about points that are keyed to levels the rubric has', () => {
    const weighted = aCriterion('Clarity', fourPoint, {
      levelPoints: Object.fromEntries(fourPoint.map((level, index) => [level.id, 10 - index]))
    });
    const issues = check({ rubrics: [aRubric({ levels: fourPoint, criteria: [weighted] })] });

    expect(ruleIds(issues)).not.toContain('rubric.orphan-level-points');
  });
});

describe('collection-kind capabilities', () => {
  const vaultWith = (kinds: unknown[]) =>
    aVault({ config: VaultConfigSchema.parse({ collectionKinds: kinds }) });

  it('says so when a kind hides points the total is still counting', () => {
    /*
      The rule that makes hiding the field safe. `ItemBody` states that hiding a field
      the schema accepts makes the editor and the model disagree; this is the user's
      own choice for their own kind, and points.ts still honours the number — so the
      only real risk is a figure that counts while being invisible. Say it, and the
      risk is gone.
    */
    const vault = vaultWith([{ key: 'task', label: 'Task', itemScoring: false }]);
    const task = aCollection({ id: 'task', kind: 'task' });
    const issues = check({
      vault,
      collections: [task],
      items: { task: [anItem('essay', { collectionId: 'task', points: 8 })] }
    });

    const note = issues.find((issue) => issue.ruleId === 'item.points-hidden-by-kind');
    expect(note?.severity).toBe('info');
    expect(note?.message).toContain('8');
  });

  it('says nothing when the kind shows points, or when there are none to hide', () => {
    const vault = vaultWith([
      { key: 'quiz', label: 'Quiz' },
      { key: 'task', label: 'Task', itemScoring: false }
    ]);

    const scored = check({
      vault,
      collections: [aCollection({ id: 'quiz', kind: 'quiz' })],
      items: { quiz: [anItem('choice', { collectionId: 'quiz', points: 8, options: options(['a', true], ['b', false]) })] }
    });
    expect(ruleIds(scored)).not.toContain('item.points-hidden-by-kind');

    const unscored = check({
      vault,
      collections: [aCollection({ id: 'task', kind: 'task' })],
      items: { task: [anItem('essay', { collectionId: 'task' })] }
    });
    expect(ruleIds(unscored)).not.toContain('item.points-hidden-by-kind');
  });

  it('does not fire for a kind the vault has never heard of', () => {
    // An unknown kind resolves to everything enabled, so its points ARE shown. The
    // unknown kind is reported separately; this rule staying quiet is the point.
    const vault = vaultWith([{ key: 'quiz', label: 'Quiz' }]);
    const odd = aCollection({ id: 'odd', kind: 'lab-practical' });
    const issues = check({
      vault,
      collections: [odd],
      items: { odd: [anItem('essay', { collectionId: 'odd', points: 8 })] }
    });

    expect(ruleIds(issues)).not.toContain('item.points-hidden-by-kind');
    expect(ruleIds(issues)).toContain('collection.unknown-kind');
  });
});

describe('points and coverage rules', () => {
  it('reports a declared total that disagrees with the items, without changing either', () => {
    const quiz = aCollection({ id: 'quiz', kind: 'quiz', declaredPoints: 20 });
    const items = { quiz: [anItem('choice', { points: 5 })] };
    const issues = check({ collections: [quiz], items });

    const mismatch = issues.find((i) => i.ruleId === 'collection.points-mismatch');
    expect(mismatch?.message).toContain('20');
    expect(mismatch?.message).toContain('5');
    // Advisory means advisory: the declared value is untouched.
    expect(quiz.declaredPoints).toBe(20);
  });

  it('does not flag a total that matches', () => {
    const quiz = aCollection({ id: 'quiz', kind: 'quiz', declaredPoints: 5 });
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('choice', { points: 5 })] }
    });
    expect(ruleIds(issues)).not.toContain('collection.points-mismatch');
  });

  it('tolerates floating-point totals rather than reporting a phantom mismatch', () => {
    const quiz = aCollection({ id: 'quiz', kind: 'quiz', declaredPoints: 0.3 });
    const issues = check({
      collections: [quiz],
      items: { quiz: [anItem('choice', { points: 0.1 }), anItem('choice', { points: 0.2 })] }
    });
    expect(ruleIds(issues)).not.toContain('collection.points-mismatch');
  });

  it('reports a leaf outcome nothing assesses', () => {
    const issues = check({ outcomes: [anOutcome({ id: 'o1', code: 'EO1.1' })] });
    expect(ruleIds(issues)).toContain('coverage.uncovered-outcome');
  });
});

describe('the rules never block and never throw', () => {
  it('survives a thoroughly broken vault', () => {
    const quiz = aCollection({ id: 'quiz', kind: 'nonsense', status: 'nonsense' });
    expect(() =>
      check({
        outcomes: [anOutcome({ id: 'a', code: 'X', parentId: 'b' })],
        collections: [quiz],
        items: {
          quiz: [
            anItem('group', { parts: [] }),
            anItem('choice', { stem: '', options: [], rubricId: 'gone' })
          ],
          orphaned: [anItem('choice')]
        },
        rubrics: [aRubric({ levels: [], criteria: [] })]
      })
    ).not.toThrow();
  });

  it('does not mutate anything it inspects', () => {
    const quiz = aCollection({ id: 'quiz', kind: 'quiz', declaredPoints: 99 });
    const item = anItem('choice', { points: 1 });
    const before = JSON.stringify({ quiz, item });

    check({ collections: [quiz], items: { quiz: [item] } });

    expect(JSON.stringify({ quiz, item })).toBe(before);
  });

  it('gives every issue a stable id, so a panel can keep a row selected', () => {
    const input = {
      collections: [aCollection({ id: 'quiz', kind: 'quiz' })],
      items: { quiz: [anItem('choice', { id: 'i1' })] }
    };
    expect(check(input).map((i) => i.id)).toEqual(check(input).map((i) => i.id));
  });
});

describe('issue presentation', () => {
  it('sorts most serious first', () => {
    const issues = check({
      collections: [aCollection({ id: 'quiz', kind: 'nonsense' })],
      items: { quiz: [anItem('choice', { options: options(['a', false]) })] }
    });
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const ranks = sortIssues(issues).map((i) => rank[i.severity]);

    // Non-decreasing by severity rank. Sorting the labels alphabetically would put
    // "info" before "warning" and assert the wrong order entirely.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(rank.error);
  });

  it('counts by severity', () => {
    const counts = countBySeverity(check({ outcomes: [anOutcome()] }));
    expect(counts.error + counts.warning + counts.info).toBeGreaterThan(0);
  });
});
