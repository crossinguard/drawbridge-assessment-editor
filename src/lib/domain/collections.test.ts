import { describe, expect, it } from 'vitest';
import { ALL_CAPABILITIES, capabilitiesOf, kindOptions } from './collections';
import { newVault } from './defaults';
import { VaultConfigSchema, type VaultConfig } from './schema';

function configWith(kinds: unknown[]): VaultConfig {
  return VaultConfigSchema.parse({ collectionKinds: kinds });
}

describe('capabilitiesOf', () => {
  it('gives an unknown kind everything', () => {
    /*
      The rule this file exists to keep. A collection whose kind was renamed, or which
      arrived from a course defining kinds this vault never heard of, must open with
      its full editor — a degraded screen would be withholding the very controls
      needed to fix the problem that caused it.
    */
    const config = configWith([{ key: 'quiz', label: 'Quiz', itemKinds: [], itemScoring: false }]);

    expect(capabilitiesOf(config, 'lab-practical')).toEqual(ALL_CAPABILITIES);
    expect(capabilitiesOf(config, '')).toEqual(ALL_CAPABILITIES);
  });

  it('reads absent itemKinds as every kind, and empty as none', () => {
    // The distinction the schema is careful about: "not stated" is not "none". A task
    // scored wholly by one rubric wants the second, and only says so by writing [].
    const config = configWith([
      { key: 'exam', label: 'Exam' },
      { key: 'task', label: 'Task', itemKinds: [] }
    ]);

    expect(capabilitiesOf(config, 'exam').itemKinds).toEqual(ALL_CAPABILITIES.itemKinds);
    expect(capabilitiesOf(config, 'task').itemKinds).toEqual([]);
  });

  it('carries the switches through as written', () => {
    const config = configWith([
      {
        key: 'task',
        label: 'Task',
        itemKinds: ['essay'],
        itemScoring: false,
        sections: false,
        rubricFirst: true
      }
    ]);

    expect(capabilitiesOf(config, 'task')).toEqual({
      itemKinds: ['essay'],
      itemScoring: false,
      sections: false,
      rubricFirst: true
    });
  });

  it('defaults a kind that states nothing to the permissive answer', () => {
    // Parsing supplies the defaults; a kind added by hand to a bundle should behave
    // like the fullest editor rather than the emptiest.
    const config = configWith([{ key: 'bank', label: 'Item bank' }]);
    expect(capabilitiesOf(config, 'bank')).toEqual(ALL_CAPABILITIES);
  });

  it('never branches on a particular key', () => {
    /*
      Two kinds with identical capabilities and different keys must resolve
      identically. If this ever fails, something has written `kind === 'quiz'`.
    */
    const config = configWith([
      { key: 'quiz', label: 'Quiz', itemKinds: ['choice'], itemScoring: false },
      { key: 'lab-practical', label: 'Lab practical', itemKinds: ['choice'], itemScoring: false }
    ]);

    expect(capabilitiesOf(config, 'lab-practical')).toEqual(capabilitiesOf(config, 'quiz'));
  });
});

describe('the seeded kinds', () => {
  const config = newVault({ name: 'Statistics', code: 'STAT101' }).config;

  it('offers a task no per-item scoring, and leads with its rubric', () => {
    expect(capabilitiesOf(config, 'task')).toMatchObject({
      itemScoring: false,
      rubricFirst: true,
      sections: false
    });
  });

  it('leaves an exam able to hold every kind', () => {
    // The sample course's own exam mixes a passage, a group, a short answer and an
    // essay. A default that could not rebuild the shipped demo is the wrong default.
    expect(capabilitiesOf(config, 'exam').itemKinds).toEqual(ALL_CAPABILITIES.itemKinds);
  });

  it('narrows a quiz to what can be marked without reading it', () => {
    expect(capabilitiesOf(config, 'quiz').itemKinds).toEqual([
      'choice',
      'multi',
      'trueFalse',
      'shortAnswer'
    ]);
  });
});

describe('kindOptions', () => {
  it('keeps an item’s own kind on the list even where the collection would not offer it', () => {
    /*
      Otherwise the select renders with a value it does not contain: it shows blank,
      and changing any other control silently rewrites the item's kind to whatever
      happens to be first. Narrowing what can be ADDED is a preference; misreporting
      what already exists is a bug.
    */
    const narrow = { ...ALL_CAPABILITIES, itemKinds: ['choice', 'multi'] as const };

    expect(kindOptions(narrow, 'essay')).toEqual(['choice', 'multi', 'essay']);
    expect(kindOptions(narrow, 'choice')).toEqual(['choice', 'multi']);
  });

  it('offers only the current kind when the collection offers none', () => {
    const none = { ...ALL_CAPABILITIES, itemKinds: [] };
    expect(kindOptions(none, 'essay')).toEqual(['essay']);
  });
});
