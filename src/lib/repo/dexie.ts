import Dexie, { type Table } from 'dexie';
import { nowIso } from '$lib/domain/ids';
import { remapSnapshotIds } from '$lib/domain/remap';
import {
  VaultSnapshotSchema,
  type Collection,
  type Item,
  type Outcome,
  type Rubric,
  type Vault,
  type VaultSnapshot
} from '$lib/domain/schema';
import type { Crud, ImportMode, ImportResult, Repository } from './types';

/*
  The IndexedDB adapter. The only file in the app that imports Dexie, enforced by
  src/lib/architecture.test.ts.

  Note what is NOT stored here: a `group` item's parts. They live inside the parent
  row's `parts` array, so the `items` table holds top-level items only. That keeps a
  group's ordering in exactly one place; the alternative — parts as sibling rows with a
  parentId — would let the row order and the array order disagree, and one of them
  would be silently wrong.
*/

const DB_NAME = 'drawbridge';

class DrawbridgeDb extends Dexie {
  vaults!: Table<Vault, string>;
  outcomes!: Table<Outcome, string>;
  collections!: Table<Collection, string>;
  items!: Table<Item, string>;
  rubrics!: Table<Rubric, string>;

  constructor(name: string) {
    super(name);
    /*
      Only indexed fields are listed; Dexie stores the whole object regardless. Adding
      an optional field needs no version bump — default it in the schema instead.
      Changing an INDEX does: bump the version and add an upgrade step.
    */
    this.version(1).stores({
      vaults: 'id, code',
      outcomes: 'id, vaultId, [vaultId+parentId]',
      collections: 'id, vaultId, kind',
      items: 'id, collectionId, sectionId',
      rubrics: 'id, vaultId'
    });
  }
}

