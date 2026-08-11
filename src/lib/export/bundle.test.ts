import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildBundleFiles, readBundle, writeBundle } from './bundle';
import { PATHS, SCHEMA_VERSION, bundleFilename, slugify, uniqueSlugger } from './format';
import { VaultSnapshotSchema, type VaultSnapshot } from '$lib/domain/schema';
import { rubricTotal } from '$lib/domain/points';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels,
  scoringContext,
  worth
} from '$lib/domain/fixtures';

const META = { appVersion: '0.1.0', exportedAt: '2026-08-09T12:00:00.000Z' };

function aSnapshot(): VaultSnapshot {
  const vault = aVault({ code: 'STAT101', name: 'Introductory Statistics' });
  const parent = anOutcome({ vaultId: vault.id, code: 'CO1' });
  const child = anOutcome({ vaultId: vault.id, code: 'EO1.1', parentId: parent.id });

  const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
  const rubric = aRubric({
    vaultId: vault.id,
    title: 'Discussion participation',
    levels: fourPoint,
    criteria: [
      // Carries its own points, so the round-trip below actually exercises them. A
      // field absent from this fixture is a field the backup story does not cover.
      aCriterion('Clarity', fourPoint, {
        outcomeIds: [child.id],
        levelPoints: worth(fourPoint, 10, 7)
      })
    ]
  });

  const collection = aCollection({ vaultId: vault.id, kind: 'exam', title: 'Unit 1 Test' });
  const group = anItem('group', {
    collectionId: collection.id,
    outcomeIds: [child.id],
    parts: [anItem('choice', { collectionId: collection.id, points: 2 })]
  });
  const essay = anItem('essay', { collectionId: collection.id, rubricId: rubric.id });

  return VaultSnapshotSchema.parse({
    vault,
    outcomes: [parent, child],
    collections: [collection],
    items: [group, essay],
    rubrics: [rubric]
  });
}

describe('bundle layout', () => {
  it('writes the files the README promises', () => {
    const files = buildBundleFiles(aSnapshot(), META);
    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'collections/unit-1-test.json',
      'collections/unit-1-test.md',
      'coverage.csv',
      'items.csv',
      'manifest.json',
      'outcomes.json',
      'outcomes.md',
      'rubrics/discussion-participation.json',
      'rubrics/discussion-participation.md',
      'vault.json'
    ]);
  });

  it('puts a collection’s two forms on the same filename stem', () => {
    // `unit-1-test.json` and `unit-1-test-2.md` would be a quietly broken pairing,
    // and the obvious way to write this — a second slugger for the Markdown — does
    // exactly that.
    const snapshot = aSnapshot();
    const twin = aCollection({ vaultId: snapshot.vault.id, kind: 'quiz', title: 'Unit 1 Test' });
    const files = buildBundleFiles(
      { ...snapshot, collections: [...snapshot.collections, twin] },
      META
    );

    for (const stem of ['unit-1-test', 'unit-1-test-2']) {
      expect(files[`collections/${stem}.json`]).toBeDefined();
      expect(files[`collections/${stem}.md`]).toBeDefined();
    }
  });

  it('renders a derived file as a note rather than failing the whole export', () => {
    /*
      Export is the data-rescue path and must never be able to fail. A record shaped
      in a way the Markdown writer does not survive costs that one readable file; the
      lossless JSON is still in the bundle beside it.
    */
    const snapshot = aSnapshot();
    const broken = {
      ...snapshot,
      // `sections` is walked to group the items; a non-array is the cheapest stand-in
      // for the hand-edited or newer-version record this guards against.
      collections: [{ ...snapshot.collections[0]!, sections: null as never }]
    };

    const files = buildBundleFiles(broken, META);
    expect(files['collections/unit-1-test.md']).toContain('could not render');
    expect(files['collections/unit-1-test.md']).toContain('Nothing has been lost');
    expect(JSON.parse(files['collections/unit-1-test.json']!).items).toHaveLength(2);
  });

  it('keeps a collection and its items in one file', () => {
    // "Send me your Unit 1 test" should be one file, readable on its own.
    const snapshot = aSnapshot();
    const files = buildBundleFiles(snapshot, META);
    const parsed = JSON.parse(files['collections/unit-1-test.json']!);

    expect(parsed.collection.title).toBe('Unit 1 Test');
    expect(parsed.items).toHaveLength(2);
  });

  it('records a manifest a stranger could act on', () => {
    const manifest = JSON.parse(buildBundleFiles(aSnapshot(), META)[PATHS.manifest]!);
    expect(manifest).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: META.exportedAt,
      appVersion: '0.1.0',
      vaultCode: 'STAT101',
      counts: { outcomes: 2, collections: 1, items: 2, rubrics: 1 }
    });
  });

  it('writes a README that explains the traps rather than just the file list', () => {
    const readme = buildBundleFiles(aSnapshot(), META)[PATHS.readme]!;
    expect(readme).toContain('Introductory Statistics');
    // The two scoring rules people get wrong.
    expect(readme).toContain('best level, not the sum');
    expect(readme).toContain('sum of its parts');
    // And the reassurance that matters most to an instructor.
    expect(readme).toContain('Nothing about students');
  });

  it('counts in the README agree with grammar', () => {
    const readme = buildBundleFiles(aSnapshot(), META)[PATHS.readme]!;
    expect(readme).toContain('2 outcomes');
    expect(readme).toContain('1 collection,');
    expect(readme).toContain('1 rubric');
    expect(readme).not.toContain('1 collections');
    expect(readme).not.toContain('1 rubrics');
  });

  it('indents the JSON, because these files are meant to be opened', () => {
    const files = buildBundleFiles(aSnapshot(), META);
    expect(files[PATHS.vault]).toContain('\n  "');
  });

  it('produces a real zip', () => {
    const bytes = writeBundle(aSnapshot(), META);
    // PK\x03\x04
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
});

