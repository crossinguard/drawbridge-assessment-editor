import { repository } from '$lib/repo';
import type { EntityType } from '$lib/domain/validate';
import type { Change, JournalRecord } from '$lib/domain/journal';
import type { Collection, Item, Outcome, Rubric, Vault } from '$lib/domain/schema';
import { journal } from './journal.svelte';

/*
  Every write to storage, through one place.

  Before this there were three write paths and eight stores importing `repository`
  directly. Two of them had private funnels that got it right — `outcomes.#persistOrder`
  and `items.#write`, both wrapping the call and reporting the outcome — surrounded by
  seven methods that did not. `collections.create` failing showed the user nothing at
  all: no indicator moved, no message appeared, and the new collection simply was not
  there.

  So the point of this file is not tidiness. It is that a write which fails has exactly
  one place left to be silent, and that place is watched.

  Two things stay OUTSIDE the funnel on purpose:

  - `plain()` stays at the call site. It converts a `$state` proxy to a plain object,
    and whether a given value is a proxy is something only the caller knows. Doing it
    here would mean walking every value defensively on every write.
  - `put` and `update` stay separate methods rather than collapsing into one. `put`
    writes verbatim, which is what makes a restored bundle deep-equal what was exported;
    `update` merges and stamps `updatedAt`. They are different operations with different
    guarantees — see the repository invariants in CLAUDE.md.
*/

/** What a write reports to. `Autosave` satisfies this structurally. */
export interface WriteReporter {
  markSaved(): void;
  markFailed(cause: unknown): void;
}

/**
 * A reporter for a store that has no debounced editing to need an `Autosave`.
 *
 * The vault list is the case: creating, renaming and deleting a course are immediate
 * writes with nothing to debounce, so there was no saver for them to report to and a
 * failure went nowhere at all. The shape matches what `SaveIndicator` reads, so a screen
 * can render it the same way — though the home screen shows only the error, because
 * "Saved" after every rename is noise on a list you are not editing.
 */
export class WriteStatus implements WriteReporter {
  status = $state<'idle' | 'saved' | 'error'>('idle');
  error = $state<string | null>(null);

  markSaved(): void {
    this.status = 'saved';
    this.error = null;
  }

  markFailed(cause: unknown): void {
    this.status = 'error';
    this.error = cause instanceof Error ? cause.message : String(cause);
  }

  clear(): void {
    this.status = 'idle';
    this.error = null;
  }
}

export interface WriteIntent {
  /**
   * What the user did, in their words: "Renamed the course", "Deleted an item".
   *
   * Nothing displays this yet. It is here because stage 22's journal needs a label per
   * write, and retrofitting one onto forty call sites later is how labels end up being
   * `'update'` and `'put'`.
   */
  label: string;
  /** Which course this belongs to, so the journal can be scoped to one. */
  vaultId: string;
  /**
   * The saver that should report this write. Omit only where nothing is watching —
   * and prefer passing one, because "nothing is watching" is the state this file
   * exists to eliminate.
   */
  report?: WriteReporter;
  /**
   * False for writes that cannot be undone.
   *
   * Deleting a course and importing a bundle both touch an unbounded number of records
   * across every table, so capturing a before-image costs as much as the write itself.
   * They route through here for REPORTING only; the journal skips them, and it is
   * better for undo to say "this cannot be undone" than to offer it and be wrong.
   */
  journal?: boolean;
  /**
   * Where this write's before and after images land.
   *
   * Omit and the write becomes a journal entry of its own. Pass an array shared by
   * several writes and they become ONE entry, recorded by the caller once the whole
   * operation has succeeded. Deleting an item is a removal AND a renumber of its
   * siblings: as two entries, undoing the first would put the question back among
   * siblings still numbered as though it had gone.
   *
   * Only the handful of store methods that write more than once per user action need
   * this. Forgetting it costs an extra row in the change list, not correctness.
   */
  into?: Change[];
}

/*
  The entity type is `EntityType` from `validate.ts` rather than a table-name union of
  its own. The two would say the same thing, and `review.linkFor` already maps this one
  to the screen that can fix a given record — which is exactly what the journal needs to
  make an undone change navigable, for free.
*/
interface EntityFor {
  vault: Vault;
  outcome: Outcome;
  collection: Collection;
  item: Item;
  rubric: Rubric;
}

/** Minimal shape the funnel needs; every table satisfies it. */
interface Table {
  get(id: string): Promise<unknown>;
  put(entity: unknown): Promise<unknown>;
  putMany(entities: readonly unknown[]): Promise<void>;
  update(id: string, patch: unknown): Promise<unknown>;
  remove(id: string): Promise<void>;
}

const TABLES: Record<EntityType, () => unknown> = {
  vault: () => repository.vaults,
  outcome: () => repository.outcomes,
  collection: () => repository.collections,
  item: () => repository.items,
  rubric: () => repository.rubrics
};

/**
 * THE cast. One, here, and nowhere else.
 *
 * Each table is a `Crud` of a different entity, and the methods below are generic over
 * which — a relationship TypeScript cannot express through an index into a heterogeneous
 * map. The public signatures are what keep it honest: `put('item', …)` will not accept
 * an `Outcome`, so the only way to reach this cast with a mismatched pair is to defeat
 * the signature deliberately.
 */
function tableFor(type: EntityType): Table {
  return TABLES[type]() as Table;
}

