import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { repository } from '$lib/repo';
import { newCollection, newVault } from '$lib/domain/defaults';
import { newId } from '$lib/domain/ids';
import { collections } from './collections.svelte';
import { items } from './items.svelte';
import { journal } from './journal.svelte';
import { outcomes } from './outcomes.svelte';
import { undo } from './undo.svelte';
import { vaultList } from './vaults.svelte';

/*
  The journal and undo, over the real stores and the real repository.

  Everything here is a thing a unit test of either half cannot see: whether the funnel
  captured a before-image at all, whether it captured the one from BEFORE the write,
  whether a store that mutates in place and then saves left the journal describing the
  after-image twice, and whether the store showing the record notices that it changed
  underneath. Those are the failures this feature can have, and every one of them looks
  fine on screen.
*/

let vaultId: string;
let collectionId: string;

beforeEach(async () => {
  for (const vault of await repository.vaults.list()) await repository.deleteVault(vault.id);
  journal.reset();

  const vault = newVault({ name: 'Statistics', code: `STAT${newId()}` });
  await repository.vaults.put(vault);
  vaultId = vault.id;

  const collection = newCollection({ vaultId, kind: 'quiz', title: 'Unit 1' });
  await repository.collections.put(collection);
  collectionId = collection.id;

  items.reset();
  collections.reset();
  outcomes.close();
  await collections.load(vaultId);
  await items.load(collectionId);
  await outcomes.load(vaultId);
});

const labels = () => journal.forVault(vaultId).map((entry) => entry.label);

describe('what the funnel captures', () => {
  it('records the state BEFORE the write, not the store’s copy of it', async () => {
    /*
      The trap the plan named. `setKind` mutates the live item and then saves it, so a
      journal built from the store's own object would hold the new kind on both sides
      and undo would do nothing at all — silently, with an entry in the list claiming
      otherwise.
    */
    const item = await items.add('choice', undefined);
    item.stem = 'What is the median?';
    items.queueFieldSave(item.id);
    await items.flush();

    await items.setKind(item.id, 'essay');
    await items.flush();

    const entry = journal.forVault(vaultId)[0];
    expect(entry?.changes[0]?.before?.['kind']).toBe('choice');
    expect(entry?.changes[0]?.after?.['kind']).toBe('essay');
  });

  /*
    NOT pinned here, and it is worth saying which one: the log holding its entries in
    plain `$state` rather than `$state.raw`. Deep proxying handed every before-image
    back as a Proxy, and the first thing undo does with one is write it to IndexedDB —
    `DataCloneError`, the failure `plain()` exists to prevent, arriving from the one
    direction nothing was watching: a value on its way OUT of a store.

    There is no test for it because nothing in this environment can tell the two apart.
    `fake-indexeddb` clones by walking the object in JS, so a Proxy passes; Node's own
    `structuredClone` accepts a Svelte state proxy too; and the proxy exposes no symbol
    or tag to probe for. Checked, rather than assumed. The browser found it in the
    first click, which is the third time that has been the only thing that could.
  */

  it('records a change even when nothing about the timestamp moved', () => {
    /*
      A filter that skipped changes whose before and after carried the same
      `updatedAt` shipped for an afternoon and lost real entries: two writes inside
      one millisecond share a stamp, and creating an item and then saving the first
      thing typed into it is exactly that. Nothing reported it — the entry was simply
      not in the list.
    */
    const stamp = '2026-01-01T00:00:00.000Z';
    journal.record('Edited an item', vaultId, [
      {
        type: 'item',
        id: 'i1',
        before: { id: 'i1', updatedAt: stamp, stem: 'before' },
        after: { id: 'i1', updatedAt: stamp, stem: 'after' }
      }
    ]);
    expect(labels()).toEqual(['Edited an item']);
  });

  it('leaves nothing behind for a write marked unjournalable', async () => {
    // Loading the sample and importing a bundle go through `writer.run`, which cannot
    // take a before-image of an opaque closure. They must record nothing rather than
    // record something incomplete.
    const before = journal.entries.length;
    await vaultList.remove(vaultId);
    expect(journal.entries.length).toBe(before);
  });
});

