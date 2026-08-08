import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieRepository } from './dexie';
import { newId } from '$lib/domain/ids';
import {
  aCollection,
  aCriterion,
  aRubric,
  anItem,
  anOutcome,
  aVault,
  levels
} from '$lib/domain/fixtures';
import type { VaultSnapshot } from '$lib/domain/schema';

/*
  Every test gets its own database name. fake-indexeddb keeps one shared in-memory
  backing store per process, so a fixed name would leak rows between tests and make
  failures depend on execution order.
*/
let repo: DexieRepository;

beforeEach(() => {
  repo = new DexieRepository(`drawbridge-test-${newId()}`);
});

afterEach(async () => {
  await repo.destroy();
});

/** A vault with one of everything, wired together. */
async function seed() {
  const vault = aVault({ code: 'STAT101' });
  await repo.vaults.put(vault);

  const parent = anOutcome({ vaultId: vault.id, code: 'CO1', parentId: null });
  const child = anOutcome({ vaultId: vault.id, code: 'EO1.1', parentId: parent.id });
  await repo.outcomes.putMany([parent, child]);

  const fourPoint = levels(['Exemplary', 4], ['Proficient', 3]);
  const rubric = aRubric({
    vaultId: vault.id,
    levels: fourPoint,
    criteria: [aCriterion('Clarity', fourPoint, { outcomeIds: [child.id] })]
  });
  await repo.rubrics.put(rubric);

  const collection = aCollection({ vaultId: vault.id, kind: 'quiz' });
  await repo.collections.put(collection);

  const group = anItem('group', {
    collectionId: collection.id,
    outcomeIds: [child.id],
    parts: [anItem('choice', { collectionId: collection.id, points: 2 })]
  });
  const essay = anItem('essay', { collectionId: collection.id, rubricId: rubric.id });
  await repo.items.putMany([group, essay]);

  return { vault, parent, child, rubric, collection, group, essay };
}

