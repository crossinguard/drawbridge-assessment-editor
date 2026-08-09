<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { coverageAt } from '$lib/domain/coverage';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { review } from '$lib/stores/review.svelte';
  import { count } from '$lib/text';
  import Button from '$lib/components/ui/Button.svelte';
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

  const rows = $derived(review.outcomeRows);
  const collections = $derived(review.collections);
  const coverage = $derived(review.coverage);
  const uncovered = $derived(review.uncovered);

  const kindLabel = (key: string) =>
    vault?.config.collectionKinds.find((entry) => entry.key === key)?.label ?? key;

  /*
    An outcome aligned to by one item contributes that item's FULL points to every
    outcome it names, so a row total can exceed a column total. That is deliberate —
    the question this table answers is "how much assessment touches this outcome" —
    but it surprises people, so the page says it rather than leaving them to work it
    out from numbers that look wrong.
  */
</script>

<svelte:head><title>Coverage — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-4">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Coverage</h1>
      <p class="mt-1 max-w-prose text-sm text-text-muted">
        What each outcome is actually assessed by. Counts are items; the smaller number
        is points.
      </p>
    </div>
    <Button size="sm" onclick={() => review.reload()} disabled={review.status === 'loading'}>
      Refresh
    </Button>
  </header>

  {#if review.status === 'loading'}
    <p class="text-sm text-text-muted">Reading the whole course…</p>
  {:else if review.status === 'error'}
    <p class="text-sm text-danger">{review.error}</p>
  {:else if rows.length === 0}
    <p class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted">
      No outcomes yet. <a class="text-accent underline" href="/v/{vaultId}/outcomes">Build the tree</a>
      first — coverage is measured against it.
    </p>
  {:else if collections.length === 0}
    <p class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted">
      No collections yet, so nothing assesses anything.
      <a class="text-accent underline" href="/v/{vaultId}/collections">Add one</a>.
    </p>
  {:else}
    {#if uncovered.length > 0}
      <div class="rounded-lg border border-border-subtle bg-surface px-4 py-3">
        <p class="text-sm">
          <span class="font-medium text-warning">
            {count(uncovered.length, 'leaf outcome')} not assessed anywhere.
          </span>
          <span class="text-text-muted">
            Only leaves are counted — a parent outcome is reached through its children.
          </span>
        </p>
        <ul class="mt-1.5 flex flex-wrap gap-1.5">
          {#each uncovered as outcome (outcome.id)}
            <li>
              <a
                href="/v/{vaultId}/outcomes"
                class="inline-block rounded border border-border-subtle bg-surface-raised px-1.5
                       py-0.5 font-mono text-xs hover:border-border-strong"
                title={outcome.text}
              >
                {outcome.code}
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- The table scrolls inside its own box; the page never scrolls sideways. -->
    <div class="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-border-subtle">
            <th
              class="sticky left-0 z-10 min-w-64 bg-surface p-2 text-xs font-medium
                     tracking-wide text-text-muted uppercase"
            >
              Outcome
            </th>
            {#each collections as collection (collection.id)}
              <th class="min-w-28 border-l border-border-subtle p-2 align-bottom">
                <a
                  href="/v/{vaultId}/c/{collection.id}"
                  class="block text-xs font-medium hover:underline"
                  title={collection.title}
                >
                  <span class="block truncate">{collection.title || 'Untitled'}</span>
                  <span class="block text-[10px] font-normal text-text-muted">
                    {kindLabel(collection.kind)}
                  </span>
                </a>
              </th>
            {/each}
            <th class="min-w-20 border-l border-border-subtle p-2 align-bottom text-xs
                       font-medium tracking-wide text-text-muted uppercase">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {#each rows as node (node.outcome.id)}
            {@const outcomeTotal = coverage?.byOutcome.get(node.outcome.id)}
            <!--
              Only a LEAF with no coverage is a gap. A parent is reached through its
              children, so flagging every parent that carries no direct alignment would
              paint most of the tree as a problem and bury the real ones.
            -->
            {@const isLeaf = node.children.length === 0}
            {@const gap = isLeaf && !outcomeTotal}
            <tr class="border-b border-border-subtle last:border-b-0">
              <th
                scope="row"
                class="sticky left-0 z-10 bg-surface p-2 font-normal"
                style="padding-left: {0.5 + node.depth * 1}rem"
              >
                <span class="flex items-baseline gap-2">
                  <span class="font-mono text-xs {gap ? 'text-warning' : 'text-text'}">
                    {node.outcome.code}
                  </span>
                  <span class="truncate text-xs text-text-muted" title={node.outcome.text}>
                    {node.outcome.text}
                  </span>
                </span>
              </th>

              {#each collections as collection (collection.id)}
                {@const cell = coverageAt(coverage!, node.outcome.id, collection.id)}
                <td
                  class="border-l border-border-subtle p-2 text-center
                         {cell.itemCount === 0 && cell.points === 0 ? 'text-text-muted/40' : ''}"
                >
                  {#if cell.itemCount === 0 && cell.points === 0}
                    <span aria-label="not assessed">·</span>
                  {:else}
                    <span class="text-sm">{cell.itemCount}</span>
                    <span class="ml-1 text-[10px] text-text-muted">{cell.points}pt</span>
                  {/if}
                </td>
              {/each}

              <td class="border-l border-border-subtle p-2 text-center">
                {#if outcomeTotal}
                  <span class="text-sm font-medium">{outcomeTotal.itemCount}</span>
                  <span class="ml-1 text-[10px] text-text-muted">{outcomeTotal.points}pt</span>
                {:else if isLeaf}
                  <span class="text-xs text-warning">none</span>
                {:else}
                  <span class="text-xs text-text-muted/60" title="Assessed through its children">
                    via children
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>

        <tfoot>
          <tr class="border-t border-border-strong">
            <th
              scope="row"
              class="sticky left-0 z-10 bg-surface p-2 text-xs font-medium tracking-wide
                     text-text-muted uppercase"
            >
              Total
            </th>
            {#each collections as collection (collection.id)}
              {@const total = coverage?.byCollection.get(collection.id)}
              <td class="border-l border-border-subtle p-2 text-center">
                {#if total}
                  <span class="text-sm font-medium">{total.itemCount}</span>
                  <span class="ml-1 text-[10px] text-text-muted">{total.points}pt</span>
                {:else}
                  <span class="text-xs text-text-muted">·</span>
                {/if}
              </td>
            {/each}
            <td class="border-l border-border-subtle"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p class="max-w-prose text-xs text-text-muted">
      An item aligned to more than one outcome contributes its full points to each of
      them, so the row totals can add up to more than the column totals. That is
      intended: the question here is how much assessment touches an outcome, not how to
      divide a mark between them.
    </p>

    {#if coverage && coverage.unalignedItemIds.length > 0}
      <p class="text-xs text-text-muted">
        {count(coverage.unalignedItemIds.length, 'item')} in this course
        {coverage.unalignedItemIds.length === 1 ? 'is' : 'are'} not aligned to any outcome,
        so {coverage.unalignedItemIds.length === 1 ? 'it does' : 'they do'} not appear above.
      </p>
    {/if}

    <ProblemsPanel
      issues={review.issues}
      subject="this course"
      hrefFor={(issue) => review.linkFor(issue)}
    />
  {/if}
</div>
