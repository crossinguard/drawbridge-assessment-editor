import { newCollection, newItem, newOutcome, newRubric, newVault } from './defaults';
import { newId } from './ids';
import type { Criterion, Item, ItemKind, Level, Option, VaultSnapshot } from './schema';

/*
  A course to look at.

  Every screen in this app is empty until somebody has spent an hour filling it in, which
  makes the app hard to evaluate and — more to the point here — makes every stage of work
  on it start by hand-building a fixture. This is one click instead.

  A TypeScript module rather than a zip in `static/`. A binary is unreviewable in a diff
  and goes stale SILENTLY against a schema change; a module goes stale loudly, because
  `pnpm check` stops compiling. It also means the sample is typed against the real model
  rather than against whatever the model looked like when somebody last exported it.

  Deliberately not `fixtures.ts`, which is test-only by convention and builds the smallest
  thing that exercises a rule. This builds the opposite: a course with enough in it to
  recognise, including — on purpose — one unfinished item and one outcome nothing
  assesses, so the problems panel and the coverage gap both have something real to show.
  `sample.test.ts` pins that none of that rises to an ERROR: a demo that opens red would
  be teaching the wrong lesson about a validator whose whole point is that it never blocks.

  Ids are minted fresh on every call, so two loads give two independent courses. That
  matters — this is a normal vault the user can edit and delete, not a shared demo.
*/

function options(...specs: [text: string, correct: boolean][]): Option[] {
  return specs.map(([text, correct]) => ({ id: newId(), text, correct }));
}

function levels(...specs: [name: string, points: number][]): Level[] {
  return specs.map(([name, points]) => ({ id: newId(), name, points }));
}

function criterion(
  title: string,
  scale: readonly Level[],
  descriptors: readonly string[],
  extra: Partial<Criterion> = {}
): Criterion {
  return {
    id: newId(),
    title,
    order: 0,
    outcomeIds: [],
    descriptors: Object.fromEntries(scale.map((level, index) => [level.id, descriptors[index] ?? ''])),
    levelPoints: {},
    ...extra
  };
}

/** Points overrides against a scale, positionally. Undefined entries inherit the column. */
function worth(scale: readonly Level[], ...points: number[]): Record<string, number> {
  return Object.fromEntries(
    scale.flatMap((level, index) => {
      const value = points[index];
      return value === undefined ? [] : [[level.id, value] as const];
    })
  );
}

function item(kind: ItemKind, collectionId: string, extra: Partial<Item> = {}): Item {
  return { ...newItem({ collectionId, kind }), ...extra };
}

