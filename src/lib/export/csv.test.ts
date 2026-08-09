import { describe, expect, it } from 'vitest';
import { BOM, coverageCsv, itemsCsv } from './csv';
import { readableContext } from './readable';
import { newId } from '$lib/domain/ids';
import { VaultSnapshotSchema, type VaultSnapshot } from '$lib/domain/schema';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels
} from '$lib/domain/fixtures';

const vault = aVault({ code: 'STAT101', name: 'Introductory Statistics' });

function snapshotOf(partial: Partial<VaultSnapshot>): VaultSnapshot {
  return VaultSnapshotSchema.parse({ vault, ...partial });
}

/**
 * A CSV reader, written here rather than imported, so these tests check the file a
 * spreadsheet would actually see instead of trusting the writer's own idea of it.
 */
function rowsOf(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const body = csv.startsWith(BOM) ? csv.slice(BOM.length) : csv;

  for (let at = 0; at < body.length; at += 1) {
    const character = body[at];

    if (quoted) {
      if (character !== '"') field += character;
      else if (body[at + 1] === '"') (field += '"'), (at += 1);
      else quoted = false;
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ',') (row.push(field), (field = ''));
    else if (character === '\r' && body[at + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      at += 1;
    } else field += character;
  }

  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

function column(csv: string, name: string): string[] {
  const rows = rowsOf(csv);
  const index = rows[0]!.indexOf(name);
  return rows.slice(1).map((row) => row[index]!);
}

describe('the file itself', () => {
  it('starts with a byte-order mark, so Excel on Windows reads the accents', () => {
    // The user's work machine is Windows, and a BOM-less UTF-8 CSV opens there as the
    // system code page: "Café" becomes "CafÃ©". Every other reader skips the mark.
    const csv = itemsCsv(snapshotOf({}), readableContext(snapshotOf({})));
    expect(csv.codePointAt(0)).toBe(0xfeff);
  });

  it('ends its rows with CRLF, per RFC 4180', () => {
    const csv = itemsCsv(snapshotOf({}), readableContext(snapshotOf({})));
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes a field holding a comma or a quote, and doubles the quotes', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item = anItem('choice', {
      collectionId: collection.id,
      stem: 'Which, if any, is the "best" estimate?'
    });
    const snapshot = snapshotOf({ collections: [collection], items: [item] });
    const csv = itemsCsv(snapshot, readableContext(snapshot));

    expect(csv).toContain('"Which, if any, is the ""best"" estimate?"');
    expect(column(csv, 'stem')).toEqual(['Which, if any, is the "best" estimate?']);
  });

  it('collapses a multi-line stem onto one line', () => {
    // The lossless form is right there in the same bundle. A row that spans four
    // lines is not a row.
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item = anItem('choice', { collectionId: collection.id, stem: 'Line one.\n\nLine two.' });
    const snapshot = snapshotOf({ collections: [collection], items: [item] });

    expect(column(itemsCsv(snapshot, readableContext(snapshot)), 'stem')).toEqual([
      'Line one. Line two.'
    ]);
  });
});

describe('items.csv', () => {
  const sectionId = newId();

  function exam() {
    const outcome = anOutcome({ vaultId: vault.id, code: 'EO1.1' });
    const collection = aCollection({
      vaultId: vault.id,
      kind: 'exam',
      title: 'Unit 1 Test',
      sections: [{ id: sectionId, title: 'Part II', order: 0 }]
    });
    const first = anItem('choice', {
      collectionId: collection.id,
      stem: 'First.',
      points: 1,
      outcomeIds: [outcome.id],
      status: 'ready',
      tags: { difficulty: 'easy' }
    });
    const group = anItem('group', {
      collectionId: collection.id,
      sectionId,
      stem: 'Both parts.',
      parts: [
        anItem('shortAnswer', { collectionId: collection.id, stem: 'Part one.', points: 2 }),
        anItem('shortAnswer', { collectionId: collection.id, order: 1, stem: 'Part two.', points: 3 })
      ]
    });

    return snapshotOf({
      outcomes: [outcome],
      collections: [collection],
      items: [first, group]
    });
  }

  it('numbers rows the way the Markdown numbers questions', () => {
    // "Question 4" has to mean the same thing in both files or neither is trustworthy.
    const csv = itemsCsv(exam(), readableContext(exam()));
    expect(column(csv, 'number')).toEqual(['1.', '2.', '2.1.', '2.2.']);
  });

  it('gives a group’s parts their own rows, keyed to the parent', () => {
    const snapshot = exam();
    const csv = itemsCsv(snapshot, readableContext(snapshot));
    const group = snapshot.items.find((item) => item.kind === 'group')!;

    expect(column(csv, 'parentId')).toEqual(['', '', group.id, group.id]);
    // The parent already carries the sum, so a naive sum of this column is wrong and
    // parentId is how a reader excludes the parts.
    expect(column(csv, 'points')).toEqual(['1', '5', '2', '3']);
  });

  it('says where a number came from, so 0 is not ambiguous', () => {
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const passage = anItem('stimulus', { collectionId: collection.id, stem: 'A passage.' });
    const unpriced = anItem('essay', { collectionId: collection.id, order: 1, stem: 'Discuss.' });
    const snapshot = snapshotOf({ collections: [collection], items: [passage, unpriced] });

    expect(column(itemsCsv(snapshot, readableContext(snapshot)), 'pointsSource')).toEqual([
      'unscored',
      'undeclared'
    ]);
  });

  it('carries the section, the status label and the tags', () => {
    const snapshot = exam();
    const csv = itemsCsv(snapshot, readableContext(snapshot));

    expect(column(csv, 'section')).toEqual(['', 'Part II', 'Part II', 'Part II']);
    expect(column(csv, 'status')[0]).toBe('Ready');
    expect(column(csv, 'tags')[0]).toBe('Difficulty: easy');
    expect(column(csv, 'outcomes')[0]).toBe('EO1.1');
  });

  it('marks a total that is a ceiling rather than a fixed value', () => {
    const four = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({ vaultId: vault.id, levels: four, criteria: [aCriterion('Clarity', four)] });
    const collection = aCollection({ vaultId: vault.id, title: 'Task' });
    const item = anItem('essay', { collectionId: collection.id, stem: 'Discuss.', rubricId: rubric.id });
    const snapshot = snapshotOf({ collections: [collection], items: [item], rubrics: [rubric] });
    const csv = itemsCsv(snapshot, readableContext(snapshot));

    expect(column(csv, 'points')).toEqual(['4']);
    expect(column(csv, 'pointsAreMaximum')).toEqual(['true']);
  });
});

