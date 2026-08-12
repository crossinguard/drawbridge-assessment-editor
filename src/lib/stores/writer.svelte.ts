import { repository } from '$lib/repo';
import type { EntityType } from '$lib/domain/validate';
import type { Collection, Item, Outcome, Rubric, Vault } from '$lib/domain/schema';

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
   * They route through here for REPORTING only; the journal will skip them, and it is
   * better for undo to say "this cannot be undone" than to offer it and be wrong.
   */
  journal?: boolean;
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
    await this.run(intent, () => tableFor(type).put(entity));
  }

  /** Same as `put`, in one transaction. */
  async putMany<K extends EntityType>(
    type: K,
    entities: readonly EntityFor[K][],
    intent: WriteIntent
  ): Promise<void> {
    if (entities.length === 0) return;
    await this.run(intent, () => tableFor(type).putMany(entities));
  }

  /** Merges a patch and stamps `updatedAt`. Cannot REMOVE a field — see CLAUDE.md. */
  async update<K extends EntityType>(
    type: K,
    id: string,
    patch: Partial<EntityFor[K]>,
    intent: WriteIntent
  ): Promise<void> {
    await this.run(intent, () => tableFor(type).update(id, patch));
  }

  async remove(type: EntityType, id: string, intent: WriteIntent): Promise<void> {
    await this.run(intent, () => tableFor(type).remove(id));
  }
}

export const writer = new Writer();
