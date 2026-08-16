import { repository } from '$lib/repo';
import type { Vault } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
import { writer } from './writer.svelte';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  The vault currently being worked on, and its editing draft.

  `draft` is the live object the settings screen binds to. Nothing debounces the typing
  itself — edits land in the draft immediately, and only the write to storage is
  delayed, so the UI never lags behind the keyboard.
*/

class ActiveVaultStore {
  draft = $state<Vault | null>(null);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);

  readonly saver = new Autosave<Vault>(async (value) => {
    // No `report`: the saver marks its own outcome around this callback.
    await writer.put('vault', value, { label: 'Edited course settings', vaultId: value.id });
  });

  /** Loads a vault, or re-uses the one already open. */
  async open(vaultId: string): Promise<void> {
    if (this.draft?.id === vaultId && this.status === 'ready') return;

    this.status = 'loading';
    this.draft = null;
    try {
      const vault = await repository.vaults.get(vaultId);
      if (!vault) {
        this.error = 'That vault is not in this browser.';
        this.status = 'error';
        return;
      }
      this.draft = vault;
      // Tell the autosave this is what is already stored, so the first effect run
      // after a load does not write the record straight back and bump updatedAt.
      this.saver.accept(vault);
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  /**
   * Re-reads the open vault, past the guard in `open`.
   *
   * For undo, which rewrites the record under a screen that is already showing it —
   * `open` would see the same id and return without reading anything. The `accept` is
   * what stops the settings effect noticing a new draft object and writing it straight
   * back over the version just restored.
   */
  async refresh(): Promise<void> {
    if (!this.draft) return;
    const vault = await repository.vaults.get(this.draft.id);
    if (!vault) return;
    this.saver.cancel();
    this.draft = vault;
    this.saver.accept(vault);
  }

  /**
   * Queues the current draft for saving. Called from an `$effect` that reads the draft
   * deeply, so any nested config edit reaches storage without every editor component
   * having to remember to announce itself.
   */
  queueSave(): void {
    if (this.status !== 'ready' || !this.draft) return;
    this.saver.queue(plain(this.draft));
  }

  async flush(): Promise<void> {
    await this.saver.flush();
  }

  close(): void {
    this.draft = null;
    this.status = 'idle';
  }
}

export const activeVault = new ActiveVaultStore();
