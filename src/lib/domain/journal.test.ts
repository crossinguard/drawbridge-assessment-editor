import { describe, expect, it } from 'vitest';
import {
  appendEntry,
  blockedBy,
  newEntry,
  ownershipOrphans,
  planFlip,
  project,
  runBackTo,
  touchedIds,
  type Change,
  type JournalEntry,
  type JournalRecord
} from './journal';

/*
  The rules that decide whether an undo is safe. All of it is arithmetic over a list,
  which is the reason it lives in domain/ — the storage side is one read, and the part
  that is easy to get wrong is here.
*/

function record(id: string, updatedAt: string, extra: Record<string, unknown> = {}): JournalRecord {
  return { id, updatedAt, ...extra };
}

function change(
  id: string,
  before: JournalRecord | null,
  after: JournalRecord | null
): Change {
  return { type: 'item', id, before, after };
}

function entry(label: string, changes: Change[], state: 'applied' | 'reverted' = 'applied'): JournalEntry {
  return { ...newEntry({ vaultId: 'v1', label, changes }), state };
}

describe('touchedIds', () => {
  it('is the set of records an entry would put back', () => {
    const one = entry('Deleted an item', [
      change('a', record('a', '1'), null),
      change('b', record('b', '1'), record('b', '2'))
    ]);
    expect([...touchedIds(one)].sort()).toEqual(['a', 'b']);
  });
});

describe('blockedBy', () => {
  it('lets an entry nothing later touched be reverted on its own', () => {
    const first = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const second = entry('Edited an item', [change('b', record('b', '1'), record('b', '2'))]);

    expect(blockedBy(first, [first, second])).toEqual([]);
  });

  it('refuses when a later applied entry wrote the same record', () => {
    const first = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const second = entry('Edited an item', [change('a', record('a', '2'), record('a', '3'))]);

    // Storage holds what `second` left. Putting `first`'s before-image back would
    // silently throw that away, so the single-entry revert is refused and the run is
    // offered instead.
    expect(blockedBy(first, [first, second])).toEqual([second]);
  });

  it('ignores a later entry that has already been reverted', () => {
    const first = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const second = entry('Edited an item', [change('a', record('a', '2'), record('a', '3'))], 'reverted');

    // Reverted means storage no longer reflects it, so it is not in the way.
    expect(blockedBy(first, [first, second])).toEqual([]);
  });

  it('ignores an EARLIER entry on the same record', () => {
    const first = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const second = entry('Edited an item', [change('a', record('a', '2'), record('a', '3'))]);

    expect(blockedBy(second, [first, second])).toEqual([]);
  });
});

describe('runBackTo', () => {
  it('is everything still applied, newest first', () => {
    const one = entry('One', [change('a', null, record('a', '1'))]);
    const two = entry('Two', [change('b', null, record('b', '1'))]);
    const three = entry('Three', [change('c', null, record('c', '1'))]);

    expect(runBackTo(one, [one, two, three]).map((e) => e.label)).toEqual([
      'Three',
      'Two',
      'One'
    ]);
  });

  it('skips entries already reverted rather than reverting them twice', () => {
    const one = entry('One', [change('a', null, record('a', '1'))]);
    const two = entry('Two', [change('b', null, record('b', '1'))], 'reverted');
    const three = entry('Three', [change('c', null, record('c', '1'))]);

    expect(runBackTo(one, [one, two, three]).map((e) => e.label)).toEqual(['Three', 'One']);
  });
});

describe('planFlip', () => {
  it('reverts an applied entry back to its before-image', () => {
    const one = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const [step] = planFlip([one]);

    expect(step?.expect?.updatedAt).toBe('2');
    expect(step?.write?.updatedAt).toBe('1');
  });

  it('reapplies a reverted one in the other direction', () => {
    const one = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))], 'reverted');
    const [step] = planFlip([one]);

    // Same entry, same changes, opposite sides. This is the whole of redo — there is
    // no second stack anywhere.
    expect(step?.expect?.updatedAt).toBe('1');
    expect(step?.write?.updatedAt).toBe('2');
  });
});

describe('project', () => {
  const stored = (...records: JournalRecord[]) =>
    new Map<string, JournalRecord | null>(records.map((r) => [r.id, r]));

  it('passes when storage still holds what the entry left behind', () => {
    const one = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const { conflicts } = project(planFlip([one]), stored(record('a', '2')));
    expect(conflicts).toEqual([]);
  });

  it('refuses when the record has moved on since', () => {
    const one = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    // Something wrote at '9' — another tab, an import, a store that skipped the
    // journal. Whatever it was, the entry's before-image is no longer an undo.
    const { conflicts } = project(planFlip([one]), stored(record('a', '9')));
    expect(conflicts).toHaveLength(1);
  });

  it('refuses when the record it wants to restore is somehow already back', () => {
    const one = entry('Deleted an item', [change('a', record('a', '1'), null)]);
    const { conflicts } = project(planFlip([one]), stored(record('a', '5')));
    expect(conflicts).toHaveLength(1);
  });

  it('checks a run against what the run itself will have done', () => {
    /*
      The reason this function projects rather than comparing everything to storage
      up front. Both entries wrote record `a`; storage holds the newer one. Undoing
      the newer first leaves `a` at '2', which is exactly what the older one expects
      — so the run is fine even though the older entry disagrees with storage as it
      stands right now.
    */
    const older = entry('Edited an item', [change('a', record('a', '1'), record('a', '2'))]);
    const newer = entry('Edited an item', [change('a', record('a', '2'), record('a', '3'))]);

    const plan = planFlip(runBackTo(older, [older, newer]));
    const { conflicts, final } = project(plan, stored(record('a', '3')));

    expect(conflicts).toEqual([]);
    expect(final.get('a')?.updatedAt).toBe('1');
  });

  it('reports what the run would leave deleted', () => {
    const one = entry('Added an item', [change('a', null, record('a', '1'))]);
    const { final } = project(planFlip([one]), stored(record('a', '1')));

    expect(final.get('a')).toBeNull();
  });
});

describe('ownershipOrphans', () => {
  it('finds a record whose owner is about to go', () => {
    // Undoing "Added a collection" after questions were written into it.
    const orphans = ownershipOrphans(new Set(['c1']), [
      { id: 'i1', ownerId: 'c1' },
      { id: 'i2', ownerId: 'c2' }
    ]);
    expect(orphans).toEqual(['i1']);
  });

  it('does not count a record the same flip is deleting', () => {
    // "Undo everything back to here" removes the questions first, then the collection
    // they were in. That is the offer this refusal exists to make, so it must not
    // refuse it.
    const orphans = ownershipOrphans(new Set(['c1', 'i1']), [{ id: 'i1', ownerId: 'c1' }]);
    expect(orphans).toEqual([]);
  });

  it('leaves a top-level record alone', () => {
    const orphans = ownershipOrphans(new Set(['o1']), [{ id: 'o2', ownerId: null }]);
    expect(orphans).toEqual([]);
  });
});

describe('appendEntry', () => {
  it('drops the oldest once the cap is reached', () => {
    let entries: JournalEntry[] = [];
    for (let index = 0; index < 5; index += 1) {
      entries = appendEntry(entries, entry(`#${index}`, []), 3);
    }
    expect(entries.map((e) => e.label)).toEqual(['#2', '#3', '#4']);
  });
});
