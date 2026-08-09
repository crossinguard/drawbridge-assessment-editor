import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { items } from './items.svelte';
import { repository } from '$lib/repo';
import { newCollection, newVault } from '$lib/domain/defaults';
import { newId } from '$lib/domain/ids';
import { itemPoints } from '$lib/domain/points';
import { scoringContext } from '$lib/domain/fixtures';

/*
  Integration tests over the real store and repository, against fake-indexeddb.

  The outcomes store shipped two silent data-loss bugs that only an integration test
  could see — both lived in how the store drove the saver, and neither half was wrong
  on its own. This file covers the same ground for items before it can happen twice.
*/

let collectionId: string;

beforeEach(async () => {
  for (const vault of await repository.vaults.list()) await repository.deleteVault(vault.id);

  const vault = newVault({ name: 'Statistics', code: `STAT${newId()}` });
  await repository.vaults.put(vault);
  const collection = newCollection({ vaultId: vault.id, kind: 'quiz', title: 'Unit 1' });
  await repository.collections.put(collection);
  collectionId = collection.id;

  items.reset();
  await items.load(collectionId);
});

const orderOf = async (sectionId?: string) =>
  (await repository.items.listByCollection(collectionId))
    .filter((item) => (item.sectionId ?? undefined) === sectionId)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.stem);

describe('field edits', () => {
  it('persists successive edits to the same item', async () => {
    // The outcomes-store regression, in its items form: queueing anything that does
    // not vary with the record makes every edit after the first look like a no-op.
    const item = await items.add('choice', undefined);

    for (const stem of ['First', 'Second', 'Third']) {
      item.stem = stem;
      items.queueFieldSave(item.id);
      await items.flush();
      expect((await repository.items.get(item.id))?.stem).toBe(stem);
    }
  });

  it('persists option text and per-option feedback', async () => {
    const item = await items.add('choice', undefined);
    item.options = [
      { id: newId(), text: '25', correct: true, feedback: 'The middle value.' },
      { id: newId(), text: '26', correct: false }
    ];
    items.queueFieldSave(item.id);
    await items.flush();

    const stored = await repository.items.get(item.id);
    expect(stored?.options[0]?.text).toBe('25');
    expect(stored?.options[0]?.correct).toBe(true);
    expect(stored?.options[0]?.feedback).toBe('The middle value.');
  });

  it('does not resurrect an item deleted while its edit was pending', async () => {
    const item = await items.add('choice', undefined);
    item.stem = 'About to go';
    items.queueFieldSave(item.id);

    await items.remove(item.id);
    await items.flush();

    expect(await repository.items.get(item.id)).toBeUndefined();
  });
});

