<script lang="ts">
  import { page } from '$app/state';
  import { blockedBy, runBackTo, type JournalEntry } from '$lib/domain/journal';
  import { journal } from '$lib/stores/journal.svelte';
  import { undo } from '$lib/stores/undo.svelte';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { count } from '$lib/text';
  import Button from '$lib/components/ui/Button.svelte';

  /*
    The session change list.

    Everything on this screen is derived from `journal.entries`, which is memory only —
    so this page is empty after a reload, by design, and says so rather than looking
    broken. See the note at the top of stores/journal.svelte.ts for why it is not a
    sixth table.
  */

  const vaultId = $derived(page.params.vaultId ?? '');
  const vault = $derived(activeVault.draft);
  const entries = $derived(journal.forVault(vaultId));

  /*
    Blocking is decided here rather than on click, because the answer is pure — it is a
    set intersection over ids — and a button that looks available and then refuses is a
    worse control than one that says up front what it can do instead.

    Staleness and stranding cannot be answered without reading storage, so those two
    still surface as a message after the attempt.
  */
  function blockers(entry: JournalEntry): JournalEntry[] {
    return blockedBy(entry, journal.entries);
  }

  function runLength(entry: JournalEntry): number {
    return runBackTo(entry, journal.entries).length;
  }

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

  function at(iso: string): string {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? '' : time.format(parsed);
  }
</script>

<svelte:head><title>Changes — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Changes</h1>
    <p class="mt-1 max-w-prose text-sm text-text-muted">
      What this session has written, newest first. Undo puts a change back;
      <span class="font-mono text-xs">Ctrl+Z</span> does the newest one from any screen.
      This list lives in memory and is gone when the tab reloads — it is a way to take
      back something you just did, not a history of the course.
    </p>
  </header>

  {#if entries.length === 0}
    <p
      class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted"
    >
      Nothing yet this session. Anything you write here shows up in this list.
    </p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each entries as entry (entry.id)}
        {@const inTheWay = blockers(entry)}
        {@const reverted = entry.state === 'reverted'}
        <li
          class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border
                 border-border-subtle bg-surface px-4 py-3"
          class:opacity-60={reverted}
        >
          <div class="min-w-0 grow">
            <p class="truncate text-sm font-medium text-text">{entry.label}</p>
            <!--
              "undone" belongs on the meta line, not appended to the label. Beside it
              the two run together for anything reading the text rather than looking at
              it — "Deleted an itemundone" — which is a screen reader and every one of
              this repo's own page-text checks.
            -->
            <p class="truncate text-xs text-text-muted">
              {at(entry.at)} · {count(entry.changes.length, 'record')}{reverted
                ? ' · undone'
                : ''}
            </p>
          </div>

          {#if inTheWay.length === 0}
            <Button
              size="sm"
              disabled={undo.busy}
              onclick={() => void undo.flip(entry)}
            >
              {reverted ? 'Redo' : 'Undo'}
            </Button>
          {:else if reverted}
            <!--
              Nothing to offer here. "Redo everything forward to here" would be a second
              operation with its own ordering questions, and redoing out of order past a
              change that touched the same record is the case it exists to refuse.
            -->
            <p class="max-w-xs text-xs text-text-muted">
              Later changes touched the same records, so this cannot be redone.
            </p>
          {:else}
            <div class="flex flex-col items-end gap-1">
              <Button
                size="sm"
                disabled={undo.busy}
                onclick={() => void undo.undoBackTo(entry)}
              >
                Undo everything back to here ({runLength(entry)})
              </Button>
              <p class="text-xs text-text-muted">
                {count(inTheWay.length, 'later change')} touched the same records.
              </p>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <p class="max-w-prose text-xs text-text-muted">
      {#if journal.dropped > 0}
        The last {journal.limit} changes are kept; {count(journal.dropped, 'older one', 'older ones')}
        {journal.dropped === 1 ? 'has' : 'have'} been dropped and cannot be undone.
      {:else}
        The last {journal.limit} changes are kept. Older ones are dropped as new ones arrive.
      {/if}
      Deleting a course, importing a bundle and loading the sample are not in this list:
      each rewrites every table at once, and an undo that offered to put one back and
      then could not would be worse than one that says plainly that it cannot.
    </p>
  {/if}
</div>
