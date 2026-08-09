<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { rubricTotal } from '$lib/domain/points';
  import { descriptorCoverage, levelsFromSet } from '$lib/domain/rubrics';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { rubrics } from '$lib/stores/rubrics.svelte';
  import { count } from '$lib/text';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const vault = $derived(activeVault.draft);

  $effect(() => {
    void rubrics.load(vaultId);
  });

  let creating = $state(false);
  let title = $state('');
  let levelSetId = $state('');

  const levelSets = $derived(vault?.config.levelSets ?? []);
  $effect(() => {
    if (!levelSetId && levelSets.length > 0) levelSetId = levelSets[0]!.id;
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    // Levels are copied out of the chosen set, so the rubric owns them and editing
    // one rubric never reaches back into config or into another rubric.
    const set = levelSets.find((entry) => entry.id === levelSetId);
    const rubric = await rubrics.create({
      title: title.trim(),
      ...(set ? { levels: levelsFromSet(set) } : {})
    });
    title = '';
    creating = false;
    await goto(`/v/${vaultId}/rubrics/${rubric.id}`);
  }
</script>

<svelte:head><title>Rubrics — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Rubrics</h1>
    <p class="mt-1 max-w-prose text-sm text-text-muted">
      Shared across the course — a participation rubric written once gets attached to
      every week's discussion. Editing one changes every item pointing at it.
    </p>
  </header>

  {#if rubrics.status === 'loading'}
    <p class="text-sm text-text-muted">Loading…</p>
  {:else if rubrics.items.length === 0}
    <p class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted">
      No rubrics yet.
    </p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each rubrics.items as rubric (rubric.id)}
        {@const coverage = descriptorCoverage(rubric)}
        <li>
          <a
            href="/v/{vaultId}/rubrics/{rubric.id}"
            class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle
                   bg-surface px-4 py-3 transition-colors hover:border-border-strong
                   hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-accent"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{rubric.title || 'Untitled'}</span>
              <span class="block truncate text-xs text-text-muted">
                {count(rubric.criteria.length, 'criterion', 'criteria')} ·
                {count(rubric.levels.length, 'level')} ·
                worth up to {rubricTotal(rubric)} pt
                {#if coverage.total > 0 && coverage.written < coverage.total}
                  · {coverage.written} of {coverage.total} cells written
                {/if}
              </span>
            </span>
            <span aria-hidden="true" class="text-text-muted">→</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <section class="rounded-lg border border-border-subtle bg-surface p-4">
    {#if creating}
      <form class="flex flex-col gap-3" onsubmit={create}>
        <div class="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Title">
            {#snippet children({ id })}
              <TextInput {id} bind:value={title} placeholder="Discussion participation" required />
            {/snippet}
          </Field>
          <Field label="Start from" hint="Level sets are defined in Settings.">
            {#snippet children({ id })}
              <select
                {id}
                class="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5
                       text-sm focus:border-border-strong focus:outline-2 focus:outline-accent"
                bind:value={levelSetId}
              >
                {#each levelSets as set (set.id)}
                  <option value={set.id}>{set.name}</option>
                {/each}
                <option value="">Blank — I'll write the levels</option>
              </select>
            {/snippet}
          </Field>
        </div>
        <div class="flex items-center gap-2">
          <Button type="submit" variant="primary">Create</Button>
          <Button type="button" variant="ghost" onclick={() => (creating = false)}>Cancel</Button>
        </div>
      </form>
    {:else}
      <Button variant="primary" onclick={() => (creating = true)}>+ New rubric</Button>
    {/if}
  </section>
</div>
