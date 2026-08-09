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
   * stores/plain.ts. Passing a `$state` proxy here would throw inside the adapter.
   */
  queue(value: T): void {
    if (JSON.stringify(value) === this.#baseline) return;

    this.#queued = value;
    this.status = 'pending';
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.delayMs);
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

  get hasUnsavedWork(): boolean {
    return this.#queued !== null || this.status === 'saving' || this.status === 'error';
  }
}
