import { describe, expect, it } from 'vitest';
import { collectionMarkdown, headline, outcomesMarkdown, rubricMarkdown } from './markdown';
import { readableContext } from './readable';
import { newId } from '$lib/domain/ids';
import { VaultSnapshotSchema, type Item, type VaultSnapshot } from '$lib/domain/schema';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels,
  options,
  worth
} from '$lib/domain/fixtures';

/*
  These assert on the shape of the document, not on every word of it. The dialect is
  allowed to be reworded; what it is not allowed to do is lose the key, mis-state a
  total, or renumber a question so that the exam and items.csv disagree.
*/

const vault = aVault({ code: 'STAT101', name: 'Introductory Statistics' });

function snapshotOf(partial: Partial<VaultSnapshot>): VaultSnapshot {
  return VaultSnapshotSchema.parse({ vault, ...partial });
}

function contextFor(
  partial: Partial<VaultSnapshot>,
  rubricSlugs = new Map<string, string>()
) {
  return readableContext(snapshotOf(partial), rubricSlugs);
}

describe('headline', () => {
  it('takes the first line of the stem, and says when that is all of it', () => {
    expect(headline('What is the median?')).toEqual({
      text: 'What is the median?',
      complete: true
    });
  });

  it('reports a multi-line stem as incomplete, so the body still prints it', () => {
    const head = headline('Consider the table:\n\n| a | b |');
    expect(head.complete).toBe(false);
    expect(head.text).not.toContain('\n');
  });

  it('says so rather than showing an empty heading', () => {
    expect(headline('   ').text).toBe('(no stem yet)');
  });

  it('cuts long stems on a word boundary', () => {
    const head = headline('a'.repeat(10) + ' ' + 'word '.repeat(40));
    expect(head.complete).toBe(false);
    expect(head.text.endsWith('…')).toBe(true);
    expect(head.text.length).toBeLessThan(80);
  });
});

