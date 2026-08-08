import type {
  Collection,
  Item,
  Outcome,
  Rubric,
  Vault,
  VaultSnapshot
} from '$lib/domain/schema';

/*
  The storage port.

  Everything above this line talks to `Repository` and nothing else. The Dexie adapter
  is the only implementation today; a filesystem adapter replaces it for the Tauri
  build, and if this interface is honest that swap touches nothing else in the app.

  That is the whole reason the port exists, so resist widening it with anything
  Dexie-shaped — no query objects, no live collections, no index names.
*/

export interface Crud<T> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;

  /**
   * Writes the entity exactly as given, creating or replacing.
   *
   * Deliberately does NOT touch `updatedAt`. Import needs to restore a record byte for
   * byte — a bundle that came back with rewritten timestamps would not deep-equal what
   * was exported, and "restore a backup" would quietly stop being a faithful operation.
   * Use `update` for ordinary edits.
   */
  put(entity: T): Promise<T>;

  /** Same as `put`, in one transaction. */
  putMany(entities: readonly T[]): Promise<void>;

  /** Merges `patch` into the stored entity and stamps `updatedAt`. The editing path. */
  update(id: string, patch: Partial<T>): Promise<T>;

  remove(id: string): Promise<void>;
}

export type ImportMode = 'new' | 'merge';

export interface ImportResult {
  vaultId: string;
  mode: ImportMode;
  /** True when `merge` found an existing vault rather than creating one. */
  mergedIntoExisting: boolean;
  counts: { outcomes: number; collections: number; items: number; rubrics: number };
}

export interface Repository {
  vaults: Crud<Vault>;
  outcomes: Crud<Outcome> & { listByVault(vaultId: string): Promise<Outcome[]> };
  collections: Crud<Collection> & { listByVault(vaultId: string): Promise<Collection[]> };
  /**
   * Top-level items only. A `group` item's parts live inside its `parts` array rather
   * than as rows of their own, so they are reached by walking the parent — see the note
   * on `ItemSchema`.
   */
  items: Crud<Item> & { listByCollection(collectionId: string): Promise<Item[]> };
  rubrics: Crud<Rubric> & { listByVault(vaultId: string): Promise<Rubric[]> };

  /** Everything belonging to one vault, as the unit of export and backup. */
  exportVault(vaultId: string): Promise<VaultSnapshot>;

  /**
   * `new` rewrites every id first, so importing the same bundle twice yields two
   * independent vaults instead of the second silently overwriting the first.
   * `merge` finds the existing vault by id, then by code, and writes over it by id.
   */
  importVault(snapshot: VaultSnapshot, mode: ImportMode): Promise<ImportResult>;

  /** Removes a vault and everything under it. */
  deleteVault(vaultId: string): Promise<void>;
}
