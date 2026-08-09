import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { outcomes } from './outcomes.svelte';
import { repository } from '$lib/repo';
import { newVault } from '$lib/domain/defaults';
import { buildTree, walkTree } from '$lib/domain/outcomes';

/*
  Integration tests over the real store and the real repository, against
  fake-indexeddb.

  These exist because the interesting bugs in this layer are not in either piece on
  its own — they are in how the store drives the saver, and in whether a structural
  operation leaves the tree in a shape that round-trips. Both are invisible to a unit
  test of either half.
*/

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

let vaultId: string;

beforeEach(async () => {
  for (const vault of await repository.vaults.list()) await repository.deleteVault(vault.id);
  const vault = newVault({ name: 'Statistics', code: `STAT${Math.random()}` });
  await repository.vaults.put(vault);
  vaultId = vault.id;

  outcomes.close();
  await outcomes.load(vaultId);
});

/** What is actually on disk, in tree order. */
async function stored() {
  const rows = await repository.outcomes.listByVault(vaultId);
  return walkTree(buildTree(rows)).map((node) => ({
    code: node.outcome.code,
    text: node.outcome.text,
    depth: node.depth
  }));
}

describe('field edits', () => {
  it('persists a second edit to the same outcome', async () => {
    /*
      The regression this file exists for.

      The store used to queue a list of dirty ids rather than the record content. The
      id list does not change between two edits to the same outcome, so the saver's
      no-op check treated the second one as already-saved and dropped it — silently,
      with the indicator still reading "Saved". Typed text was lost.
    */
    const created = await outcomes.add(null);

    created.text = 'First version';
    outcomes.queueFieldSave(created.id);
    await outcomes.flush();
    expect((await repository.outcomes.get(created.id))?.text).toBe('First version');

    created.text = 'Second version';
    outcomes.queueFieldSave(created.id);
    await outcomes.flush();
    expect((await repository.outcomes.get(created.id))?.text).toBe('Second version');

    created.text = 'Third version';
    outcomes.queueFieldSave(created.id);
    await outcomes.flush();
    expect((await repository.outcomes.get(created.id))?.text).toBe('Third version');
  });

  it('persists edits to several outcomes queued together', async () => {
    const a = await outcomes.add(null);
    const b = await outcomes.add(null);

    a.text = 'Outcome A';
    outcomes.queueFieldSave(a.id);
    b.text = 'Outcome B';
    outcomes.queueFieldSave(b.id);
    await outcomes.flush();

    expect((await repository.outcomes.get(a.id))?.text).toBe('Outcome A');
    expect((await repository.outcomes.get(b.id))?.text).toBe('Outcome B');
  });

  it('does not write when an edit is undone back to the stored value', async () => {
    const created = await outcomes.add(null);
    created.text = 'Something';
    outcomes.queueFieldSave(created.id);
    await outcomes.flush();

    const after = await repository.outcomes.get(created.id);

    created.text = 'Something else';
    outcomes.queueFieldSave(created.id);
    created.text = 'Something';
    outcomes.queueFieldSave(created.id);
    await outcomes.flush();
    await settle();

    // Same content, so updatedAt must not have moved either.
    expect(await repository.outcomes.get(created.id)).toEqual(after);
  });
});

describe('structure', () => {
  it('suggests codes from the parent, and keeps them when the shape changes', async () => {
    const root = await outcomes.add(null);
    expect(root.code).toBe('CO1');

    const child = await outcomes.add(root.id);
    expect(child.code).toBe('CO1.1');

    // Indenting does not rewrite a code the author may have chosen deliberately.
    const second = await outcomes.add(null);
    expect(second.code).toBe('CO2');
    await outcomes.indent(second.id);
    expect(second.code).toBe('CO2');
  });

  it('nests on indent and lifts on outdent, persisting both', async () => {
    const first = await outcomes.add(null);
    const second = await outcomes.add(null);

    await outcomes.indent(second.id);
    expect(await stored()).toEqual([
      { code: 'CO1', text: '', depth: 0 },
      { code: 'CO2', text: '', depth: 1 }
    ]);

    await outcomes.outdent(second.id);
    expect(await stored()).toEqual([
      { code: 'CO1', text: '', depth: 0 },
      { code: 'CO2', text: '', depth: 0 }
    ]);

    expect(first.parentId).toBeNull();
  });

  it('refuses to indent the first of a group, which has nothing to nest under', async () => {
    const first = await outcomes.add(null);
    await outcomes.indent(first.id);
    expect(first.parentId).toBeNull();
  });

  it('moves within a sibling group and leaves other groups alone', async () => {
    const parent = await outcomes.add(null);
    const a = await outcomes.add(parent.id);
    const b = await outcomes.add(parent.id);
    a.text = 'A';
    b.text = 'B';
    outcomes.queueFieldSave(a.id);
    outcomes.queueFieldSave(b.id);
    await outcomes.flush();

    await outcomes.move(b.id, -1);
    expect((await stored()).map((row) => row.text)).toEqual(['', 'B', 'A']);
  });

  it('renumbers order densely, so a move is always a straight swap', async () => {
    const parent = await outcomes.add(null);
    await outcomes.add(parent.id);
    await outcomes.add(parent.id);
    await outcomes.add(parent.id);

    const children = (await repository.outcomes.listByVault(vaultId))
      .filter((outcome) => outcome.parentId === parent.id)
      .map((outcome) => outcome.order)
      .sort();
    expect(children).toEqual([0, 1, 2]);
  });

  it('deletes a whole branch and closes the gap it leaves', async () => {
    const parent = await outcomes.add(null);
    const child = await outcomes.add(parent.id);
    const grandchild = await outcomes.add(child.id);
    const sibling = await outcomes.add(null);

    expect(outcomes.descendantsOf(parent.id).map((o) => o.id)).toEqual([
      child.id,
      grandchild.id
    ]);

    await outcomes.remove(parent.id);

    expect(await repository.outcomes.get(child.id)).toBeUndefined();
    expect(await repository.outcomes.get(grandchild.id)).toBeUndefined();
    expect(await repository.outcomes.get(sibling.id)).toBeDefined();
    // The survivor slides down to fill the hole rather than keeping order 1.
    expect((await repository.outcomes.get(sibling.id))?.order).toBe(0);
  });

  it('does not resurrect a deleted outcome through a queued edit', async () => {
    const created = await outcomes.add(null);
    created.text = 'About to go';
    outcomes.queueFieldSave(created.id);

    await outcomes.remove(created.id);
    await outcomes.flush();

    expect(await repository.outcomes.get(created.id)).toBeUndefined();
  });
});
