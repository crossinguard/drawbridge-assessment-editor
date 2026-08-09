<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { buildTree, walkTree } from '$lib/domain/outcomes';
  import { validateOutcomes, type Issue } from '$lib/domain/validate';
  import type { Outcome } from '$lib/domain/schema';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { outcomes } from '$lib/stores/outcomes.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import SaveIndicator from '$lib/components/SaveIndicator.svelte';
  import ProblemsPanel from '$lib/components/ProblemsPanel.svelte';
  import OutcomeRow from '$lib/components/outcomes/OutcomeRow.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const vault = $derived(activeVault.draft);

  // Depends on the id alone. Reading the tree here would reload it on every keystroke.
  $effect(() => {
    void outcomes.load(vaultId);
  });

  onMount(() => {
    const flush = () => void outcomes.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      void outcomes.flush();
    };
  });

  const nodes = $derived(walkTree(buildTree(outcomes.items)));

  const issues = $derived(vault ? validateOutcomes(vault, outcomes.items) : []);
  const issuesByOutcome = $derived.by(() => {
    const grouped = new Map<string, Issue[]>();
    for (const issue of issues) {
      const existing = grouped.get(issue.entityId);
      if (existing) existing.push(issue);
      else grouped.set(issue.entityId, [issue]);
    }
    return grouped;
  });

  const codeById = $derived(new Map(outcomes.items.map((o) => [o.id, o.code])));

  let focusId = $state<string | null>(null);

  async function addRoot() {
    const created = await outcomes.add(null);
    focusId = created.id;
  }

  async function addSibling(afterId: string) {
    const sibling = outcomes.items.find((o) => o.id === afterId);
    const created = await outcomes.add(sibling?.parentId ?? null, afterId);
    focusId = created.id;
  }

  async function addChild(parentId: string) {
    const created = await outcomes.add(parentId);
    focusId = created.id;
  }

  async function remove(outcome: Outcome) {
    const descendants = outcomes.descendantsOf(outcome.id);
    const label = outcome.code || 'this outcome';
    const message =
      descendants.length > 0
        ? `Delete ${label} and the ${descendants.length} outcome${
            descendants.length === 1 ? '' : 's'
          } beneath it? This cannot be undone.`
        : `Delete ${label}? This cannot be undone.`;

    // A branch is deleted as a unit — promoting orphans to the top level would scatter
    // it somewhere harder to reconstruct than retyping it.
    if (!confirm(message)) return;
    await outcomes.remove(outcome.id);
  }
</script>

<svelte:head><title>Outcomes — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

<div class="mx-auto flex max-w-5xl flex-col gap-4">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Outcomes</h1>
      <p class="mt-1 max-w-prose text-sm text-text-muted">
        The hierarchy assessments align to. Depth is whatever you build; the labels come
        from the tiers set in Settings.
      </p>
    </div>
    <SaveIndicator saver={outcomes.saver} />
  </header>

  <ProblemsPanel {issues} labelFor={(issue) => codeById.get(issue.entityId)} />

  {#if outcomes.status === 'loading'}
    <p class="text-sm text-text-muted">Loading…</p>
  {:else if outcomes.status === 'error'}
    <p class="text-sm text-danger">{outcomes.error}</p>
  {:else if nodes.length === 0}
    <div
      class="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-subtle
             px-4 py-8"
    >
      <p class="text-sm text-text-muted">
        No outcomes yet. Start with a top-level one — a course outcome — and nest
        beneath it.
      </p>
      <Button variant="primary" onclick={addRoot}>+ First outcome</Button>
    </div>
  {:else}
    <div class="rounded-lg border border-border-subtle bg-surface p-2">
      {#each nodes as node (node.outcome.id)}
        <OutcomeRow
          outcome={node.outcome}
          depth={node.depth}
          tier={vault?.config.outcomeTiers[node.depth]}
          issues={issuesByOutcome.get(node.outcome.id) ?? []}
          {focusId}
          onFocused={() => (focusId = null)}
          onAddSibling={addSibling}
          onAddChild={addChild}
          onRemove={remove}
        />
      {/each}
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <Button onclick={addRoot}>+ Top-level outcome</Button>
      <p class="text-xs text-text-muted">
        Enter adds a sibling · Alt+↑↓ moves · Alt+←→ changes level
      </p>
    </div>
  {/if}
</div>