describe('a collection as a document', () => {
  const sectionId = newId();

  function exam() {
    const collection = aCollection({
      vaultId: vault.id,
      kind: 'exam',
      title: 'Unit 1 Test',
      instructions: 'Answer every question.',
      sections: [{ id: sectionId, title: 'Part II', order: 0 }]
    });

    const first = anItem('choice', {
      collectionId: collection.id,
      stem: 'What is the median?',
      points: 1,
      options: options(['24', false], ['25', true])
    });
    const second = anItem('shortAnswer', {
      collectionId: collection.id,
      sectionId,
      stem: 'Compute the range.',
      expected: '9',
      accepted: ['nine'],
      points: 2
    });

    return { collection, items: [first, second] };
  }

  it('numbers continuously across sections, as a printed test does', () => {
    const { collection, items } = exam();
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    expect(text).toContain('### 1. What is the median?');
    expect(text).toContain('## Part II');
    expect(text).toContain('### 2. Compute the range.');
  });

  it('keeps sections above items in the heading outline', () => {
    // A `##` that might be either a section or a question is the one thing that would
    // make this document unreadable by anything but a person.
    const { collection, items } = exam();
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    const headings = text.split('\n').filter((line) => line.startsWith('#'));
    expect(headings.filter((line) => line.startsWith('## ') && !line.startsWith('### '))).toHaveLength(1);
  });

  it('marks the key with [x] and leaves the distractors unticked', () => {
    const { collection, items } = exam();
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    expect(text).toContain('- [ ] 24');
    expect(text).toContain('- [x] 25');
  });

  it('states the total, and the declared total when the two disagree', () => {
    const { collection, items } = exam();
    const withClaim = { ...collection, declaredPoints: 20 };
    const text = collectionMarkdown(withClaim, items, contextFor({ collections: [withClaim], items }));

    expect(text).toContain('worth 3 pt (declared 20 pt)');
  });

  it('does not print the stem twice when the heading already is the stem', () => {
    const { collection, items } = exam();
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    expect(text.match(/What is the median\?/g)).toHaveLength(1);
  });

  it('prints the stem in full when the heading could only carry part of it', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item = anItem('choice', {
      collectionId: collection.id,
      stem: 'Consider the table:\n\n| Shift | Patients |\n\nWhat is the median?'
    });
    const text = collectionMarkdown(collection, [item], contextFor({ collections: [collection], items: [item] }));

    expect(text).toContain('| Shift | Patients |');
    expect(text).toContain('What is the median?');
  });

  it('numbers a group’s parts under their parent', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const group = anItem('group', {
      collectionId: collection.id,
      stem: 'Answer both parts.',
      parts: [
        anItem('shortAnswer', { collectionId: collection.id, stem: 'First.', points: 1 }),
        anItem('shortAnswer', { collectionId: collection.id, order: 1, stem: 'Second.', points: 2 })
      ]
    });
    const text = collectionMarkdown(collection, [group], contextFor({ collections: [collection], items: [group] }));

    expect(text).toContain('### 1. Answer both parts.');
    expect(text).toContain('#### 1.1. First.');
    expect(text).toContain('#### 1.2. Second.');
    // The sum of its parts, said in the heading tag.
    expect(text).toContain('`3 pt`');
  });

  it('offers no points on a stimulus, and says nothing has been set on an item that is scorable', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const passage = anItem('stimulus', { collectionId: collection.id, stem: 'A passage.' });
    const unpriced = anItem('essay', { collectionId: collection.id, order: 1, stem: 'Discuss.' });
    const items = [passage, unpriced];
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    const headings = text.split('\n').filter((line) => line.startsWith('### '));
    // A passage is structurally unscorable, so `0 pt` beside one would read as a
    // mistake to go and fix. An essay nobody has priced yet IS one.
    expect(headings[0]).not.toContain('pt`');
    expect(headings[1]).toContain('`points not set`');
  });

  it('links an item’s rubric to the rubric’s own file in the same bundle', () => {
    const four = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({ vaultId: vault.id, title: 'Discussion participation', levels: four, criteria: [aCriterion('Clarity', four)] });
    const collection = aCollection({ vaultId: vault.id, title: 'Task' });
    const item = anItem('essay', { collectionId: collection.id, stem: 'Discuss.', rubricId: rubric.id });

    const context = contextFor(
      { collections: [collection], items: [item], rubrics: [rubric] },
      new Map([[rubric.id, 'discussion-participation']])
    );
    const text = collectionMarkdown(collection, [item], context);

    expect(text).toContain('[Discussion participation](../rubrics/discussion-participation.md) — up to 4 pt');
  });

  it('names a rubric that is not in the bundle rather than staying silent about it', () => {
    // An item that says nothing about scoring and one whose rubric has gone astray
    // must not read the same.
    const collection = aCollection({ vaultId: vault.id, title: 'Task' });
    const item = anItem('essay', { collectionId: collection.id, stem: 'Discuss.', rubricId: 'gone' });
    const text = collectionMarkdown(collection, [item], contextFor({ collections: [collection], items: [item] }));

    expect(text).toContain('**Rubric.** Not in this bundle');
  });

  it('keeps an empty section, because the author made it on purpose', () => {
    const collection = aCollection({
      vaultId: vault.id,
      title: 'Quiz',
      sections: [{ id: newId(), title: 'Part III — still to write', order: 0 }]
    });
    const text = collectionMarkdown(collection, [], contextFor({ collections: [collection] }));

    expect(text).toContain('## Part III — still to write');
  });

  it('shows an item whose section has gone missing rather than dropping it', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const orphan = anItem('choice', {
      collectionId: collection.id,
      sectionId: 'a-section-that-is-not-here',
      stem: 'Still a question.'
    });
    const text = collectionMarkdown(collection, [orphan], contextFor({ collections: [collection], items: [orphan] }));

    expect(text).toContain('Still a question.');
  });

  it('writes the posting requirements of a discussion prompt', () => {
    const collection = aCollection({ vaultId: vault.id, kind: 'discussion', title: 'Week 3' });
    const item = anItem('discussion', {
      collectionId: collection.id,
      stem: 'Post an example.',
      discussion: {
        initialPost: { minWords: 200, dueNote: 'Thursday' },
        replies: { count: 2, minWords: 75 }
      }
    });
    const text = collectionMarkdown(collection, [item], contextFor({ collections: [collection], items: [item] }));

    expect(text).toContain('**Initial post.** At least 200 words · due Thursday');
    expect(text).toContain('**Replies.** 2 replies · at least 75 words each');
  });

  it('quotes the instructions instead of giving them a heading', () => {
    const { collection, items } = exam();
    const text = collectionMarkdown(collection, items, contextFor({ collections: [collection], items }));

    expect(text).toContain('> Answer every question.');
  });

  it('survives a title that would break YAML', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Unit 1: "descriptives"' });
    const text = collectionMarkdown(collection, [], contextFor({ collections: [collection] }));

    expect(text).toContain('title: "Unit 1: \\"descriptives\\""');
  });
});

