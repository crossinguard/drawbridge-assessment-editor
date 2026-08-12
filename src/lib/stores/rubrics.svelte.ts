import { repository } from '$lib/repo';
import { newRubric } from '$lib/domain/defaults';
import { nowIso } from '$lib/domain/ids';
import {
  applyLevels,
  newCriterion,
  newLevel,
  withoutLevel,
  type Dropped
} from '$lib/domain/rubrics';
import type { Level, Rubric } from '$lib/domain/schema';
import { Autosave } from './autosave.svelte';
import { plain } from './plain.svelte';
import { writer } from './writer.svelte';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  Rubrics in a vault, and the one open in the grid editor.

  Unlike items, rubrics are SHARED — a discussion participation rubric gets reused every
  week — so they belong to the vault and are referenced by id. Editing one changes every
  item pointing at it, which is the intended behaviour and worth remembering before
  "just tweaking" a level's points.
*/

class RubricsStore {
  items = $state<Rubric[]>([]);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);
  vaultId = $state('');

  open = $state<Rubric | null>(null);

  readonly saver = new Autosave<Rubric>(async (value) => {
    // No `report`: the saver marks its own outcome around this callback.
    await writer.put(
      'rubric',
      { ...value, updatedAt: nowIso() },
      { label: 'Edited a rubric', vaultId: this.vaultId }
    );
    const index = this.items.findIndex((rubric) => rubric.id === value.id);
    if (index >= 0) this.items[index] = { ...value };
  });

  /**
   * Every rubric in the vault by id, with the one being edited overlaid.
   *
   * The overlay matters: `items` holds what was last written, and a tail's points are
   * composed live, so between a keystroke and the debounce landing the map would
   * otherwise hand back a stale copy of the very rubric on screen. Callers pass this
   * straight to `rubricTotal` and `effectiveCriteria`.
   */
  get byId(): Map<string, Rubric> {
    const map = new Map(this.items.map((rubric) => [rubric.id, rubric]));
    if (this.open) map.set(this.open.id, this.open);
    return map;
  }

  async load(vaultId: string): Promise<void> {
    if (this.vaultId === vaultId && this.status === 'ready') return;

    this.status = 'loading';
    this.vaultId = vaultId;
    try {
      this.items = await repository.rubrics.listByVault(vaultId);
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  /** Reloads without blanking the screen. See the note in vaults.svelte.ts. */
  async refresh(): Promise<void> {
    this.items = await repository.rubrics.listByVault(this.vaultId);
  }

  async openRubric(rubricId: string): Promise<void> {
    if (this.open?.id === rubricId) return;
    const rubric = await repository.rubrics.get(rubricId);
    this.open = rubric ?? null;
    if (rubric) this.saver.accept(rubric);
  }

  queueSave(): void {
    if (!this.open) return;
    this.saver.queue(plain(this.open));
  }

  async flush(): Promise<void> {
    await this.saver.flush();
  }

  async create(input: { title: string; levels?: Level[] }): Promise<Rubric> {
    const rubric = newRubric({
      vaultId: this.vaultId,
      title: input.title,
      ...(input.levels ? { levels: input.levels } : {})
    });
    await writer.put('rubric', plain(rubric), {
      label: 'Added a rubric',
      vaultId: this.vaultId,
      report: this.saver
    });
    this.items = [...this.items, rubric];
    return rubric;
  }

  async remove(rubricId: string): Promise<void> {
    await writer.remove('rubric', rubricId, {
      label: 'Deleted a rubric',
      vaultId: this.vaultId,
      report: this.saver
    });
    this.items = this.items.filter((rubric) => rubric.id !== rubricId);
    if (this.open?.id === rubricId) {
      this.saver.cancel();
      this.open = null;
    }
  }

  // -------------------------------------------------------------------------
  // Grid structure
  //
  // All of these go through domain/rubrics.ts rather than editing arrays here,
  // because descriptors are keyed by level id and every level change is a chance
  // to blank the grid.
  // -------------------------------------------------------------------------

  /** Swaps in a new set of levels. Returns what had nowhere to go. */
  replaceLevels(levels: readonly Level[]): Dropped {
    if (!this.open) return { descriptors: 0, points: 0 };
    const { rubric, dropped } = applyLevels(plain(this.open), levels);
    this.open = rubric;
    this.queueSave();
    return dropped;
  }

  /** What a proposed level list would discard, without applying it. */
  wouldDrop(levels: readonly Level[]): Dropped {
    if (!this.open) return { descriptors: 0, points: 0 };
    return applyLevels(plain(this.open), levels).dropped;
  }

  addLevel(): void {
    if (!this.open) return;
    // Appended at the end, which is the low-scoring end by convention, and given the
    // lowest points so it does not silently become the new maximum.
    const lowest = Math.min(...this.open.levels.map((level) => level.points), 1);
    this.open.levels = [...this.open.levels, newLevel('', Math.max(lowest - 1, 0))];
    this.queueSave();
  }

  removeLevel(levelId: string): void {
    if (!this.open) return;
    this.open = withoutLevel(plain(this.open), levelId);
    this.queueSave();
  }

  moveLevel(levelId: string, delta: -1 | 1): void {
    if (!this.open) return;
    const levels = [...this.open.levels];
    const index = levels.findIndex((level) => level.id === levelId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= levels.length) return;

    const [moved] = levels.splice(index, 1);
    if (moved) levels.splice(target, 0, moved);
    // Reordering keeps ids, so descriptors follow their level. No remapping needed.
    this.open.levels = levels;
    this.queueSave();
  }

  addCriterion(): void {
    if (!this.open) return;
    this.open.criteria = [...this.open.criteria, newCriterion(this.open.criteria.length)];
    this.queueSave();
  }

  removeCriterion(criterionId: string): void {
    if (!this.open) return;
    this.open.criteria = this.open.criteria
      .filter((criterion) => criterion.id !== criterionId)
      .map((criterion, order) => ({ ...criterion, order }));
    this.queueSave();
  }

  moveCriterion(criterionId: string, delta: -1 | 1): void {
    if (!this.open) return;
    const criteria = [...this.open.criteria].sort((a, b) => a.order - b.order);
    const index = criteria.findIndex((criterion) => criterion.id === criterionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= criteria.length) return;

    const [moved] = criteria.splice(index, 1);
    if (moved) criteria.splice(target, 0, moved);
    this.open.criteria = criteria.map((criterion, order) => ({ ...criterion, order }));
    this.queueSave();
  }

  setDescriptor(criterionId: string, levelId: string, text: string): void {
    if (!this.open) return;
    const criterion = this.open.criteria.find((entry) => entry.id === criterionId);
    if (!criterion) return;
    criterion.descriptors[levelId] = text;
    this.queueSave();
  }

  /**
   * One cell's points. `undefined` DELETES the key rather than writing 0.
   *
   * Clearing the field means "worth whatever the column says"; 0 means "worth nothing
   * at this level", which a "Not evident" column legitimately wants. Writing 0 for a
   * cleared field would collapse the two and quietly pin the cell to zero — the same
   * distinction `points.ts` draws between `undeclared` and `explicit` on an item.
   *
   * Edits in place, like `setDescriptor`: replacing `open` wholesale on a keystroke
   * would rebuild every textarea in the grid and take the cursor with it.
   */
  setLevelPoints(criterionId: string, levelId: string, points: number | undefined): void {
    if (!this.open) return;
    const criterion = this.open.criteria.find((entry) => entry.id === criterionId);
    if (!criterion) return;
    if (points === undefined) delete criterion.levelPoints[levelId];
    else criterion.levelPoints[levelId] = points;
    this.queueSave();
  }

  // -------------------------------------------------------------------------
  // Shared tails
  //
  // Appending is a reference, not a copy: the criteria stay in the other rubric
  // and are composed at read time, so editing the tail updates every rubric
  // using it. Nothing here reaches into the appended record.
  // -------------------------------------------------------------------------

  appendRubric(rubricId: string): void {
    if (!this.open || rubricId === this.open.id) return;
    if (this.open.appends.includes(rubricId)) return;
    this.open.appends = [...this.open.appends, rubricId];
    this.queueSave();
  }

  removeAppend(rubricId: string): void {
    if (!this.open) return;
    this.open.appends = this.open.appends.filter((id) => id !== rubricId);
    this.queueSave();
  }

  close(): void {
    this.open = null;
    this.saver.cancel();
  }

  reset(): void {
    this.items = [];
    this.vaultId = '';
    this.status = 'idle';
    this.close();
  }
}

export const rubrics = new RubricsStore();