export function sampleSnapshot(): VaultSnapshot {
  const vault = newVault({
    name: 'Introductory Statistics',
    code: 'STAT101',
    term: 'Sample course',
    description:
      'A worked example, loaded from the home screen. Edit it, export it, or delete it — ' +
      'it behaves exactly like a course you made yourself.'
  });

  // ---------------------------------------------------------------------
  // Outcomes — three tiers deep in one branch, two in another, because the
  // tree is allowed to be uneven and the sample should show that.
  // ---------------------------------------------------------------------
  const co1 = newOutcome({
    vaultId: vault.id,
    code: 'CO1',
    text: 'Summarise and describe a set of data.'
  });
  const eo11 = newOutcome({
    vaultId: vault.id,
    parentId: co1.id,
    code: 'EO1.1',
    text: 'Compute a measure of centre.',
    notes: 'Median and mean only; mode is out of scope this term.'
  });
  const lo111 = newOutcome({
    vaultId: vault.id,
    parentId: eo11.id,
    code: 'LO1.1.1',
    text: 'Find the median of an unordered list.'
  });
  const eo12 = newOutcome({
    vaultId: vault.id,
    parentId: co1.id,
    order: 1,
    code: 'EO1.2',
    text: 'Describe the spread of a distribution.'
  });

  const co2 = newOutcome({
    vaultId: vault.id,
    order: 1,
    code: 'CO2',
    text: 'Reason about samples and populations.'
  });
  const eo21 = newOutcome({
    vaultId: vault.id,
    parentId: co2.id,
    code: 'EO2.1',
    text: 'Distinguish a sample from the population it came from.'
  });
  const eo22 = newOutcome({
    vaultId: vault.id,
    parentId: co2.id,
    order: 1,
    code: 'EO2.2',
    text: 'Interpret a confidence interval in context.'
  });

  // Nothing assesses this one, on purpose: it is what the coverage screen is for.
  const co3 = newOutcome({
    vaultId: vault.id,
    order: 2,
    code: 'CO3',
    text: 'Communicate a statistical finding to a non-specialist.'
  });

  const outcomes = [co1, eo11, lo111, eo12, co2, eo21, eo22, co3];

  // ---------------------------------------------------------------------
  // Rubrics
  // ---------------------------------------------------------------------
  const scale = levels(['Competent', 4], ['Approaching', 2], ['Not evident', 0]);

  const participation = newRubric({
    vaultId: vault.id,
    title: 'Discussion participation',
    description: 'Reused every week. Attach it to a prompt rather than copying it.',
    levels: scale
  });
  participation.criteria = [
    criterion(
      'Clarity of the claim',
      scale,
      [
        'States a claim and the evidence for it in the first two sentences.',
        'States a claim; the evidence has to be inferred.',
        'No identifiable claim.'
      ],
      { outcomeIds: [eo22.id] }
    ),
    criterion(
      'Engagement with others',
      scale,
      [
        'Replies extend or challenge a specific point, with reasons.',
        'Replies agree or restate without adding.',
        'No replies, or replies unrelated to the thread.'
      ],
      { order: 1 }
    )
  ];

  const reportScale = levels(['Competent', 6], ['Approaching', 3], ['Not evident', 0]);
  const report = newRubric({
    vaultId: vault.id,
    title: 'Written report',
    description:
      'Scores the whole task at once, rather than item by item. Interpretation carries ' +
      'its own points, so it is worth more than the criterion above it.',
    levels: reportScale
  });
  report.criteria = [
    criterion(
      'Choice of summary',
      reportScale,
      [
        'Chooses a summary suited to the shape of the data and says why.',
        'Chooses a defensible summary without justifying it.',
        'Summary does not fit the data.'
      ],
      { outcomeIds: [eo11.id, eo12.id] }
    ),
    criterion(
      'Interpretation',
      reportScale,
      [
        'Reads the result back into the original question, with its limits.',
        'Reports the result without interpreting it.',
        'No interpretation offered.'
      ],
      // Worth more than the column heading says: this is the point of the report, and
      // it is here so a first-time reader meets a criterion carrying its own points
      // rather than discovering the feature by accident.
      { order: 1, outcomeIds: [eo21.id], levelPoints: worth(reportScale, 10, 5, 0) }
    )
  ];

  const rubrics = [participation, report];

  // ---------------------------------------------------------------------
  // A quiz: the four selected-response kinds
  // ---------------------------------------------------------------------
  const quiz = newCollection({
    vaultId: vault.id,
    kind: 'quiz',
    title: 'Quiz 1 — Describing data',
    status: 'ready',
    description: 'Fifteen minutes, open notes.',
    instructions: 'Answer every question. There is no penalty for a wrong answer.'
  });
  quiz.declaredPoints = 8;

  const quizItems: Item[] = [
    item('choice', quiz.id, {
      stem: 'A charge nurse records patients over five shifts: 24, 28, 22, 31, 25.\n\nWhat is the median?',
      options: options(['24', false], ['25', true], ['26', false], ['28', false]),
      points: 2,
      status: 'ready',
      outcomeIds: [lo111.id],
      rationale: 'Ordered: 22, 24, 25, 28, 31. The middle value is 25.',
      tags: { difficulty: 'easy', bloom: 'apply' }
    }),
    item('multi', quiz.id, {
      order: 1,
      stem: 'Which of these are measures of **spread**?',
      options: options(
        ['Range', true],
        ['Standard deviation', true],
        ['Median', false],
        ['Interquartile range', true]
      ),
      points: 3,
      status: 'ready',
      outcomeIds: [eo12.id],
      feedback: 'The median is a measure of centre, not spread.',
      tags: { difficulty: 'moderate' }
    }),
    item('trueFalse', quiz.id, {
      order: 2,
      stem: 'A larger sample always removes bias from an estimate.',
      options: options(['True', false], ['False', true]),
      points: 1,
      status: 'reviewed',
      outcomeIds: [eo21.id],
      rationale:
        'Size reduces variance, not bias. A badly drawn sample is just as biased when it is large.'
    }),
    item('shortAnswer', quiz.id, {
      order: 3,
      stem: 'Give the range of: 22, 24, 25, 28, 31.',
      expected: '9',
      accepted: ['9 patients', 'nine'],
      points: 2,
      status: 'ready',
      outcomeIds: [eo12.id]
    })
  ];

  // ---------------------------------------------------------------------
  // An exam: sections, a shared stimulus, and a multi-part group
  // ---------------------------------------------------------------------
  const partI = newId();
  const partII = newId();
  const exam = newCollection({
    vaultId: vault.id,
    kind: 'exam',
    title: 'Unit 1 Test',
    status: 'drafted',
    instructions: 'Show your working. Calculators are permitted.'
  });
  exam.sections = [
    { id: partI, title: 'Part I — Reading a table', order: 0 },
    { id: partII, title: 'Part II — Interpretation', order: 1 }
  ];

  const passage = item('stimulus', exam.id, {
    sectionId: partI,
    stem:
      'A clinic records waiting times, in minutes, for one morning:\n\n' +
      '| Patient | Wait |\n| --- | --- |\n| 1 | 12 |\n| 2 | 19 |\n| 3 | 8 |\n| 4 | 45 |\n| 5 | 14 |',
    status: 'drafted'
  });

  const examItems: Item[] = [
    passage,
    item('choice', exam.id, {
      order: 1,
      sectionId: partI,
      stem: 'Which summary best describes the typical wait?',
      stimulusId: passage.id,
      options: options(
        ['The mean, because it uses every value', false],
        ['The median, because one wait is far longer than the rest', true],
        ['The range, because it shows the spread', false]
      ),
      points: 2,
      status: 'drafted',
      outcomeIds: [eo11.id],
      rationale: 'The 45-minute wait drags the mean upward; the median is unaffected by it.'
    }),
    item('group', exam.id, {
      order: 2,
      sectionId: partII,
      stem: 'Using the table above, answer both parts.',
      status: 'drafted',
      parts: [
        item('shortAnswer', exam.id, {
          stem: 'Compute the interquartile range.',
          expected: '11',
          points: 3,
          outcomeIds: [eo12.id]
        }),
        item('essay', exam.id, {
          order: 1,
          stem: 'Explain, in a sentence, why the range is a poor summary of these waits.',
          expected:
            'The range depends on only the two extreme values, so a single unusually long wait sets it.',
          points: 4,
          outcomeIds: [eo12.id]
        })
      ]
    }),
    /*
      Left unfinished on purpose. It has no points and no outcome, so the problems panel
      has something to report the moment the sample is loaded — which is the honest
      demonstration of a validator that reports rather than blocks.
    */
    item('shortAnswer', exam.id, {
      order: 3,
      sectionId: partII,
      stem: 'TODO: something on confidence intervals here.',
      status: 'drafted'
    })
  ];

  // ---------------------------------------------------------------------
  // A discussion, and a task scored by one rubric
  // ---------------------------------------------------------------------
  const discussion = newCollection({
    vaultId: vault.id,
    kind: 'discussion',
    title: 'Week 3 — Misleading statistics',
    status: 'ready',
    order: 2
  });

  const discussionItems: Item[] = [
    item('discussion', discussion.id, {
      stem:
        'Find a statistic quoted in the news this week and explain what it does **not** tell you.\n\n' +
        'Link the source.',
      rubricId: participation.id,
      status: 'ready',
      outcomeIds: [eo22.id],
      discussion: {
        initialPost: {
          minWords: 200,
          dueNote: 'Thursday 23:59',
          requirements: 'Link the source and quote the figure exactly as it was given.'
        },
        replies: {
          count: 2,
          minWords: 75,
          dueNote: 'Sunday 23:59',
          requirements: 'Extend or challenge a specific point; "I agree" is not a reply.'
        }
      }
    })
  ];

  const task = newCollection({
    vaultId: vault.id,
    kind: 'task',
    title: 'Final report',
    status: 'drafted',
    order: 3,
    description: 'Scored by the Written report rubric as one piece, not item by item.'
  });
  task.rubricId = report.id;

  const taskItems: Item[] = [
    item('essay', task.id, {
      stem:
        'Choose a dataset from the course page. Summarise it, justify your choice of summary, ' +
        'and say what the summary hides.',
      expected:
        'A strong response names the shape of the distribution before choosing a summary, and ' +
        'is explicit about what the chosen figure conceals.',
      status: 'drafted',
      outcomeIds: [eo11.id, eo21.id]
    })
  ];

  return {
    vault,
    outcomes,
    collections: [quiz, exam, discussion, task],
    items: [...quizItems, ...examItems, ...discussionItems, ...taskItems],
    rubrics
  };
}
