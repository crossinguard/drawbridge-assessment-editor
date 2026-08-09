<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { leavesOf } from '$lib/domain/outcomes';
  import { countBySeverity } from '$lib/domain/validate';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { storage } from '$lib/stores/storage.svelte';
  import { review } from '$lib/stores/review.svelte';
  import { count } from '$lib/text';
  import Card from '$lib/components/ui/Card.svelte';
  import StorageNotice from '$lib/components/StorageNotice.svelte';
  import ExportCard from '$lib/components/ExportCard.svelte';
  import ProblemsPanel from '$lib/components/ProblemsPanel.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const vault = $derived(activeVault.draft);

  $effect(() => {
    void review.load(vaultId);
  });

  /*
    Re-read on each arrival, not only the first. The snapshot is deliberately not live
    — numbers that shift while you are reading them are worse than useless — but that
    only needs to hold WITHIN a visit. Coming back after editing an item and being
    shown last week's totals would be its own kind of wrong.
  */
  onMount(() => {
    void review.reload();
  });

  const snapshot = $derived(review.snapshot);
  const coverage = $derived(review.coverage);
  const issues = $derived(review.issues);
  const severities = $derived(countBySeverity(issues));

  const leaves = $derived(leavesOf(snapshot?.outcomes ?? []));
  const assessedLeaves = $derived(
    leaves.filter((outcome) => coverage?.byOutcome.has(outcome.id)).length
  );

  const recent = $derived(review.recent(6));

  const when = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(iso).toISOString().slice(0, 10);
  };
</script>

<svelte:head><title>{vault?.name ?? 'Vault'} — Drawbridge</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5">
  <div>
    <h1 class="text-xl font-semibold tracking-tight">{vault?.name}</h1>
    {#if vault?.description}
      <p class="mt-1 max-w-prose text-sm text-text-muted">{vault.description}</p>
    {/if}
  </div>

  <StorageNotice />

  {#if vault}
    <ExportCard vaultId={vault.id} vaultName={vault.name} />
  {/if}

  <Card
    title="Coverage"
    description="Measured against leaf outcomes — a parent is reached through its children."
  >
    {#if leaves.length === 0}
      <p class="text-sm text-text-muted">
        No outcomes yet. <a class="text-accent underline" href="/v/{vaultId}/outcomes">
          Start the tree
        </a>.
      </p>
    {:else}
      {@const pct = Math.round((assessedLeaves / leaves.length) * 100)}
      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-sm">
            <span class="text-lg font-semibold">{assessedLeaves}</span>
            <span class="text-text-muted">of {leaves.length} assessed</span>
          </p>
          <a class="text-xs text-accent underline" href="/v/{vaultId}/coverage">
            See the matrix →
          </a>
        </div>

        <!-- A plain bar rather than a chart: one number, read at a glance. -->
        <div
          class="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
          role="img"
          aria-label="{pct}% of leaf outcomes assessed"
        >
          <div
            class="h-full rounded-full {pct === 100 ? 'bg-success' : 'bg-accent'}"
            style="width: {pct}%"
          ></div>
        </div>

        {#if assessedLeaves < leaves.length}
          <p class="text-xs text-text-muted">
            {count(leaves.length - assessedLeaves, 'outcome')} with nothing assessing
            {leaves.length - assessedLeaves === 1 ? 'it' : 'them'}.
          </p>
        {/if}
      </div>
    {/if}
  </Card>

  {#if issues.length > 0}
    <div class="flex flex-col gap-2">
      <p class="text-xs text-text-muted">
        {#if severities.error}
          <span class="text-danger">{count(severities.error, 'thing')} to fix</span> ·
        {/if}
        {#if severities.warning}
          <span class="text-warning">{count(severities.warning, 'thing')} to check</span> ·
        {/if}
        {count(severities.info, 'suggestion')}
      </p>
      <ProblemsPanel {issues} subject="this course" hrefFor={(issue) => review.linkFor(issue)} />
    </div>
  {/if}

  <Card title="Recent work">
    {#if recent.length === 0}
      <p class="text-sm text-text-muted">Nothing written yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each recent as entry (entry.id)}
          <li class="flex items-baseline justify-between gap-3 text-sm">
            <a
              href="/v/{vaultId}/c/{entry.collectionId}"
              class="min-w-0 truncate underline-offset-2 hover:underline"
            >
              {entry.label}
            </a>
            <span class="shrink-0 text-xs text-text-muted">{when(entry.updatedAt)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>

  <Card title="Storage">
    <p class="text-sm text-text-muted">
      {#if storage.state.supported}
        {storage.state.persisted
          ? 'This browser has marked Drawbridge’s data as permanent.'
          : 'This browser has not marked the data as permanent, so it can be evicted.'}
        Using {storage.usedLabel}.
      {:else}
        This browser does not report storage permanence.
      {/if}
    </p>
  </Card>
</div>