describe('the outcome tree as a document', () => {
  it('nests children under their parents and carries the ids', () => {
    const parent = anOutcome({ vaultId: vault.id, code: 'CO1', text: 'Summarise data.' });
    const child = anOutcome({
      vaultId: vault.id,
      code: 'EO1.1',
      text: 'Compute a median.',
      parentId: parent.id,
      notes: 'Mean and median only.'
    });
    const outcomes = [parent, child];

    const text = outcomesMarkdown(outcomes, contextFor({ outcomes }));

    expect(text).toContain(`- **CO1** Summarise data. \`#${parent.id}\``);
    expect(text).toContain(`  - **EO1.1** Compute a median. \`#${child.id}\``);
    // Indented under the bullet so it joins that item rather than starting a sibling.
    expect(text).toContain('    Mean and median only.');
  });

  it('says so when there is nothing yet', () => {
    expect(outcomesMarkdown([], contextFor({}))).toContain('No outcomes yet');
  });
});

describe('a rubric as a document', () => {
  function grid() {
    const four = levels(['Exemplary', 4], ['Proficient', 3]);
    return aRubric({
      vaultId: vault.id,
      title: 'Discussion participation',
      levels: four,
      criteria: [
        aCriterion('Clarity', four, { weight: 2 }),
        {
          id: newId(),
          title: 'Evidence | data',
          order: 1,
          outcomeIds: [],
          descriptors: {},
          levelPoints: {}
        }
      ]
    });
  }

  it('lays the levels out as columns and states the total in words', () => {
    const rubric = grid();
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('| Criterion | Exemplary (4 pt) | Proficient (3 pt) |');
    expect(text).toContain('Worth up to 8 pt — the sum of each criterion');
    expect(text).toContain('alternatives');
  });

  it('escapes a pipe in a criterion so it does not become a column', () => {
    const rubric = grid();
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('Evidence \\| data');
    // Every row has the same number of columns as the header.
    const rows = text.split('\n').filter((line) => line.startsWith('|'));
    const widths = new Set(rows.map((row) => row.split(/(?<!\\)\|/).length));
    expect(widths.size).toBe(1);
  });

  it('fills a missing descriptor rather than leaving a ragged row', () => {
    const rubric = grid();
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('| — | — |');
  });

  it('states what each criterion is worth, so the total can be added by eye', () => {
    // With per-criterion points the column headings are only defaults, so the first
    // column is the only place the arithmetic is checkable without a calculator.
    const rubric = grid();
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('worth up to 4 pt');
  });

  it('prints a cell that departs from its column, and says so above the table', () => {
    const four = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({
      vaultId: vault.id,
      title: 'Report',
      levels: four,
      criteria: [
        { ...aCriterion('Thesis', four), levelPoints: worth(four, 10, 7) },
        aCriterion('Mechanics', four)
      ]
    });
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('Worth up to 14 pt');
    expect(text).toContain('**10 pt**<br>Thesis at Exemplary');
    expect(text).toContain('that criterion is worth what the cell says instead');
    // The heading still carries the column default, which is what Mechanics uses.
    expect(text).toContain('| Criterion | Exemplary (4 pt) | Proficient (3 pt) |');
  });

  it('leaves a rubric on a plain shared scale reading exactly as it did', () => {
    // The explanatory line earns its place only where it explains something.
    const rubric = grid();
    expect(rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }))).not.toContain(
      'that criterion is worth what the cell says instead'
    );
  });

  it('explains itself rather than printing a table with no columns', () => {
    const rubric = aRubric({
      vaultId: vault.id,
      title: 'Half-written',
      levels: [],
      criteria: [aCriterion('Clarity', [])]
    });
    const text = rubricMarkdown(rubric, contextFor({ rubrics: [rubric] }));

    expect(text).toContain('no levels');
    expect(text).toContain('Clarity');
  });
});

describe('what the writers refuse to lose', () => {
  it('shows a custom field nobody declared', () => {
    // The extension seam: a field written by a newer version, or by hand.
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item: Item = {
      ...anItem('choice', { collectionId: collection.id, stem: 'A question.' }),
      fields: { reviewedBy: 'BE' }
    };
    const text = collectionMarkdown(collection, [item], contextFor({ collections: [collection], items: [item] }));

    expect(text).toContain('reviewedBy: BE');
  });

  it('shows a dangling outcome id rather than a gap where an outcome should be', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item = anItem('choice', {
      collectionId: collection.id,
      stem: 'A question.',
      outcomeIds: ['no-such-outcome']
    });
    const text = collectionMarkdown(collection, [item], contextFor({ collections: [collection], items: [item] }));

    expect(text).toContain('`@no-such-outcome`');
  });
});
