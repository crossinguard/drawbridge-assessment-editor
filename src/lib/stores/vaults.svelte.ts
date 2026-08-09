import { repository } from '$lib/repo';
import { newVault } from '$lib/domain/defaults';
import type { Vault } from '$lib/domain/schema';
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

  async load(): Promise<void> {
    this.status = 'loading';
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
    await repository.vaults.put(plain(vault));
    await this.load();
    return vault;
  }

  async rename(id: string, patch: Partial<Vault>): Promise<void> {
    await repository.vaults.update(id, plain(patch));
    await this.load();
  }

  /** Removes the vault and everything under it. There is no undo for this. */
  async remove(id: string): Promise<void> {
    await repository.deleteVault(id);
    await this.load();
  }
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const vaultList = new VaultListStore();
