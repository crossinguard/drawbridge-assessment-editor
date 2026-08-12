import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { WriteStatus, writer } from './writer.svelte';
import { repository } from '$lib/repo';
import { newCollection, newItem, newOutcome, newVault } from '$lib/domain/defaults';
import { newId } from '$lib/domain/ids';

/*
  The funnel's own behaviour, which is reporting.

  The stores' integration tests cover what gets written; these cover what happens to the
  indicator when it does and does not, because that is the whole reason this file exists.
  A write that fails and says nothing is the failure this app cannot afford.
*/

let vaultId: string;
let collectionId: string;

beforeEach(async () => {
  for (const vault of await repository.vaults.list()) await repository.deleteVault(vault.id);

  const vault = newVault({ name: 'Statistics', code: `STAT${newId()}` });
  await repository.vaults.put(vault);
  vaultId = vault.id;

  const collection = newCollection({ vaultId, kind: 'quiz', title: 'Unit 1' });
  await repository.collections.put(collection);
  collectionId = collection.id;
});

const intent = (report?: WriteStatus) => ({ label: 'Test write', vaultId, report });

describe('reporting', () => {
  it('reports success once the write has actually resolved', () => {
    const report = new WriteStatus();
    expect(report.status).toBe('idle');
    return writer
      .put('item', newItem({ collectionId, kind: 'choice' }), intent(report))
      .then(() => expect(report.status).toBe('saved'));
  });

  it('reports a failure rather than letting it pass in silence', async () => {
    /*
      `update` throws when the record is not there, which is the cheapest real failure
      to provoke. What matters is not which error it is — it is that the reporter hears
      about it. Seven store methods did not, before this.
    */
    const report = new WriteStatus();

    await expect(
      writer.update('item', 'no-such-item', { stem: 'x' }, intent(report))
    ).rejects.toThrow();

    expect(report.status).toBe('error');
    expect(report.error).toContain('no-such-item');
  });

  it('rethrows, so a caller that needs to know still finds out', async () => {
    // The funnel guarantees the indicator never misses a failure. It does not swallow
    // one on the caller's behalf — a screen navigating away on success has to be able
    // to not do that.
    await expect(writer.remove('vault', 'missing', intent())).resolves.toBeUndefined();
    await expect(
      writer.update('collection', 'missing', { title: 'x' }, intent())
    ).rejects.toThrow();
  });

  it('survives having nobody watching', async () => {
    // `report` is optional, and a write with none must still happen rather than throw
    // on a missing reporter.
    await writer.put('outcome', newOutcome({ vaultId, code: 'CO1', text: 'x' }), intent());
    expect(await repository.outcomes.listByVault(vaultId)).toHaveLength(1);
  });

  it('clears a previous failure when the next write succeeds', async () => {
    const report = new WriteStatus();
    await expect(
      writer.update('item', 'gone', { stem: 'x' }, intent(report))
    ).rejects.toThrow();
    expect(report.status).toBe('error');

    await writer.put('item', newItem({ collectionId, kind: 'choice' }), intent(report));
    expect(report.status).toBe('saved');
    expect(report.error).toBeNull();
  });
});

describe('the table map', () => {
  it('reaches every entity type', async () => {
    /*
      The one cast in the funnel is what lets a single map serve five differently-typed
      tables, so the map is worth exercising end to end — a wrong entry would send an
      outcome into the items table, and nothing about that fails at compile time.
    */
    const outcome = newOutcome({ vaultId, code: 'CO1', text: 'Summarise data.' });
    const item = newItem({ collectionId, kind: 'choice' });

    await writer.put('outcome', outcome, intent());
    await writer.put('item', item, intent());

    expect((await repository.outcomes.get(outcome.id))?.code).toBe('CO1');
    expect((await repository.items.get(item.id))?.kind).toBe('choice');
    // And nothing landed in the wrong place.
    expect(await repository.items.get(outcome.id)).toBeUndefined();
    expect(await repository.outcomes.get(item.id)).toBeUndefined();
  });

  it('writes many in one go, and skips an empty batch', async () => {
    const report = new WriteStatus();
    await writer.putMany('item', [], intent(report));
    // Nothing written, and nothing claimed: an empty batch is not a save.
    expect(report.status).toBe('idle');

    await writer.putMany(
      'item',
      [newItem({ collectionId, kind: 'choice' }), newItem({ collectionId, kind: 'essay' })],
      intent(report)
    );
    expect(await repository.items.listByCollection(collectionId)).toHaveLength(2);
    expect(report.status).toBe('saved');
  });

  it('keeps put verbatim, which is what makes a restore faithful', async () => {
    // `put` must not stamp `updatedAt`; `update` must. The two are separate funnel
    // methods precisely so this distinction survives.
    const item = newItem({ collectionId, kind: 'choice' });
    const stamped = { ...item, updatedAt: '2020-01-01T00:00:00.000Z' };

    await writer.put('item', stamped, intent());
    expect((await repository.items.get(item.id))?.updatedAt).toBe('2020-01-01T00:00:00.000Z');

    await writer.update('item', item.id, { stem: 'Edited' }, intent());
    expect((await repository.items.get(item.id))?.updatedAt).not.toBe(
      '2020-01-01T00:00:00.000Z'
    );
  });
});
