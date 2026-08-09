import { DexieRepository } from './dexie';
import type { Repository } from './types';

/*
  The composition root.

  This is the single place that decides which adapter the app runs on. Everything
  above imports `repository` and sees only the `Repository` interface, so the Tauri
  build swaps a filesystem adapter in here and nothing else changes.

  Typed as `Repository`, not `DexieRepository`, on purpose — that is what stops a
  caller reaching for `close()` or `destroy()` and quietly coupling the UI to Dexie.
*/
export const repository: Repository = new DexieRepository();

export type { Crud, ImportMode, ImportResult, Repository } from './types';
export { requestPersistence, storageEstimate, type StorageStatus } from './persistence';