/** Stable ordering for everything that leaves the database. */
function byId<T extends { id: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function makeCrud<T extends { id: string; updatedAt: string }>(
  table: () => Table<T, string>
): Crud<T> {
  return {
    async get(id) {
      return table().get(id);
    },
    async list() {
      return byId(await table().toArray());
    },
    async put(entity) {
      // Verbatim, timestamps included — see the note on Crud.put in types.ts.
      await table().put(entity);
      return entity;
    },
    async putMany(entities) {
      await table().bulkPut(entities as T[]);
    },
    async update(id, patch) {
      const existing = await table().get(id);
      if (!existing) throw new Error(`Cannot update ${id}: it does not exist.`);
      // `id` is reasserted after the spread so a stray id in a patch cannot silently
      // move a record to a different key and orphan everything pointing at it.
      const next = { ...existing, ...patch, id, updatedAt: nowIso() };
      await table().put(next);
      return next;
    },
    async remove(id) {
      await table().delete(id);
    }
  };
}

export class DexieRepository implements Repository {
  private readonly db: DrawbridgeDb;

  constructor(name: string = DB_NAME) {
    this.db = new DrawbridgeDb(name);
  }

  readonly vaults: Crud<Vault> = makeCrud<Vault>(() => this.db.vaults);

  readonly outcomes: Crud<Outcome> & { listByVault(vaultId: string): Promise<Outcome[]> } = {
    ...makeCrud<Outcome>(() => this.db.outcomes),
    listByVault: async (vaultId) =>
      byId(await this.db.outcomes.where('vaultId').equals(vaultId).toArray())
  };

  readonly collections: Crud<Collection> & {
    listByVault(vaultId: string): Promise<Collection[]>;
  } = {
    ...makeCrud<Collection>(() => this.db.collections),
    listByVault: async (vaultId) =>
      byId(await this.db.collections.where('vaultId').equals(vaultId).toArray()),
    // Deleting a collection takes its items with it. Leaving them would strand rows
    // that nothing can ever reach again, since items are only ever listed by collection.
    remove: async (id) => {
      await this.db.transaction('rw', this.db.collections, this.db.items, async () => {
        await this.db.items.where('collectionId').equals(id).delete();
        await this.db.collections.delete(id);
      });
    }
  };

  readonly items: Crud<Item> & { listByCollection(collectionId: string): Promise<Item[]> } = {
    ...makeCrud<Item>(() => this.db.items),
    listByCollection: async (collectionId) =>
      byId(await this.db.items.where('collectionId').equals(collectionId).toArray())
  };

  readonly rubrics: Crud<Rubric> & { listByVault(vaultId: string): Promise<Rubric[]> } = {
    ...makeCrud<Rubric>(() => this.db.rubrics),
    listByVault: async (vaultId) =>
      byId(await this.db.rubrics.where('vaultId').equals(vaultId).toArray())
  };

  async exportVault(vaultId: string): Promise<VaultSnapshot> {
    const vault = await this.db.vaults.get(vaultId);
    if (!vault) throw new Error(`No vault with id ${vaultId}.`);

    const [outcomes, collections, rubrics] = await Promise.all([
      this.outcomes.listByVault(vaultId),
      this.collections.listByVault(vaultId),
      this.rubrics.listByVault(vaultId)
    ]);

    const items = byId(
      await this.db.items
        .where('collectionId')
        .anyOf(collections.map((collection) => collection.id))
        .toArray()
    );

    return { vault, outcomes, collections, items, rubrics };
  }

  async importVault(snapshot: VaultSnapshot, mode: ImportMode): Promise<ImportResult> {
    // Parsed defensively even though the caller is typed. By the time a snapshot
    // reaches here it may have come from a file on disk, and the schema is the only
    // thing standing between a corrupt bundle and the live database.
    const parsed = VaultSnapshotSchema.parse(snapshot);

    let working = parsed;
    let mergedIntoExisting = false;

    if (mode === 'new') {
      working = remapSnapshotIds(parsed).snapshot;
    } else {
      const existing =
        (await this.db.vaults.get(parsed.vault.id)) ??
        (await this.db.vaults.where('code').equals(parsed.vault.code).first());

      if (existing) {
        mergedIntoExisting = true;
        // Matched by code rather than id: re-point the incoming records at the vault
        // that is already here, or they would arrive as an orphaned second vault.
        if (existing.id !== parsed.vault.id) working = repointVault(parsed, existing.id);
      }
    }

    await this.db.transaction(
      'rw',
      this.db.vaults,
      this.db.outcomes,
      this.db.collections,
      this.db.items,
      this.db.rubrics,
      async () => {
        await this.db.vaults.put(working.vault);
        await this.db.outcomes.bulkPut(working.outcomes);
        await this.db.collections.bulkPut(working.collections);
        await this.db.items.bulkPut(working.items);
        await this.db.rubrics.bulkPut(working.rubrics);
      }
    );

    return {
      vaultId: working.vault.id,
      mode,
      mergedIntoExisting,
      counts: {
        outcomes: working.outcomes.length,
        collections: working.collections.length,
        items: working.items.length,
        rubrics: working.rubrics.length
      }
    };
  }

  async deleteVault(vaultId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.vaults,
      this.db.outcomes,
      this.db.collections,
      this.db.items,
      this.db.rubrics,
      async () => {
        const collections = await this.db.collections.where('vaultId').equals(vaultId).toArray();
        await this.db.items
          .where('collectionId')
          .anyOf(collections.map((collection) => collection.id))
          .delete();
        await this.db.collections.where('vaultId').equals(vaultId).delete();
        await this.db.outcomes.where('vaultId').equals(vaultId).delete();
        await this.db.rubrics.where('vaultId').equals(vaultId).delete();
        await this.db.vaults.delete(vaultId);
      }
    );
  }

  /** Closes the connection. Tests use it; the app does not need to. */
  close(): void {
    this.db.close();
  }

  /** Drops the whole database. Test-only, and the "start over" button one day. */
  async destroy(): Promise<void> {
    await this.db.delete();
  }
}

/** Rewrites only the vault id and the references to it, leaving all other ids alone. */
function repointVault(snapshot: VaultSnapshot, vaultId: string): VaultSnapshot {
  return {
    ...snapshot,
    vault: { ...snapshot.vault, id: vaultId },
    outcomes: snapshot.outcomes.map((outcome) => ({ ...outcome, vaultId })),
    collections: snapshot.collections.map((collection) => ({ ...collection, vaultId })),
    rubrics: snapshot.rubrics.map((rubric) => ({ ...rubric, vaultId }))
  };
}
