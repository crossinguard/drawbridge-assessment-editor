import { describe, expect, it } from 'vitest';
import { Autosave } from './autosave.svelte';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recorder() {
  const writes: unknown[] = [];
  const save = new Autosave<unknown>(async (value) => {
    writes.push(structuredClone(value));
  }, 5);
  return { writes, save };
}

describe('Autosave', () => {
  it('writes a queued value after the debounce', async () => {
    const { writes, save } = recorder();
    save.queue({ text: 'hello' });
    expect(writes).toEqual([]);

    await tick(20);
    expect(writes).toEqual([{ text: 'hello' }]);
    expect(save.status).toBe('saved');
  });

  it('coalesces a burst of edits into one write of the last value', async () => {
    const { writes, save } = recorder();
    save.queue({ text: 'h' });
    save.queue({ text: 'he' });
    save.queue({ text: 'hel' });

    await tick(20);
    expect(writes).toEqual([{ text: 'hel' }]);
  });

  it('writes every DISTINCT value, not just the first', async () => {
    /*
      The regression this file exists for.

      The no-op check compares the queued value against what was last stored. A caller
      that queues something which does not vary with the record — a list of dirty ids —
      makes every edit after the first look identical and get dropped. It happened, in
      the outcomes store, and it lost typed text with no error raised and no change to
      the save indicator. Nothing else in the suite would have noticed.
    */
    const { writes, save } = recorder();

    save.queue({ text: 'first' });
    await tick(20);
    save.queue({ text: 'second' });
    await tick(20);
    save.queue({ text: 'third' });
    await tick(20);

    expect(writes).toEqual([{ text: 'first' }, { text: 'second' }, { text: 'third' }]);
  });

  it('skips a write that would store what is already stored', async () => {
    const { writes, save } = recorder();
    save.queue({ text: 'same' });
    await tick(20);
    save.queue({ text: 'same' });
    await tick(20);

    expect(writes).toHaveLength(1);
    expect(save.status).toBe('saved');
  });

  it('cancels a pending write when the value is reverted to what is stored', async () => {
    /*
      Recognising a revert is not enough on its own — the superseded value has to be
      dropped from the queue too. Without that, typing something and undoing it wrote
      the thing you undid, because the earlier queued value was still sitting there
      when the timer fired.
    */
    const { writes, save } = recorder();
    save.queue({ text: 'stored' });
    await tick(20);
    expect(writes).toEqual([{ text: 'stored' }]);

    save.queue({ text: 'a mistake' });
    save.queue({ text: 'stored' }); // undone before the debounce elapsed
    await tick(20);

    expect(writes).toEqual([{ text: 'stored' }]);
  });

  it('cancel drops queued work without writing it', async () => {
    const { writes, save } = recorder();
    save.queue({ text: 'about to be deleted' });
    save.cancel();
    await tick(20);

    expect(writes).toEqual([]);
    expect(save.status).toBe('idle');
  });

  it('does not write a value accepted as the baseline', async () => {
    // What stops a freshly loaded record being written straight back, bumping
    // updatedAt and reporting "Saved" when the user has done nothing.
    const { writes, save } = recorder();
    save.accept({ text: 'loaded from storage' });
    save.queue({ text: 'loaded from storage' });

    await tick(20);
    expect(writes).toEqual([]);
    expect(save.status).toBe('idle');
  });

  it('reports a failure and keeps it visible', async () => {
    const save = new Autosave<unknown>(async () => {
      throw new Error('quota exceeded');
    }, 5);

    save.queue({ text: 'doomed' });
    await tick(20);

    expect(save.status).toBe('error');
    expect(save.error).toBe('quota exceeded');
    // An error that cleared itself would be worse than no indicator at all.
    await tick(30);
    expect(save.status).toBe('error');
  });

  it('re-queues rather than reporting saved when an edit lands mid-write', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const writes: unknown[] = [];

    const save = new Autosave<unknown>(async (value) => {
      writes.push(value);
      if (writes.length === 1) await gate;
    }, 5);

    save.queue({ text: 'one' });
    await tick(20);
    expect(save.status).toBe('saving');

    // Edit arrives while the first write is still in flight.
    save.queue({ text: 'two' });
    release?.();
    await tick(20);

    // It must not claim "saved" over the top of the newer edit.
    expect(writes).toEqual([{ text: 'one' }, { text: 'two' }]);
    expect(save.status).toBe('saved');
  });

  it('flush writes immediately without waiting for the timer', async () => {
    const { writes, save } = recorder();
    const slow = new Autosave<unknown>(async (v) => {
      writes.push(v);
    }, 10_000);

    slow.queue({ text: 'leaving the page' });
    await slow.flush();
    expect(writes).toEqual([{ text: 'leaving the page' }]);
  });

  it('markSaved reports a write that bypassed the debounce', async () => {
    // Structural edits write immediately; without this the indicator would read
    // "No changes" straight after the user moved a row.
    const { save } = recorder();
    expect(save.status).toBe('idle');
    save.markSaved();
    expect(save.status).toBe('saved');
  });

  it('markSaved does not paper over work that is still outstanding', async () => {
    const { save } = recorder();
    save.queue({ text: 'pending' });
    expect(save.status).toBe('pending');
    save.markSaved();
    expect(save.status).toBe('pending');
    await tick(20);
  });

  it('markFailed surfaces a structural write that did not land', () => {
    const { save } = recorder();
    save.markFailed(new Error('disk gone'));
    expect(save.status).toBe('error');
    expect(save.error).toBe('disk gone');
  });
});

describe('Autosave timing', () => {
  it('restarts the debounce on each edit rather than firing on a fixed schedule', async () => {
    const writes: unknown[] = [];
    const save = new Autosave<unknown>(async (v) => {
      writes.push(v);
    }, 30);

    save.queue({ n: 1 });
    await tick(20);
    save.queue({ n: 2 });
    await tick(20);
    expect(writes).toEqual([]);

    await tick(30);
    expect(writes).toEqual([{ n: 2 }]);
  });
});

describe('flushing everything at once', () => {
  /*
    What stands between "a new version is ready" and losing the sentence somebody was
    part-way through typing. Applying a service worker update reloads the tab, so the
    PWA store writes out every live saver first rather than trusting the `pagehide`
    handlers, which browsers are not obliged to let finish.
  */
  it('writes out savers that are still inside their debounce', async () => {
    const first = recorder();
    const second = recorder();

    first.save.queue({ where: 'outcomes' });
    second.save.queue({ where: 'items' });
    expect(first.writes).toEqual([]);
    expect(second.writes).toEqual([]);

    await Autosave.flushAll();

    expect(first.writes).toEqual([{ where: 'outcomes' }]);
    expect(second.writes).toEqual([{ where: 'items' }]);
  });

  it('resolves only once the writes have actually landed', async () => {
    // Awaiting something that resolves before the write does would make the whole
    // guarantee decorative.
    const writes: unknown[] = [];
    const slow = new Autosave<unknown>(async (value) => {
      await tick(20);
      writes.push(value);
    }, 5);

    slow.queue({ n: 1 });
    await Autosave.flushAll();
    expect(writes).toEqual([{ n: 1 }]);
  });

  it('reports outstanding work across every saver', () => {
    const { save } = recorder();
    save.queue({ n: 1 });
    expect(Autosave.anyUnsavedWork).toBe(true);
    save.cancel();
  });
});