describe('structure', () => {
  it('appends new items in order', async () => {
    const a = await items.add('choice', undefined);
    const b = await items.add('multi', undefined);
    a.stem = 'A';
    b.stem = 'B';
    items.queueFieldSave(a.id);
    items.queueFieldSave(b.id);
    await items.flush();

    expect(await orderOf()).toEqual(['A', 'B']);
  });

  it('moves within a group', async () => {
    const a = await items.add('choice', undefined);
    const b = await items.add('choice', undefined);
    a.stem = 'A';
    b.stem = 'B';
    items.queueFieldSave(a.id);
    items.queueFieldSave(b.id);
    await items.flush();

    await items.move(b.id, -1);
    expect(await orderOf()).toEqual(['B', 'A']);
  });

  it('drops a duplicate directly beneath its original, not at the end', async () => {
    const a = await items.add('choice', undefined);
    const b = await items.add('choice', undefined);
    a.stem = 'A';
    b.stem = 'B';
    items.queueFieldSave(a.id);
    items.queueFieldSave(b.id);
    await items.flush();

    const copy = await items.duplicate(a.id);
    expect(copy?.stem).toBe('A');
    // The reason to duplicate is almost always to vary the question in front of you.
    expect(await orderOf()).toEqual(['A', 'A', 'B']);
  });

  it('gives a duplicate independent ids so the two diverge', async () => {
    const original = await items.add('choice', undefined);
    original.options = [{ id: newId(), text: 'Shared?', correct: true }];
    items.queueFieldSave(original.id);
    await items.flush();

    const copy = await items.duplicate(original.id);
    expect(copy?.id).not.toBe(original.id);
    expect(copy?.options[0]?.id).not.toBe(original.options[0]?.id);

    copy!.stem = 'Changed on the copy only';
    items.queueFieldSave(copy!.id);
    await items.flush();

    expect((await repository.items.get(original.id))?.stem).not.toBe('Changed on the copy only');
  });

  it('closes the gap when an item is deleted', async () => {
    const a = await items.add('choice', undefined);
    const b = await items.add('choice', undefined);
    const c = await items.add('choice', undefined);
    b.stem = 'B';
    c.stem = 'C';
    items.queueFieldSave(b.id);
    items.queueFieldSave(c.id);
    await items.flush();

    await items.remove(a.id);

    const stored = await repository.items.listByCollection(collectionId);
    expect(stored.map((item) => item.order).sort()).toEqual([0, 1]);
  });

  it('keeps order scoped to a section rather than the whole collection', async () => {
    const sectionId = newId();
    const loose = await items.add('choice', undefined);
    const inSection = await items.add('choice', sectionId);
    loose.stem = 'Loose';
    inSection.stem = 'Sectioned';
    items.queueFieldSave(loose.id);
    items.queueFieldSave(inSection.id);
    await items.flush();

    // Both are first in their own group, so both are order 0.
    expect((await repository.items.get(loose.id))?.order).toBe(0);
    expect((await repository.items.get(inSection.id))?.order).toBe(0);
  });

  it('renumbers both groups when an item changes section', async () => {
    const sectionId = newId();
    const a = await items.add('choice', undefined);
    const b = await items.add('choice', undefined);
    a.stem = 'A';
    b.stem = 'B';
    items.queueFieldSave(a.id);
    items.queueFieldSave(b.id);
    await items.flush();

    await items.setSection(a.id, sectionId);

    expect(await orderOf()).toEqual(['B']);
    expect(await orderOf(sectionId)).toEqual(['A']);
    // B slid down to close the gap A left behind.
    expect((await repository.items.get(b.id))?.order).toBe(0);
  });

  it('moves an item back out of a section', async () => {
    const sectionId = newId();
    const item = await items.add('choice', sectionId);
    item.stem = 'Sectioned';
    items.queueFieldSave(item.id);
    await items.flush();

    await items.setSection(item.id, undefined);
    expect((await repository.items.get(item.id))?.sectionId).toBeUndefined();
    expect(await orderOf()).toEqual(['Sectioned']);
  });

  it('keeps authored options when the kind changes', async () => {
    // A mis-click on the kind dropdown must not destroy four written distractors.
    // Validation reports them as unused instead.
    const item = await items.add('choice', undefined);
    item.options = [
      { id: newId(), text: 'Carefully written distractor', correct: false },
      { id: newId(), text: 'The key', correct: true }
    ];
    items.queueFieldSave(item.id);
    await items.flush();

    await items.setKind(item.id, 'essay');
    await items.flush();

    const stored = await repository.items.get(item.id);
    expect(stored?.kind).toBe('essay');
    expect(stored?.options).toHaveLength(2);
  });

  it('creates a trueFalse item with its two fixed options already in place', async () => {
    const item = await items.add('trueFalse', undefined);
    expect(item.options.map((option) => option.text)).toEqual(['True', 'False']);
  });
});

