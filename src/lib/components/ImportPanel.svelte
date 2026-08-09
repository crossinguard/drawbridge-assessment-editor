<script lang="ts">
  import { goto } from '$app/navigation';
  import { backup, type ImportOutcome } from '$lib/stores/backup.svelte';
  import { vaultList } from '$lib/stores/vaults.svelte';
  import type { ImportMode } from '$lib/repo/types';
  import Button from '$lib/components/ui/Button.svelte';
  import { count } from '$lib/text';

  let fileInput = $state<HTMLInputElement | null>(null);
  let chosen = $state<File | null>(null);
  let mode = $state<ImportMode>('new');
  let outcome = $state<ImportOutcome | null>(null);

  /*
    Mode is an explicit choice, never inferred. "Merge" writes over records by id, so
    guessing wrong could overwrite a course the user still wanted — the sort of thing
    that has to be a decision someone made rather than one the app made for them.
  */
  async function run() {
    if (!chosen) return;
    outcome = await backup.importFile(chosen, mode);
    if (outcome.vaultId) await vaultList.load();
  }

  function reset() {
    chosen = null;
    outcome = null;
    if (fileInput) fileInput.value = '';
  }
</script>

<div class="flex flex-col gap-3">
  {#if outcome}
    {#if outcome.fatal}
      <p class="text-sm text-danger">{outcome.fatal}</p>
    {:else}
      <p class="text-sm">
        {outcome.mergedIntoExisting ? 'Merged into the existing course' : 'Imported as a new course'}
        — {count(outcome.counts?.outcomes ?? 0, 'outcome')},
        {count(outcome.counts?.collections ?? 0, 'collection')},
        {count(outcome.counts?.items ?? 0, 'item')},
        {count(outcome.counts?.rubrics ?? 0, 'rubric')}.
      </p>
    {/if}

    {#if outcome.problems.length > 0}
      <div class="rounded-md border border-border-subtle bg-surface-raised px-3 py-2">
        <!-- Only claim the rest survived when it actually did. -->
        <p class="text-xs font-medium text-warning">
          {count(outcome.problems.length, 'file')} could not be read.{outcome.fatal
            ? ''
            : ' Everything else was imported.'}
        </p>
        <ul class="mt-1 flex flex-col gap-0.5">
          {#each outcome.problems as problem (problem.file)}
            <li class="text-xs text-text-muted">
              <span class="font-mono text-text">{problem.file}</span> — {problem.message}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="flex items-center gap-2">
      {#if outcome.vaultId}
        <Button variant="primary" onclick={() => goto(`/v/${outcome!.vaultId}`)}>
          Open the course
        </Button>
      {/if}
      <Button variant="ghost" onclick={reset}>Import another</Button>
    </div>
  {:else}
    <input
      bind:this={fileInput}
      type="file"
      accept=".zip,application/zip"
      class="text-sm text-text-muted file:mr-3 file:cursor-pointer file:rounded-md
             file:border file:border-border-subtle file:bg-surface file:px-3 file:py-1.5
             file:text-sm file:text-text hover:file:border-border-strong"
      onchange={(event) => (chosen = event.currentTarget.files?.[0] ?? null)}
      aria-label="Bundle file"
    />

    {#if chosen}
      <fieldset class="flex flex-col gap-1.5">
        <legend class="text-xs font-medium tracking-wide text-text-muted uppercase">
          Bring it in as
        </legend>
        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" class="mt-1 accent-accent" bind:group={mode} value="new" />
          <span>
            A new course
            <span class="block text-xs text-text-muted">
              Every id is rewritten, so this can sit alongside a course it came from.
            </span>
          </span>
        </label>
        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" class="mt-1 accent-accent" bind:group={mode} value="merge" />
          <span>
            Merged into the matching course
            <span class="block text-xs text-text-muted">
              Matches on id, then on code, and writes over what it finds. Use this to
              restore a backup or move work between machines.
            </span>
          </span>
        </label>
      </fieldset>

      <div class="flex items-center gap-2">
        <Button variant="primary" disabled={backup.busy} onclick={run}>
          {backup.busy ? 'Reading…' : 'Import'}
        </Button>
        <Button variant="ghost" onclick={reset}>Cancel</Button>
      </div>
    {/if}
  {/if}
</div>