describe('undo', () => {
  it('takes back an added item, and gives it back on redo', async () => {
    const item = await items.add('choice', undefined);
    expect(await repository.items.get(item.id)).toBeDefined();

    const entry = journal.forVault(vaultId)[0];
    expect(entry).toBeDefined();
    expect(await undo.flip(entry!)).toBe(true);
    expect(await repository.items.get(item.id)).toBeUndefined();

    // Redo is the same entry flipped back, not a second stack.
    expect(await undo.flip(journal.forVault(vaultId)[0]!)).toBe(true);
    expect(await repository.items.get(item.id)).toBeDefined();
  });

  it('restores a deleted item and its siblings’ numbering in one step', async () => {
    const first = await items.add('choice', undefined);
    const second = await items.add('choice', undefined);
    const third = await items.add('choice', undefined);

    await items.remove(second.id);
    expect((await repository.items.get(third.id))?.order).toBe(1);

    // ONE entry for the removal and the renumber together. Two would mean undoing
    // twice, with the questions misnumbered in between.
    expect(labels()[0]).toBe('Deleted an item');
    expect(await undo.undoLast(vaultId)).toBe(true);

    expect(await repository.items.get(second.id)).toBeDefined();
    expect((await repository.items.get(first.id))?.order).toBe(0);
    expect((await repository.items.get(second.id))?.order).toBe(1);
    expect((await repository.items.get(third.id))?.order).toBe(2);
  });

  it('restores a deleted collection WITH the questions it took with it', async () => {
    /*
      `repository.collections.remove` cascades to the items in the same transaction.
      A journal that recorded only the collection would restore it empty, and the
      change list would say the delete had been undone while every question in it was
      gone for good.
    */
    const one = await items.add('choice', undefined);
    const two = await items.add('essay', undefined);

    await collections.remove(collectionId);
    expect(await repository.items.listByCollection(collectionId)).toHaveLength(0);

    expect(await undo.undoLast(vaultId)).toBe(true);
    expect(await repository.collections.get(collectionId)).toBeDefined();
    expect(
      (await repository.items.listByCollection(collectionId)).map((item) => item.id).sort()
    ).toEqual([one.id, two.id].sort());
  });

  it('restores a whole deleted branch of the outcome tree at once', async () => {
    const parent = await outcomes.add(null);
    const child = await outcomes.add(parent.id);
    const grandchild = await outcomes.add(child.id);

    await outcomes.remove(parent.id);
    expect(await repository.outcomes.listByVault(vaultId)).toHaveLength(0);

    expect(labels()[0]).toBe('Deleted an outcome');
    expect(await undo.undoLast(vaultId)).toBe(true);
    expect(
      (await repository.outcomes.listByVault(vaultId)).map((outcome) => outcome.id).sort()
    ).toEqual([parent.id, child.id, grandchild.id].sort());
  });

  it('leaves the store showing what storage now holds', async () => {
    // The half that has no other way of being noticed: `items.load` returns early for
    // a collection it is already showing, so an undo that skipped the refresh would
    // write the right records and leave the wrong ones on screen.
    const item = await items.add('choice', undefined);
    expect(items.items.map((existing) => existing.id)).toContain(item.id);

    await undo.undoLast(vaultId);
    expect(items.items.map((existing) => existing.id)).not.toContain(item.id);
  });
});