describe('group parts', () => {
  /*
    Parts live inside the top-level record rather than as rows of their own, so every
    one of these is an edit to ONE row. The thing that can go wrong is the save being
    queued against the part's own id — which is not a row — and silently going nowhere.
  */

  it('adds parts to a group and stores them inside the parent row', async () => {
    const group = await items.add('group', undefined);
    const a = items.addPart(group.id, 'choice');
    const b = items.addPart(group.id, 'shortAnswer');
    await items.flush();

    expect(a && b).toBeTruthy();
    const stored = await repository.items.get(group.id);
    expect(stored?.parts.map((part) => part.kind)).toEqual(['choice', 'shortAnswer']);

    // A part is not a row; it is only reachable through its parent.
    expect(await repository.items.get(a!.id)).toBeUndefined();
    expect(await repository.items.listByCollection(collectionId)).toHaveLength(1);
  });

  it('persists an edit made to a part', async () => {
    const group = await items.add('group', undefined);
    const part = items.addPart(group.id, 'shortAnswer')!;
    await items.flush();

    part.stem = 'Part a — find the median';
    part.expected = '25';
    items.queueSaveForOwnerOf(part.id);
    await items.flush();

    const stored = await repository.items.get(group.id);
    expect(stored?.parts[0]?.stem).toBe('Part a — find the median');
    expect(stored?.parts[0]?.expected).toBe('25');
  });

  it('persists an edit made to a part nested two levels down', async () => {
    const outer = await items.add('group', undefined);
    const inner = items.addPart(outer.id, 'group')!;
    const leaf = items.addPart(inner.id, 'choice')!;
    await items.flush();

    leaf.stem = 'Buried but still saved';
    items.queueSaveForOwnerOf(leaf.id);
    await items.flush();

    const stored = await repository.items.get(outer.id);
    expect(stored?.parts[0]?.parts[0]?.stem).toBe('Buried but still saved');
  });

  it('sums a group from its parts, which is the opposite of a rubric', async () => {
    const group = await items.add('group', undefined);
    const a = items.addPart(group.id, 'choice')!;
    const b = items.addPart(group.id, 'choice')!;
    a.points = 2;
    b.points = 3;
    items.queueSaveForOwnerOf(a.id);
    await items.flush();

    const stored = await repository.items.get(group.id);
    expect(itemPoints(stored!, scoringContext()).points).toBe(5);
  });

  it('reorders and renumbers parts', async () => {
    const group = await items.add('group', undefined);
    const a = items.addPart(group.id, 'choice')!;
    const b = items.addPart(group.id, 'choice')!;
    a.stem = 'A';
    b.stem = 'B';
    items.queueSaveForOwnerOf(a.id);
    await items.flush();

    items.movePart(group.id, b.id, -1);
    await items.flush();

    const stored = await repository.items.get(group.id);
    expect(stored?.parts.map((part) => part.stem)).toEqual(['B', 'A']);
    expect(stored?.parts.map((part) => part.order)).toEqual([0, 1]);
  });

  it('duplicates a part beneath its original with independent ids', async () => {
    const group = await items.add('group', undefined);
    const original = items.addPart(group.id, 'choice')!;
    original.stem = 'Original';
    original.options = [{ id: newId(), text: 'a', correct: true }];
    items.queueSaveForOwnerOf(original.id);
    await items.flush();

    const copy = items.duplicatePart(group.id, original.id)!;
    await items.flush();

    const stored = await repository.items.get(group.id);
    expect(stored?.parts.map((part) => part.stem)).toEqual(['Original', 'Original']);
    expect(copy.id).not.toBe(original.id);
    expect(copy.options[0]?.id).not.toBe(original.options[0]?.id);
  });

  it('removes a part and closes the gap', async () => {
    const group = await items.add('group', undefined);
    const a = items.addPart(group.id, 'choice')!;
    const b = items.addPart(group.id, 'choice')!;
    b.stem = 'Survivor';
    items.queueSaveForOwnerOf(b.id);
    await items.flush();

    items.removePart(group.id, a.id);
    await items.flush();

    const stored = await repository.items.get(group.id);
    expect(stored?.parts.map((part) => part.stem)).toEqual(['Survivor']);
    expect(stored?.parts[0]?.order).toBe(0);
  });

  it('ignores a part operation aimed at something that is not there', async () => {
    expect(items.addPart('no-such-group', 'choice')).toBeNull();
    expect(items.duplicatePart('no-such-group', 'nope')).toBeNull();
    expect(() => items.removePart('no-such-group', 'nope')).not.toThrow();
    expect(() => items.movePart('no-such-group', 'nope', 1)).not.toThrow();
  });
});