describe('round trip', () => {
  it('export → import gives back exactly what went in', () => {
    // The property the entire backup story rests on. If this fails, "restore from a
    // bundle" has stopped being a faithful operation.
    const before = aSnapshot();
    const result = readBundle(writeBundle(before, META));

    expect(result.problems).toEqual([]);
    expect(result.snapshot).toEqual(before);
  });

  it('preserves fields the app does not recognise', () => {
    const before = aSnapshot();
    const withExtras = {
      ...before,
      vault: { ...before.vault, fromAFutureVersion: { keep: true } },
      items: before.items.map((item) => ({ ...item, fields: { reviewedBy: 'BE' } }))
    } as VaultSnapshot;

    const result = readBundle(writeBundle(withExtras, META));
    expect(result.snapshot?.vault).toHaveProperty('fromAFutureVersion', { keep: true });
    expect(result.snapshot?.items[0]?.fields).toEqual({ reviewedBy: 'BE' });
  });

  it('keeps a group’s nested parts intact', () => {
    const result = readBundle(writeBundle(aSnapshot(), META));
    const group = result.snapshot?.items.find((item) => item.kind === 'group');
    expect(group?.parts).toHaveLength(1);
    expect(group?.parts[0]?.points).toBe(2);
  });

  it('carries a shared tail, so a restored course still composes its grid', () => {
    /*
      A rubric's own file says nothing about the criteria it borrows — they live in
      another file entirely, joined by `appends`. Lose that one array and the JSON still
      looks complete: every rubric parses, every criterion is present somewhere, and the
      restored course is simply worth less than the one that was exported.
    */
    const before = aSnapshot();
    const tailLevels = levels(['Met', 2], ['Not met', 0]);
    const tail = aRubric({
      vaultId: before.vault.id,
      title: 'Professionalism',
      levels: tailLevels,
      criteria: [aCriterion('On time', tailLevels)]
    });
    const host = { ...before.rubrics[0]!, appends: [tail.id] };
    const withTail = VaultSnapshotSchema.parse({ ...before, rubrics: [host, tail] });

    const result = readBundle(writeBundle(withTail, META));

    expect(result.problems).toEqual([]);
    expect(result.snapshot).toEqual(withTail);
    expect(result.snapshot?.rubrics[0]?.appends).toEqual([tail.id]);
    // 10 from Clarity's own points, plus 2 from the tail's own best level.
    expect(rubricTotal(result.snapshot!.rubrics[0]!, scoringContext(...result.snapshot!.rubrics))).toBe(12);
  });
});

