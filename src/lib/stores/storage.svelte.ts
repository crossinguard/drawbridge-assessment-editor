import { requestPersistence, storageEstimate, type StorageStatus } from '$lib/repo';

/*
  What the browser has actually promised about this data, surfaced rather than assumed.

  The app holds the only copy of the user's work. If the browser has not granted
  persistent storage, it is entitled to evict everything the next time it feels short
  of disk — silently. The UI's job is to say so plainly and make export obvious, not to
  reassure.
*/

class StorageStore {
  state = $state<StorageStatus>({ supported: false, persisted: false });
  asked = $state(false);

  /** Called once on first run. Safe to call again; it will not re-prompt if granted. */
  async ensure(): Promise<void> {
    this.state = await requestPersistence();
    this.asked = true;
  }

  async refresh(): Promise<void> {
    this.state = await storageEstimate();
  }

  get usedLabel(): string {
    const used = this.state.usageBytes;
    if (used === undefined) return 'unknown';
    if (used < 1024) return `${used} B`;
    if (used < 1024 * 1024) return `${(used / 1024).toFixed(1)} kB`;
    return `${(used / 1024 / 1024).toFixed(1)} MB`;
  }
}

export const storage = new StorageStore();
