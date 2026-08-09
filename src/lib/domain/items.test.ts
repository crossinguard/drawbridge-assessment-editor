import { describe, expect, it } from 'vitest';
import { duplicateItem, itemsInSection, expectedKeyCount, usesExpected, usesOptions } from './items';
import { anItem, options } from './fixtures';
import { ItemSchema } from './schema';

function counter() {
  let n = 0;
  return () => `copy-${++n}`;
}

describe('duplicateItem', () => {
  it('gives the copy and everything inside it fresh ids', () => {
    const original = anItem('choice', {
      options: options(['a', true], ['b', false]),
      log: [{ id: 'log-1', date: '2026-08-01', kind: 'note', text: 'Reworded' }]
    });

    const copy = duplicateItem(original, counter());

    expect(copy.id).not.toBe(original.id);
    expect(copy.options.map((o) => o.id)).not.toEqual(original.options.map((o) => o.id));
    expect(copy.log[0]?.id).not.toBe('log-1');
  });

  it('copies the content exactly, keys and per-option feedback included', () => {
    const original = anItem('multi', {
      stem: 'Which of these are measures of centre?',
      points: 2,
      rationale: 'Mode counts.',
      options: [
        { id: 'o1', text: 'Mean', correct: true, feedback: 'Yes — the average.' },
        { id: 'o2', text: 'Range', correct: false, feedback: 'That is spread.' }
      ]
    });

    const copy = duplicateItem(original, counter());

    expect(copy.stem).toBe(original.stem);
    expect(copy.points).toBe(2);
    expect(copy.rationale).toBe('Mode counts.');
    expect(copy.options.map((o) => [o.text, o.correct, o.feedback])).toEqual(
      original.options.map((o) => [o.text, o.correct, o.feedback])
    );
  });

  it('recurses into a group, so no part shares an id with its original', () => {
    const original = anItem('group', {
      parts: [anItem('choice', { options: options(['a', true]) }), anItem('choice')]
    });

    const copy = duplicateItem(original, counter());
    const originalIds = new Set([
      original.id,
      ...original.parts.map((p) => p.id),
      ...original.parts.flatMap((p) => p.options.map((o) => o.id))
    ]);

    for (const part of copy.parts) {
      expect(originalIds.has(part.id)).toBe(false);
      for (const option of part.options) expect(originalIds.has(option.id)).toBe(false);
    }
  });

  it('keeps the revision log, which is the author’s notes about this content', () => {
    const original = anItem('choice', {
      log: [{ id: 'l1', date: '2026-08-01', kind: 'revision', text: 'Softened the wording' }]
    });
    const copy = duplicateItem(original, counter());
    expect(copy.log[0]?.text).toBe('Softened the wording');
  });

  it('leaves the copy alone in the world — no reference back to the original', () => {
    const original = anItem('choice');
    const copy = duplicateItem(original, counter());
    expect(JSON.stringify(copy)).not.toContain(original.id);
  });

  it('produces something the schema still accepts', () => {
    const copy = duplicateItem(anItem('group', { parts: [anItem('choice')] }), counter());
    expect(ItemSchema.safeParse(copy).success).toBe(true);
  });
});

describe('kind predicates', () => {
  it('knows which kinds are answered from a list', () => {
    expect(usesOptions('choice')).toBe(true);
    expect(usesOptions('multi')).toBe(true);
    expect(usesOptions('trueFalse')).toBe(true);
    expect(usesOptions('shortAnswer')).toBe(false);
    expect(usesOptions('group')).toBe(false);
  });

  it('knows which kinds carry a written expected answer', () => {
    expect(usesExpected('shortAnswer')).toBe(true);
    expect(usesExpected('essay')).toBe(true);
    expect(usesExpected('choice')).toBe(false);
  });

  it('describes how many keys a kind wants', () => {
    expect(expectedKeyCount('choice')).toEqual({ min: 1, max: 1 });
    expect(expectedKeyCount('multi')).toEqual({ min: 2, max: null });
    expect(expectedKeyCount('essay')).toBeNull();
  });
});

describe('itemsInSection', () => {
  it('groups by section and orders within the group', () => {
    const items = [
      anItem('choice', { id: 'b', sectionId: 's1', order: 1, stem: 'B' }),
      anItem('choice', { id: 'a', sectionId: 's1', order: 0, stem: 'A' }),
      anItem('choice', { id: 'loose', order: 0, stem: 'Loose' })
    ];

    expect(itemsInSection(items, 's1').map((i) => i.stem)).toEqual(['A', 'B']);
    expect(itemsInSection(items, undefined).map((i) => i.stem)).toEqual(['Loose']);
  });

  it('treats an item with no section as ungrouped, not as belonging to everything', () => {
    const items = [anItem('choice', { id: 'loose', stem: 'Loose' })];
    expect(itemsInSection(items, 's1')).toEqual([]);
    expect(itemsInSection(items, undefined)).toHaveLength(1);
  });
});
