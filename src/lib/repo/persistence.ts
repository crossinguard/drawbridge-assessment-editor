/*
  Storage permanence.

  This app holds the only copy of a term's work. A browser is allowed to evict
  IndexedDB for a "best effort" origin whenever it feels short of disk, and the user
  gets no warning when it does. `navigator.storage.persist()` asks to be exempt.

  The answer is reported honestly rather than assumed — Firefox prompts, Chrome grants
  or denies silently on heuristics, and a locked-down work profile may refuse outright.
  The UI's job is to say which of those happened and to make export obvious when the
  answer is no. Never tell the user their data is safe when this returned false.
*/

export interface StorageStatus {
  /** Whether the API exists at all. False in Node, and in some restricted profiles. */
  supported: boolean;
  /** True only when the browser has actually granted exemption from eviction. */
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

/**
 * Asks for persistent storage and reports what happened.
 *
 * Safe to call repeatedly: if permission was already granted this returns the existing
 * state without re-prompting. Never throws — a storage question must not be able to
 * take down app startup.
 */
export async function requestPersistence(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false };
  }

  try {
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const persisted =
      already || (navigator.storage.persist ? await navigator.storage.persist() : false);

    let usageBytes: number | undefined;
    let quotaBytes: number | undefined;
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      usageBytes = estimate.usage;
      quotaBytes = estimate.quota;
    }

    return {
      supported: true,
      persisted,
      ...(usageBytes === undefined ? {} : { usageBytes }),
      ...(quotaBytes === undefined ? {} : { quotaBytes })
    };
  } catch {
    return { supported: true, persisted: false };
  }
}

/** Current usage without asking for anything. For the settings screen. */
export async function storageEstimate(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false };
  }

  try {
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    return {
      supported: true,
      persisted,
      ...(estimate.usage === undefined ? {} : { usageBytes: estimate.usage }),
      ...(estimate.quota === undefined ? {} : { quotaBytes: estimate.quota })
    };
  } catch {
    return { supported: true, persisted: false };
  }
}