describe('crud', () => {
  it('round-trips an entity through storage unchanged', async () => {
    const vault = aVault();
    await repo.vaults.put(vault);
    expect(await repo.vaults.get(vault.id)).toEqual(vault);
  });

  it('returns undefined rather than throwing for a missing id', async () => {
    expect(await repo.vaults.get('nope')).toBeUndefined();
  });

  it('preserves custom fields and unknown keys through a write and read', async () => {
    // The extension seam has to survive storage, not just parsing.
    const vault = { ...aVault(), fields: { dean: 'ok' }, fromAFutureVersion: [1, 2] };
    await repo.vaults.put(vault as never);
    expect(await repo.vaults.get(vault.id)).toEqual(vault);
  });

  it('put writes timestamps verbatim, so a restore stays faithful', async () => {
    const vault = aVault({ updatedAt: '2020-01-01T00:00:00.000Z' });
    await repo.vaults.put(vault);
    expect((await repo.vaults.get(vault.id))?.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('update merges, stamps updatedAt, and leaves untouched fields alone', async () => {
    const vault = aVault({ updatedAt: '2020-01-01T00:00:00.000Z', term: 'Fall' });
    await repo.vaults.put(vault);

    const updated = await repo.vaults.update(vault.id, { name: 'Statistics II' });
    expect(updated.name).toBe('Statistics II');
    expect(updated.term).toBe('Fall');
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('refuses to let a patch move a record to a different key', async () => {
    const vault = aVault();
    await repo.vaults.put(vault);

    const updated = await repo.vaults.update(vault.id, { id: 'somewhere-else' } as never);
    expect(updated.id).toBe(vault.id);
    expect(await repo.vaults.get('somewhere-else')).toBeUndefined();
  });

  it('throws when updating something that is not there', async () => {
    await expect(repo.vaults.update('ghost', { name: 'x' })).rejects.toThrow(/does not exist/);
  });

  it('lists in a stable order regardless of insertion order', async () => {
    const a = aVault({ id: 'aaa' });
    const b = aVault({ id: 'bbb' });
    await repo.vaults.put(b);
    await repo.vaults.put(a);
    expect((await repo.vaults.list()).map((v) => v.id)).toEqual(['aaa', 'bbb']);
  });
});

describe('scoped listing', () => {
  it('lists outcomes, collections and rubrics by vault', async () => {
    const { vault } = await seed();
    const other = aVault({ code: 'BIO9' });
    await repo.vaults.put(other);
    await repo.outcomes.put(anOutcome({ vaultId: other.id, code: 'CO1' }));

    expect(await repo.outcomes.listByVault(vault.id)).toHaveLength(2);
    expect(await repo.outcomes.listByVault(other.id)).toHaveLength(1);
    expect(await repo.collections.listByVault(vault.id)).toHaveLength(1);
    expect(await repo.rubrics.listByVault(vault.id)).toHaveLength(1);
  });

  it('lists top-level items only, with group parts nested inside their parent', async () => {
    const { collection } = await seed();
    const items = await repo.items.listByCollection(collection.id);

    expect(items).toHaveLength(2);
    const group = items.find((item) => item.kind === 'group');
    expect(group?.parts).toHaveLength(1);
    // A part is not a row of its own; it is only reachable through its parent.
    expect(await repo.items.get(group!.parts[0]!.id)).toBeUndefined();
  });
});

describe('cascades', () => {
  it('takes a collection’s items with it when the collection goes', async () => {
    const { collection } = await seed();
    await repo.collections.remove(collection.id);

    expect(await repo.collections.get(collection.id)).toBeUndefined();
    expect(await repo.items.listByCollection(collection.id)).toEqual([]);
    expect(await repo.items.list()).toEqual([]);
  });

  it('deletes a vault and everything under it, leaving other vaults intact', async () => {
    const { vault } = await seed();
    const survivor = aVault({ code: 'BIO9' });
    await repo.vaults.put(survivor);
    await repo.outcomes.put(anOutcome({ vaultId: survivor.id, code: 'CO1' }));

    await repo.deleteVault(vault.id);

    expect(await repo.vaults.get(vault.id)).toBeUndefined();
    expect(await repo.outcomes.listByVault(vault.id)).toEqual([]);
    expect(await repo.collections.listByVault(vault.id)).toEqual([]);
    expect(await repo.rubrics.listByVault(vault.id)).toEqual([]);
    expect(await repo.items.list()).toEqual([]);

    expect(await repo.vaults.get(survivor.id)).toBeDefined();
    expect(await repo.outcomes.listByVault(survivor.id)).toHaveLength(1);
  });
});

describe('export and import', () => {
  it('exports everything belonging to one vault and nothing else', async () => {
    const { vault } = await seed();
    const other = aVault({ code: 'BIO9' });
    await repo.vaults.put(other);
    const otherCollection = aCollection({ vaultId: other.id, kind: 'quiz' });
    await repo.collections.put(otherCollection);
    await repo.items.put(anItem('choice', { collectionId: otherCollection.id }));

    const snapshot = await repo.exportVault(vault.id);
    expect(snapshot.vault.id).toBe(vault.id);
    expect(snapshot.outcomes).toHaveLength(2);
    expect(snapshot.collections).toHaveLength(1);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.rubrics).toHaveLength(1);
  });

  it('throws for a vault that is not there', async () => {
    await expect(repo.exportVault('ghost')).rejects.toThrow(/No vault/);
  });

  it('round-trips: export, wipe, re-import, deep equal', async () => {
    // The property the whole backup story rests on. If this ever fails, "restore from
    // a bundle" has stopped being a faithful operation.
    const { vault } = await seed();
    const before = await repo.exportVault(vault.id);

    await repo.deleteVault(vault.id);
    expect(await repo.vaults.get(vault.id)).toBeUndefined();

    await repo.importVault(before, 'merge');
    expect(await repo.exportVault(vault.id)).toEqual(before);
  });

  it('survives a JSON round-trip in the middle, as a real bundle would', async () => {
    const { vault } = await seed();
    const before = await repo.exportVault(vault.id);
    await repo.deleteVault(vault.id);

    const throughAFile: VaultSnapshot = JSON.parse(JSON.stringify(before));
    await repo.importVault(throughAFile, 'merge');

    expect(await repo.exportVault(vault.id)).toEqual(before);
  });

  it('importing as new twice yields two independent vaults', async () => {
    // Without id remapping the second import would overwrite the first, and restoring
    // a backup would destroy the vault it was meant to sit beside.
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);

    const first = await repo.importVault(bundle, 'new');
    const second = await repo.importVault(bundle, 'new');

    expect(first.vaultId).not.toBe(second.vaultId);
    expect(first.vaultId).not.toBe(vault.id);
    expect(await repo.vaults.list()).toHaveLength(3);

    const firstItems = await repo.exportVault(first.vaultId);
    const secondItems = await repo.exportVault(second.vaultId);
    expect(firstItems.items).toHaveLength(2);
    expect(secondItems.items).toHaveLength(2);
    expect(firstItems.items[0]?.id).not.toBe(secondItems.items[0]?.id);
  });

  it('keeps relationships intact through an import as new', async () => {
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);
    const { vaultId } = await repo.importVault(bundle, 'new');

    const copy = await repo.exportVault(vaultId);
    const collection = copy.collections[0]!;
    const group = copy.items.find((item) => item.kind === 'group')!;
    const essay = copy.items.find((item) => item.kind === 'essay')!;

    expect(collection.vaultId).toBe(vaultId);
    expect(group.collectionId).toBe(collection.id);
    expect(group.parts[0]?.collectionId).toBe(collection.id);
    expect(copy.outcomes.some((o) => o.id === group.outcomeIds[0])).toBe(true);
    expect(essay.rubricId).toBe(copy.rubrics[0]?.id);
    expect(copy.outcomes.some((o) => o.parentId === null)).toBe(true);
    expect(copy.outcomes.some((o) => o.parentId !== null)).toBe(true);
  });

  it('merges into an existing vault matched by id', async () => {
    const { vault, collection } = await seed();
    const bundle = await repo.exportVault(vault.id);

    const edited: VaultSnapshot = {
      ...bundle,
      collections: [{ ...collection, title: 'Renamed' }]
    };
    const result = await repo.importVault(edited, 'merge');

    expect(result.mergedIntoExisting).toBe(true);
    expect(result.vaultId).toBe(vault.id);
    expect((await repo.collections.get(collection.id))?.title).toBe('Renamed');
    expect(await repo.vaults.list()).toHaveLength(1);
  });

  it('merges by code when the id does not match, re-pointing the incoming records', async () => {
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);

    // Same course, different id — a bundle exported from the other machine.
    const fromElsewhere: VaultSnapshot = {
      ...bundle,
      vault: { ...bundle.vault, id: 'a-different-vault-id', name: 'Statistics (work laptop)' }
    };

    const result = await repo.importVault(fromElsewhere, 'merge');

    expect(result.mergedIntoExisting).toBe(true);
    expect(result.vaultId).toBe(vault.id);
    expect(await repo.vaults.list()).toHaveLength(1);
    // The incoming outcomes must now belong to the vault that was already here,
    // not to the id the bundle arrived with.
    for (const outcome of await repo.outcomes.list()) expect(outcome.vaultId).toBe(vault.id);
  });

  it('creates the vault when merge finds nothing to merge into', async () => {
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);
    await repo.deleteVault(vault.id);

    const result = await repo.importVault(bundle, 'merge');
    expect(result.mergedIntoExisting).toBe(false);
    expect(result.vaultId).toBe(vault.id);
  });

  it('reports what it imported', async () => {
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);
    const result = await repo.importVault(bundle, 'new');

    expect(result.counts).toEqual({ outcomes: 2, collections: 1, items: 2, rubrics: 1 });
  });

  it('rejects a corrupt bundle instead of writing it', async () => {
    const { vault } = await seed();
    const bundle = await repo.exportVault(vault.id);
    const corrupt = { ...bundle, items: [{ ...bundle.items[0], kind: 'matching' }] };

    await expect(repo.importVault(corrupt as never, 'new')).rejects.toThrow();
    // Nothing partial was written.
    expect(await repo.vaults.list()).toHaveLength(1);
  });
});

describe('persistence across connections', () => {
  it('data written by one connection is there for the next', async () => {
    // The reload test, minus the browser: a new DexieRepository over the same
    // database name must see what the previous one wrote.
    const name = `drawbridge-reopen-${newId()}`;
    const first = new DexieRepository(name);
    const vault = aVault({ code: 'PERSIST' });
    await first.vaults.put(vault);
    first.close();

    const second = new DexieRepository(name);
    expect(await second.vaults.get(vault.id)).toEqual(vault);
    await second.destroy();
  });
});