describe('coverage.csv', () => {
  function course() {
    const parent = anOutcome({ vaultId: vault.id, code: 'CO1', text: 'Summarise data.' });
    const covered = anOutcome({ vaultId: vault.id, code: 'EO1.1', parentId: parent.id });
    const gap = anOutcome({ vaultId: vault.id, code: 'CO2', text: 'Sampling.', order: 1 });

    const collection = aCollection({ vaultId: vault.id, kind: 'exam', title: 'Unit 1 Test' });
    const item = anItem('choice', {
      collectionId: collection.id,
      points: 2,
      outcomeIds: [covered.id]
    });

    return snapshotOf({
      outcomes: [parent, covered, gap],
      collections: [collection],
      items: [item]
    });
  }

  it('gives an outcome nothing assesses a row rather than leaving it out', () => {
    // The most important fact in the file must not be its only invisible one.
    const snapshot = course();
    const csv = coverageCsv(snapshot, readableContext(snapshot));

    expect(rowsOf(csv).slice(1).map((row) => [row[0], row[3], row[4], row[7], row[8]])).toEqual([
      ['CO1', 'false', '', '0', '0'],
      ['EO1.1', 'true', 'Unit 1 Test', '1', '2'],
      ['CO2', 'true', '', '0', '0']
    ]);
  });

  it('follows tree order, so the CSV reads like the outcome screen', () => {
    const snapshot = course();
    expect(column(coverageCsv(snapshot, readableContext(snapshot)), 'outcomeCode')).toEqual([
      'CO1',
      'EO1.1',
      'CO2'
    ]);
  });

  it('counts a collection scored by one rubric, with no item standing behind it', () => {
    const outcome = anOutcome({ vaultId: vault.id, code: 'EO2.1' });
    const four = levels(['Exemplary', 4], ['Proficient', 3]);
    const rubric = aRubric({
      vaultId: vault.id,
      levels: four,
      criteria: [aCriterion('Clarity', four, { outcomeIds: [outcome.id] })]
    });
    const collection = aCollection({
      vaultId: vault.id,
      kind: 'task',
      title: 'Project',
      rubricId: rubric.id
    });
    const snapshot = snapshotOf({ outcomes: [outcome], collections: [collection], rubrics: [rubric] });
    const csv = coverageCsv(snapshot, readableContext(snapshot));

    expect(column(csv, 'items')).toEqual(['0']);
    expect(column(csv, 'points')).toEqual(['4']);
    expect(column(csv, 'collection')).toEqual(['Project']);
  });

  it('attributes an item’s full points to every outcome it names', () => {
    const first = anOutcome({ vaultId: vault.id, code: 'EO1.1' });
    const second = anOutcome({ vaultId: vault.id, code: 'EO1.2', order: 1 });
    const collection = aCollection({ vaultId: vault.id, title: 'Quiz' });
    const item = anItem('choice', {
      collectionId: collection.id,
      points: 3,
      outcomeIds: [first.id, second.id]
    });
    const snapshot = snapshotOf({
      outcomes: [first, second],
      collections: [collection],
      items: [item]
    });

    // Not 1.5 each. The question is how much assessment touches an outcome, not how
    // to divide a mark, so the column deliberately sums to more than the quiz is worth.
    expect(column(coverageCsv(snapshot, readableContext(snapshot)), 'points')).toEqual(['3', '3']);
  });
});
