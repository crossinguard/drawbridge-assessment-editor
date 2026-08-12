import { repository } from '$lib/repo';
import { cloneSnapshot, type CloneOptions } from '$lib/domain/clone';
import { newVault } from '$lib/domain/defaults';
import { nowIso } from '$lib/domain/ids';
import type { Vault } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { WriteStatus, writer } from './writer.svelte';
import { plain } from './plain.svelte';

/*
  The vault list.

  Read-modify-refresh: every mutation writes through the repository and then re-reads.
  There is no live-query layer and no optimistic local patching, because the two would
  have to be kept in agreement and this list is short, read rarely, and never hot. When
  the item authoring screen arrives it will need something finer-grained; this does not.
*/

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

class VaultListStore {
  items = $state<Vault[]>([]);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);

  /*
    Where a failed write on this screen goes.

    There is no debounced editing on the course list — create, rename and delete are all
    immediate — so there was no `Autosave` for them to report to, and before stage 21 a
    failure went nowhere at all: no indicator moved, no message appeared, and the course
    simply was not there. `error` above is the LOAD error and the screen renders it in
    place of the list, which is the wrong treatment for a write that failed.
  */
  readonly writes = new WriteStatus();

  async load(): Promise<void> {
    /*
      Only the FIRST load reports "loading". A refresh after a mutation keeps the
      current status, because the screen swaps to a spinner otherwise — and anything
      rendered in that branch is unmounted and loses its state.

      That is not hypothetical: it made the import panel's result message vanish the
      instant it appeared, since importing refreshes this list.
    */
    if (this.status !== 'ready') this.status = 'loading';
    try {
      this.items = await repository.vaults.list();
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  async create(input: { name: string; code: string; term?: string }): Promise<Vault> {
    const vault = newVault(input);
    await writer.put('vault', plain(vault), {
      label: 'Created a course',
      vaultId: vault.id,
      report: this.writes
    });
    await this.load();
    return vault;
  }

  async rename(id: string, patch: Partial<Vault>): Promise<void> {
    await writer.update('vault', id, plain(patch), {
      label: 'Renamed a course',
      vaultId: id,
      report: this.writes
    });
    await this.load();
  }

  /**
   * Removes the vault and everything under it. There is no undo for this.
   *
   * `journal: false`, and it will stay false. The write touches an unbounded number of
   * records across every table, so capturing a before-image costs as much as the delete
   * — and an undo that offered to restore a course and then could not would be worse
   * than one that says plainly that it cannot.
   */
  async remove(id: string): Promise<void> {
    await writer.run(
      { label: 'Deleted a course', vaultId: id, report: this.writes, journal: false },
      () => repository.deleteVault(id)
    );
    await this.load();
  }

  /**
   * Copies a course, carrying its settings and as much content as was asked for.
   *
   * One method rather than a sequence the route performs, which is what made the write
   * funnel a one-line retrofit here rather than a change to the clone screen.
   *
   * The `flushAll()` is not optional. `exportVault` reads STORAGE, and the settings
   * screen writes on a debounce — so cloning straight after editing a status label
   * would copy the course as it was a second ago, and the difference would be invisible
   * until someone went looking for a vocabulary entry that never arrived.
   */
  async clone(sourceId: string, options: Omit<CloneOptions, 'now'>): Promise<string> {
    await Autosave.flushAll();

    const snapshot = await repository.exportVault(sourceId);
    const copy = cloneSnapshot(snapshot, { ...options, now: nowIso() });

    // 'new' rather than 'merge', which is what routes this through `remapSnapshotIds`
    // and makes the copy independent. Cloning does not remap anything itself.
    //
    // `journal: false` for the same reason as deleting: an import writes every table at
    // once and there is no cheap before-image.
    const result = await writer.run(
      { label: 'Copied a course', vaultId: sourceId, report: this.writes, journal: false },
      () => repository.importVault(plain(copy), 'new')
    );
    await this.load();
    return result.vaultId;
  }
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const vaultList = new VaultListStore();