describe('damaged bundles', () => {
  const filesOf = (snapshot: VaultSnapshot) => {
    const text = buildBundleFiles(snapshot, META);
    const entries: Record<string, Uint8Array> = {};
    for (const [path, body] of Object.entries(text)) entries[path] = strToU8(body);
    return entries;
  };

  it('loses only the damaged file, not the whole bundle', () => {
    /*
      The rule that matters most here. Refusing everything because one collection will
      not parse would be the worst possible behaviour for the one feature whose job is
      getting a term's work back.
    */
    const snapshot = aSnapshot();
    const entries = filesOf(snapshot);
    entries['collections/unit-1-test.json'] = strToU8('{ this is not json');

    const result = readBundle(zipSync(entries));

    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot?.outcomes).toHaveLength(2);
    expect(result.snapshot?.rubrics).toHaveLength(1);
    expect(result.snapshot?.collections).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.file).toBe('collections/unit-1-test.json');
    expect(result.problems[0]?.message).toContain('Not valid JSON');
  });

  it('reports a file that is valid JSON but the wrong shape', () => {
    const entries = filesOf(aSnapshot());
    entries['rubrics/discussion-participation.json'] = strToU8('{"title": 42}');

    const result = readBundle(zipSync(entries));
    expect(result.snapshot?.rubrics).toEqual([]);
    expect(result.problems[0]?.message).toContain('expected shape');
  });

  it('gives up only when the vault record itself is unusable', () => {
    const entries = filesOf(aSnapshot());
    delete entries[PATHS.vault];

    const result = readBundle(zipSync(entries));
    expect(result.snapshot).toBeNull();
    expect(result.problems.some((problem) => problem.file === PATHS.vault)).toBe(true);
  });

  it('survives a corrupt outcomes file with an empty tree rather than no vault', () => {
    const entries = filesOf(aSnapshot());
    entries[PATHS.outcomes] = strToU8('"not an array"');

    const result = readBundle(zipSync(entries));
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot?.outcomes).toEqual([]);
    expect(result.problems[0]?.file).toBe(PATHS.outcomes);
  });

  it('reports something that is not a zip at all', () => {
    const result = readBundle(strToU8('I am a text file someone renamed'));
    expect(result.snapshot).toBeNull();
    expect(result.problems[0]?.message).toContain('Not a readable zip');
  });
});

describe('tolerance', () => {
  it('ignores files it does not recognise', () => {
    // Markdown and CSV join the bundle in a later stage, and a user may well drop
    // their own notes in. Neither is an error.
    const snapshot = aSnapshot();
    const text = buildBundleFiles(snapshot, META);
    const entries: Record<string, Uint8Array> = {};
    for (const [path, body] of Object.entries(text)) entries[path] = strToU8(body);
    entries['outcomes.md'] = strToU8('# Outcomes\n\n- CO1');
    entries['items.csv'] = strToU8('id,stem\n1,anything');
    entries['my-notes.txt'] = strToU8('remember to fix Q4');

    const result = readBundle(zipSync(entries));
    expect(result.problems).toEqual([]);
    expect(result.snapshot).toEqual(snapshot);
  });

  it('loads a bundle from a newer schema, and says so', () => {
    const entries: Record<string, Uint8Array> = {};
    const text = buildBundleFiles(aSnapshot(), META);
    for (const [path, body] of Object.entries(text)) entries[path] = strToU8(body);
    const manifest = JSON.parse(text[PATHS.manifest]!);
    entries[PATHS.manifest] = strToU8(
      JSON.stringify({ ...manifest, schemaVersion: SCHEMA_VERSION + 5 })
    );

    const result = readBundle(zipSync(entries));
    expect(result.snapshot).not.toBeNull();
    expect(result.problems[0]?.message).toContain('newer version');
  });

  it('loads a bundle with no manifest at all', () => {
    const entries: Record<string, Uint8Array> = {};
    const text = buildBundleFiles(aSnapshot(), META);
    for (const [path, body] of Object.entries(text)) entries[path] = strToU8(body);
    delete entries[PATHS.manifest];

    const result = readBundle(zipSync(entries));
    expect(result.snapshot).not.toBeNull();
    expect(result.manifest).toBeNull();
  });
});

describe('filenames', () => {
  it('makes a slug safe for any filesystem', () => {
    expect(slugify('Unit 1 Test: Descriptive Statistics')).toBe(
      'unit-1-test-descriptive-statistics'
    );
    expect(slugify('Café — Résumé')).toBe('cafe-resume');
    expect(slugify('!!!')).toBe('untitled');
  });

  it('does not let two collections with the same title collide', () => {
    // Inside a zip, a repeat filename silently overwrites — invisible until the day
    // someone tries to restore.
    const slug = uniqueSlugger();
    expect([slug('Quiz 1'), slug('Quiz 1'), slug('Quiz 1')]).toEqual([
      'quiz-1',
      'quiz-1-2',
      'quiz-1-3'
    ]);
  });

  it('keeps both same-titled collections in a real bundle', () => {
    const snapshot = aSnapshot();
    const twin = aCollection({ vaultId: snapshot.vault.id, kind: 'exam', title: 'Unit 1 Test' });
    const withTwin = { ...snapshot, collections: [...snapshot.collections, twin] };

    const result = readBundle(writeBundle(withTwin, META));
    expect(result.snapshot?.collections).toHaveLength(2);
  });

  it('names the download by course and date', () => {
    expect(bundleFilename('STAT101', new Date('2026-08-09T12:00:00Z'))).toBe(
      'drawbridge-stat101-2026-08-09.zip'
    );
  });
});
