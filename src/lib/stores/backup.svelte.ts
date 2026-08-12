import { repository } from '$lib/repo';
import type { VaultSnapshot } from '$lib/domain/schema';
import { readBundle, writeBundle, type FileProblem } from '$lib/export/bundle';
import { bundleFilename } from '$lib/export/format';
import { APP_VERSION, downloadBytes, readFileBytes } from '$lib/export/download';
import type { ImportMode } from '$lib/repo/types';
import { describe } from './vaults.svelte';
import { writer } from './writer.svelte';

/*
  Getting work out of the browser, and back in.

  Until this exists the app is a single point of failure with no recovery, which is why
  the build order puts it before more content types.
*/

/**
 * When each vault was last exported.
 *
 * localStorage, not the vault record. An "exportedAt" stored inside the vault would
 * travel inside the bundle, so restoring a backup would tell you that you had just
 * exported — which is precisely backwards. This is a property of this browser, and it
 * is fine for it to be lost: the nudge simply reappears.
 */
const LAST_EXPORT_KEY = 'drawbridge:last-export';

function readLastExports(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface ImportOutcome {
  vaultId: string | null;
  mode: ImportMode;
  mergedIntoExisting: boolean;
  counts: { outcomes: number; collections: number; items: number; rubrics: number } | null;
  problems: FileProblem[];
  /** Set when nothing could be imported at all. */
  fatal: string | null;
}

class BackupStore {
  lastExports = $state<Record<string, string>>({});
  busy = $state(false);
  error = $state<string | null>(null);

  load(): void {
    this.lastExports = readLastExports();
  }

  /** Whole numbers of days since the last export, or null if there has never been one. */
  daysSinceExport(vaultId: string): number | null {
    const at = this.lastExports[vaultId];
    if (!at) return null;
    const elapsed = Date.now() - new Date(at).getTime();
    return Math.floor(elapsed / 86_400_000);
  }

  #recordExport(vaultId: string): void {
    const next = { ...readLastExports(), [vaultId]: new Date().toISOString() };
    this.lastExports = next;
    try {
      localStorage.setItem(LAST_EXPORT_KEY, JSON.stringify(next));
    } catch {
      // A locked-down profile may refuse localStorage. The export still happened; the
      // nudge just will not know about it.
    }
  }

  async exportVault(vaultId: string): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      const snapshot = await repository.exportVault(vaultId);
      const bytes = writeBundle(snapshot, { appVersion: APP_VERSION });
      downloadBytes(bytes, bundleFilename(snapshot.vault.code));
      this.#recordExport(vaultId);
    } catch (cause) {
      this.error = describe(cause);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Exports one collection, with the vault and outcomes it needs to make sense.
   *
   * Marked `partial` in the manifest, and NOT counted as a backup — someone who sends
   * a colleague one quiz has not protected the rest of their term's work, and the
   * nudge should keep saying so.
   */
  async exportCollection(vaultId: string, collectionId: string): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      const full = await repository.exportVault(vaultId);
      const collection = full.collections.find((entry) => entry.id === collectionId);
      if (!collection) throw new Error('That collection is no longer here.');

      const slice: VaultSnapshot = {
        ...full,
        collections: [collection],
        items: full.items.filter((item) => item.collectionId === collectionId)
      };
      const bytes = writeBundle(slice, { appVersion: APP_VERSION, partial: true });
      downloadBytes(bytes, bundleFilename(`${full.vault.code}-${collection.title}`));
    } catch (cause) {
      this.error = describe(cause);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Loads the worked example as a new course.
   *
   * Goes through `importVault(_, 'new')` rather than writing the records itself, so it
   * inherits the id remapping and the counts that the round-trip tests already cover —
   * and so loading it twice gives two independent courses rather than a collision.
   *
   * The module is imported dynamically because it is ~15KB of prose that most sessions
   * never ask for, and it has no business in the initial bundle.
   */
  async loadSample(): Promise<ImportOutcome> {
    this.busy = true;
    this.error = null;
    try {
      const { sampleSnapshot } = await import('$lib/domain/sample');
      const snapshot = sampleSnapshot();
      const imported = await writer.run(
        { label: 'Loaded the sample course', vaultId: snapshot.vault.id, journal: false },
        () => repository.importVault(snapshot, 'new')
      );
      return {
        vaultId: imported.vaultId,
        mode: 'new',
        mergedIntoExisting: false,
        counts: imported.counts,
        problems: [],
        fatal: null
      };
    } catch (cause) {
      return {
        vaultId: null,
        mode: 'new',
        mergedIntoExisting: false,
        counts: null,
        problems: [],
        fatal: describe(cause)
      };
    } finally {
      this.busy = false;
    }
  }

  async importFile(file: File, mode: ImportMode): Promise<ImportOutcome> {
    this.busy = true;
    this.error = null;
    try {
      const result = readBundle(await readFileBytes(file));

      if (!result.snapshot) {
        /*
          Say what actually went wrong. A zip that will not open and a zip whose
          vault.json is missing are different problems with different fixes — "try
          downloading it again" versus "this is not a whole bundle" — and telling
          someone the wrong one while they are trying to recover their work is the
          worst moment to be vague.
        */
        const unreadableArchive = result.problems.some(
          (problem) => problem.file === '(archive)'
        );
        return {
          vaultId: null,
          mode,
          mergedIntoExisting: false,
          counts: null,
          problems: result.problems,
          fatal: unreadableArchive
            ? 'This file could not be opened as a zip. It may have been damaged in transit — try downloading or copying it again.'
            : 'This bundle has no course record in it, so there is nothing to import.'
        };
      }

      /*
        Through the funnel with `journal: false` and no `report`.

        An import writes every table at once, so there is no cheap before-image for undo
        to hold — the same reason deleting a course is unjournalable. And it does its own
        reporting: every failure below becomes `fatal` on the returned outcome, which the
        import panel renders in place. Passing a reporter as well would say it twice.
      */
      const imported = await writer.run(
        { label: 'Imported a bundle', vaultId: result.snapshot.vault.id, journal: false },
        () => repository.importVault(result.snapshot!, mode)
      );
      return {
        vaultId: imported.vaultId,
        mode,
        mergedIntoExisting: imported.mergedIntoExisting,
        counts: imported.counts,
        problems: result.problems,
        fatal: null
      };
    } catch (cause) {
      return {
        vaultId: null,
        mode,
        mergedIntoExisting: false,
        counts: null,
        problems: [],
        fatal: describe(cause)
      };
    } finally {
      this.busy = false;
    }
  }
}

export const backup = new BackupStore();
