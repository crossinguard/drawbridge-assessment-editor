<script lang="ts">
  import type { Issue } from '$lib/domain/validate';
  import type { Item, ItemKind, Outcome, Rubric, Section, Vault } from '$lib/domain/schema';
  import { ItemKindSchema } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { items as itemStore } from '$lib/stores/items.svelte';
  import ItemBody from './ItemBody.svelte';
  import PartsEditor from './PartsEditor.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { CONTROL } from '$lib/components/ui/styles';

  interface Props {
    item: Item;
    position: number;
    total: number;
    vault: Vault;
    outcomes: readonly Outcome[];
    sections: readonly Section[];
    issues: Issue[];
    rubrics: readonly Rubric[];
    stimuli: readonly Item[];
    scoring: ScoringContext;
    focusId: string | null;
    onFocused: () => void;
  }

  let {
    item,
    position,
    total,
    vault,
    outcomes,
    sections,
    issues,
    rubrics,
    stimuli,
    scoring,
    focusId,
    onFocused
  }: Props = $props();

  let body = $state<ReturnType<typeof ItemBody> | null>(null);
  let expanded = $state(true);

  const allKinds = ItemKindSchema.options as readonly ItemKind[];

  const points = $derived(itemPoints(item, scoring));
  const worst = $derived(
    issues.some((issue) => issue.severity === 'error')
      ? 'error'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : null
  );

  /*
    A newly added item gets the caret. Asks the body to focus its stem rather than
    hunting the DOM for a textarea — there is more than one field down there, and
    "the first textarea" is only accidentally the right one.
  */
  $effect(() => {
    if (focusId === item.id && body) {
      body.focusStem();
      onFocused();
    }
  });

  function edited() {
    itemStore.queueFieldSave(item.id);
  }
</script>

<article
  class="group rounded-lg border bg-surface transition-colors
         {worst === 'error' ? 'border-danger/40' : 'border-border-subtle'}"
  aria-label="Item {position + 1}"
>
  <header class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
    <IconButton
      name={expanded ? 'chevron-down' : 'chevron-right'}
      onclick={() => (expanded = !expanded)}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse item' : 'Expand item'}
    />

    <span class="font-mono text-xs text-text-muted">{position + 1}</span>

    <select
      class={CONTROL}
      value={item.kind}
      onchange={(event) => void itemStore.setKind(item.id, event.currentTarget.value as ItemKind)}
      aria-label="Item kind"
    >
      {#each allKinds as kind (kind)}
        <option value={kind}>{kind}</option>
      {/each}
    </select>

    {#if item.kind !== 'stimulus'}
      <label class="flex items-center gap-1 text-xs text-text-muted">
        Points
      <input
        type="number"
        step="any"
        class="{CONTROL} w-16"
        value={item.points ?? ''}
        oninput={(event) => {
          const raw = event.currentTarget.value;
          // Cleared means "not stated", which is different from zero — points.ts
          // reports the two differently and the collection total depends on it.
          if (raw === '') delete item.points;
          else item.points = Number(raw);
          edited();
        }}
          placeholder="—"
          aria-label="Points"
        />
      </label>

      <span class="text-xs text-text-muted" title="Computed from this item">
        {describePoints(points)}
      </span>
    {:else}
      <span class="text-xs text-text-muted">passage · no points</span>
    {/if}

    <select
      class={CONTROL}
      value={item.status}
      onchange={(event) => {
        item.status = event.currentTarget.value;
        edited();
      }}
      aria-label="Status"
    >
      <option value="">No status</option>
      {#each vault.config.statuses as status (status.key)}
        <option value={status.key}>{status.label}</option>
      {/each}
    </select>

    {#if sections.length > 0}
      <select
        class={CONTROL}
        value={item.sectionId ?? ''}
        onchange={(event) =>
          void itemStore.setSection(item.id, event.currentTarget.value || undefined)}
        aria-label="Section"
      >
        <option value="">No section</option>
        {#each sections as section (section.id)}
          <option value={section.id}>{section.title || 'Untitled section'}</option>
        {/each}
      </select>
    {/if}

    <div class="ml-auto flex items-center gap-1">
      <IconButton
        name="up"
        title="Move up"
        aria-label="Move item up"
        disabled={position === 0}
        onclick={() => void itemStore.move(item.id, -1)}
      />
      <IconButton
        name="down"
        title="Move down"
        aria-label="Move item down"
        disabled={position === total - 1}
        onclick={() => void itemStore.move(item.id, 1)}
      />
      <IconButton
        name="duplicate"
        title="Duplicate"
        aria-label="Duplicate item"
        onclick={() => void itemStore.duplicate(item.id)}
      />
      <IconButton
        name="close"
        tone="danger"
        title="Delete"
        aria-label="Delete item"
        onclick={() => {
          if (confirm('Delete this item? This cannot be undone.')) void itemStore.remove(item.id);
        }}
      />
    </div>
  </header>

  {#if expanded}
    <div class="flex flex-col gap-3 px-3 py-3">
      <ItemBody
        bind:this={body}
        {item}
        {outcomes}
        {rubrics}
        {stimuli}
        {scoring}
        onedit={edited}
      />

      {#if item.kind === 'group'}
        <PartsEditor parent={item} {vault} {outcomes} {rubrics} {stimuli} {scoring} />
      {/if}

      {#if issues.length > 0}
        <ul class="flex flex-col gap-0.5">
          {#each issues as issue (issue.id)}
            <li
              class="text-xs {issue.severity === 'error'
                ? 'text-danger'
                : issue.severity === 'warning'
                  ? 'text-warning'
                  : 'text-text-muted'}"
            >
              {issue.message}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</article>