/**
 * A stored record as the journal holds it, or `null` for anything that is not one.
 *
 * Every entity has an `id` and an `updatedAt` and the journal reads nothing else, so
 * this is a shape check rather than a parse — and it must not be more than that.
 * Validating here would put something that can throw on unexpected input in front of
 * a write, and a before-image that could not be taken is not a reason to refuse a save.
 */
function toRecord(value: unknown): JournalRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['id'] === 'string' && typeof candidate['updatedAt'] === 'string'
    ? (candidate as JournalRecord)
    : null;
}

class Writer {
  /**
   * Runs an operation and reports how it went.
   *
   * The general case, for work that is not a single-record write — deleting a course,
   * importing a bundle. Everything below is this plus a table call.
   *
   * Rethrows. A caller that needs to know — one navigating away on success, say — still
   * finds out; the funnel's job is that the *indicator* never misses it, not to swallow
   * failures on the caller's behalf.
   *
   * Never journalled, and cannot be: the operation is an opaque closure, so there is
   * nothing here to take a before-image OF. Everything that reaches this method
   * rewrites whole tables anyway, which is the same reason those call sites already
   * pass `journal: false`.
   */
  async run<T>(intent: WriteIntent, operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      intent.report?.markSaved();
      return result;
    } catch (cause) {
      intent.report?.markFailed(cause);
      throw cause;
    }
  }

  /** Writes verbatim, timestamps included. The faithful-restore path. */
  async put<K extends EntityType>(
    type: K,
    entity: EntityFor[K],
    intent: WriteIntent
  ): Promise<void> {
    const before = await this.#imageOf(intent, type, entity.id);
    await this.run(intent, () => tableFor(type).put(entity));
    this.#file(intent, [{ type, id: entity.id, before, after: toRecord(entity) }]);
  }

  /** Same as `put`, in one transaction. */
  async putMany<K extends EntityType>(
    type: K,
    entities: readonly EntityFor[K][],
    intent: WriteIntent
  ): Promise<void> {
    if (entities.length === 0) return;

    const before = await Promise.all(
      entities.map((entity) => this.#imageOf(intent, type, entity.id))
    );
    await this.run(intent, () => tableFor(type).putMany(entities));
    this.#file(
      intent,
      entities.map((entity, index) => ({
        type,
        id: entity.id,
        before: before[index] ?? null,
        after: toRecord(entity)
      }))
    );
  }

  /** Merges a patch and stamps `updatedAt`. Cannot REMOVE a field — see CLAUDE.md. */
  async update<K extends EntityType>(
    type: K,
    id: string,
    patch: Partial<EntityFor[K]>,
    intent: WriteIntent
  ): Promise<void> {
    const before = await this.#imageOf(intent, type, id);
    // The after-image is what the table RETURNS, not what the caller passed. `update`
    // merges the patch over what was stored and stamps `updatedAt` itself, so the
    // patch alone is not a record and could never be restored from.
    const after = await this.run(intent, () => tableFor(type).update(id, patch));
    this.#file(intent, [{ type, id, before, after: toRecord(after) }]);
  }

  async remove(type: EntityType, id: string, intent: WriteIntent): Promise<void> {
    const changes = await this.#removalImages(intent, type, id);
    await this.run(intent, () => tableFor(type).remove(id));
    this.#file(intent, changes);
  }

  /**
   * Writes a record back exactly as it was. The undo path, and only that.
   *
   * Deliberately separate from `put` even though it does the same thing: this one
   * takes a `JournalRecord`, whose entity type was erased when the funnel stored it,
   * so the pairing of type and record is only as trustworthy as the capture that made
   * it — which is in this same file, a few lines up. `put`'s signature stays strict.
   *
   * No cast is needed, because `Table` already speaks in `unknown`.
   */
  async restore(type: EntityType, record: JournalRecord, intent: WriteIntent): Promise<void> {
    await this.run(intent, () => tableFor(type).put(record));
  }

  // -------------------------------------------------------------------------
  // The journal
  //
  // Before-images are read from STORAGE, immediately before the write, and never
  // from the store's own copy. Several paths here mutate the in-memory record and
  // then write it — `setSection` and `setKind` both do — so by the time a write is
  // requested the store is already holding the after-image, and a journal built
  // from it would offer to restore the change it was meant to undo.
  // -------------------------------------------------------------------------

  async #imageOf(
    intent: WriteIntent,
    type: EntityType,
    id: string
  ): Promise<JournalRecord | null> {
    if (intent.journal === false) return null;
    return toRecord(await tableFor(type).get(id));
  }

  /**
   * What a removal is about to destroy, cascade included.
   *
   * `repository.collections.remove` deletes the collection's items in the same
   * transaction. A journal that recorded only the collection would restore it empty,
   * and every question in it would be gone with the change list still claiming the
   * delete had been undone — which is worse than not offering the undo at all.
   */
  async #removalImages(
    intent: WriteIntent,
    type: EntityType,
    id: string
  ): Promise<Change[]> {
    if (intent.journal === false) return [];

    const changes: Change[] = [];
    if (type === 'collection') {
      for (const item of await repository.items.listByCollection(id)) {
        const record = toRecord(item);
        if (record) changes.push({ type: 'item', id: item.id, before: record, after: null });
      }
    }

    const record = toRecord(await tableFor(type).get(id));
    if (record) changes.push({ type, id, before: record, after: null });
    return changes;
  }

  #file(intent: WriteIntent, changes: readonly Change[]): void {
    if (intent.journal === false || changes.length === 0) return;
    if (intent.into) intent.into.push(...changes);
    else journal.record(intent.label, intent.vaultId, changes);
  }
}

export const writer = new Writer();