describe('what undo refuses', () => {
  it('will not revert out of order past a later change to the same record', async () => {
    const item = await items.add('choice', undefined);

    item.stem = 'First wording';
    items.queueFieldSave(item.id);
    await items.flush();

    item.stem = 'Second wording';
    items.queueFieldSave(item.id);
    await items.flush();

    // The middle entry: reverting it alone would put the first wording back and
    // discard the second, which storage currently holds.
    const middle = journal.forVault(vaultId)[1];
    expect(await undo.flip(middle!)).toBe(false);
    expect(journal.notice).toContain('cannot be undone on its own');
    expect((await repository.items.get(item.id))?.stem).toBe('Second wording');
  });

  it('offers the run instead, and the run gets it right', async () => {
    const item = await items.add('choice', undefined);

    for (const stem of ['First wording', 'Second wording']) {
      item.stem = stem;
      items.queueFieldSave(item.id);
      await items.flush();
    }

    const middle = journal.forVault(vaultId)[1];
    expect(await undo.undoBackTo(middle!)).toBe(true);

    // Undone newest-first, so the record ends up as the middle entry found it.
    expect((await repository.items.get(item.id))?.stem).toBe('');
    expect(journal.forVault(vaultId).filter((e) => e.state === 'applied')).toHaveLength(1);
  });

  it('will not undo a change whose record has been written since', async () => {
    const item = await items.add('choice', undefined);
    const entry = journal.forVault(vaultId)[0];

    /*
      Behind the journal's back — another tab, a merge import, anything at all.

      Written with `put` and an explicit stamp rather than `update`, which would stamp
      it `nowIso()`: the check compares `updatedAt`, and a test that creates a record
      and rewrites it in the same millisecond is asking whether two identical strings
      differ. That made this test fail about one run in twenty before it was pinned to
      a stamp of its own.
    */
    const stored = await repository.items.get(item.id);
    await repository.items.put({
      ...stored!,
      stem: 'Written elsewhere',
      updatedAt: '2027-01-01T00:00:00.000Z'
    });

    expect(await undo.flip(entry!)).toBe(false);
    expect(journal.notice).toContain('has been written');
    expect((await repository.items.get(item.id))?.stem).toBe('Written elsewhere');
  });

  it('will not strand records inside something it is about to remove', async () => {
    const created = await collections.create({ kind: 'quiz', title: 'Unit 2' });
    await items.load(created.id);
    await items.add('choice', undefined);

    // Nothing later touched the collection record itself, so the id-intersection rule
    // has nothing to say — this is the case only the ownership check catches.
    const entry = journal.forVault(vaultId).find((e) => e.label === 'Added a collection');
    expect(await undo.flip(entry!)).toBe(false);
    expect(journal.notice).toContain('no longer exists');
    expect(await repository.collections.get(created.id)).toBeDefined();
  });

  it('allows the same undo once the questions have gone too', async () => {
    const created = await collections.create({ kind: 'quiz', title: 'Unit 2' });
    await items.load(created.id);
    await items.add('choice', undefined);

    const entry = journal.forVault(vaultId).find((e) => e.label === 'Added a collection');
    expect(await undo.undoBackTo(entry!)).toBe(true);
    expect(await repository.collections.get(created.id)).toBeUndefined();
  });

  it('says so rather than doing nothing when there is nothing left', async () => {
    expect(await undo.undoLast(vaultId)).toBe(false);
    expect(journal.notice).toContain('Nothing left to undo');
  });
});

describe('the cap', () => {
  it('drops the oldest and admits it', async () => {
    // Driven through the log directly: making a hundred real writes would test
    // fake-indexeddb rather than the cap.
    for (let index = 0; index < journal.limit + 3; index += 1) {
      journal.record(`Change ${index}`, vaultId, [
        {
          type: 'item',
          id: `item-${index}`,
          before: null,
          after: { id: `item-${index}`, updatedAt: '2026-01-01T00:00:00.000Z' }
        }
      ]);
    }

    expect(journal.entries).toHaveLength(journal.limit);
    expect(journal.dropped).toBe(3);
    expect(labels()[journal.limit - 1]).toBe('Change 3');
  });
});
