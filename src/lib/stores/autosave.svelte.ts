/*
  Debounced autosave with an honest indicator.

  There is no save button anywhere in this app, which means the indicator is the only
  thing telling the user whether a term's work actually reached disk. It must never
  claim "Saved" optimistically — `saved` is set after the write resolves, and a failure
  stays visible rather than fading.
*/

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export class Autosave<T> {
  status = $state<SaveStatus>('idle');
  error = $state<string | null>(null);
  lastSavedAt = $state<Date | null>(null);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #queued: T | null = null;
  /*
    A JSON copy of what is already stored. Two jobs: it suppresses the save that would
    otherwise fire the instant a record loads and an effect first reads it, and it
    stops an edit-then-undo cycle writing a value identical to the one on disk.
  */
  #baseline: string | null = null;

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly delayMs = 600
  ) {}

  /** Marks `value` as already stored, without writing it. Call after a load. */
  accept(value: T): void {
    this.#baseline = JSON.stringify(value);
  }

  /**
   * Queues a write. `value` must already be a plain object — see `plain()` in
   * stores/plain.svelte.ts. Passing a `$state` proxy here would throw inside the adapter.
   *
   * **Queue the content you want written, never a handle to it.** The no-op check below
   * compares the queued value against what was last stored, so a value that does not
   * change when the underlying record does — a list of dirty ids, say — makes every
   * edit after the first look like a no-op and silently drops it. That is a data-loss
   * bug with no error and no indicator change; `autosave.test.ts` pins it.
   */
  queue(value: T): void {
    if (JSON.stringify(value) === this.#baseline) {
      /*
        Back to what is already stored. Returning without cancelling would leave the
        SUPERSEDED value sitting in the queue, and the timer would then write it — so
        typing something and undoing it saved the thing you undid. Dropping the pending
        write is the whole point of recognising a revert.
      */
      this.cancel();
      return;
    }

    this.#queued = value;
    this.status = 'pending';
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /**
   * Drops anything queued without writing it.
   *
   * Needed whenever the thing the queued value describes has stopped being true —
   * the record was deleted, or the edit was reverted. Without it a pending write can
   * resurrect a deleted record or re-apply an undone change.
   */
  cancel(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#queued = null;
    if (this.status === 'pending') this.status = 'idle';
  }

  /** Writes anything outstanding now. Used when leaving a screen or closing the tab. */
  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const value = this.#queued;
    if (value === null) return;
    this.#queued = null;

    this.status = 'saving';
    try {
      await this.write(value);
      this.#baseline = JSON.stringify(value);
      this.lastSavedAt = new Date();
      this.error = null;
      // A later edit may have queued while this write was in flight; do not report
      // "saved" over the top of it, or the indicator lies about the newer change.
      this.status = this.#queued === null ? 'saved' : 'pending';
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
      this.status = 'error';
    }
  }

  /*
    Structural edits — moving a row, deleting a branch — write immediately rather than
    through the debounce, because they touch several records at once and a half-applied
    write would leave a shape that never existed. They still have to be reportable, or
    the indicator says "No changes" straight after the user moved something, and says
    nothing at all when the write failed.
  */

  /** Records a write that happened outside the debounce path. */
  markSaved(): void {
    this.lastSavedAt = new Date();
    this.error = null;
    // Never overwrite work that is still outstanding; that would be the indicator
    // reporting "Saved" over the top of an edit that has not been written yet.
    if (this.status !== 'pending' && this.status !== 'saving') this.status = 'saved';
  }

  markFailed(cause: unknown): void {
    this.error = cause instanceof Error ? cause.message : String(cause);
    this.status = 'error';
  }

  get hasUnsavedWork(): boolean {
    return this.#queued !== null || this.status === 'saving' || this.status === 'error';
  }
}
