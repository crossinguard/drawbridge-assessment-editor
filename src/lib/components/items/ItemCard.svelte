<script lang="ts">
  import type { Issue } from '$lib/domain/validate';
  import type {
    Collection,
    Item,
    ItemKind,
    Outcome,
    Rubric,
    Section,
    Vault
  } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { kindOptions, type KindCapabilities } from '$lib/domain/collections';
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
    /** The other collections in this vault, for "Move to…". */
    elsewhere: readonly Collection[];
    scoring: ScoringContext;
    /**
     * What this collection's kind offers. The resolved object, never a kind key —
     * a component that took the key would have to branch on it, which is the thing
     * capabilities exist to prevent.
     */
    capabilities: KindCapabilities;
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
    elsewhere,
    scoring,
    capabilities,
    focusId,
    onFocused
  }: Props = $props();

  let body = $state<ReturnType<typeof ItemBody> | null>(null);
  let expanded = $state(true);

  // Whatever the kind offers, plus this item's own kind if it is not among them, so
  // the select can never show a value it does not contain. See kindOptions.
  const offered = $derived(kindOptions(capabilities, item.kind));

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

    <!--
      The kind picker and the points field are both scoring machinery, and a kind that
      says it does not score its items individually shows neither. The computed figure
      stays: it is what the collection total is made of, and hiding it as well would
      leave a rubric-scored task with no statement of what it is worth anywhere.
    -->
    {#if capabilities.itemScoring}
      <select
        class={CONTROL}
        value={item.kind}
        onchange={(event) => void itemStore.setKind(item.id, event.currentTarget.value as ItemKind)}
        aria-label="Item kind"
      >
        {#each offered as kind (kind)}
          <option value={kind}>{kind}</option>
        {/each}
      </select>
    {:else}
      <span class="text-xs text-text-muted">{item.kind}</span>
    {/if}

    {#if item.kind !== 'stimulus'}
      {#if capabilities.itemScoring}
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
      {/if}

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

    {#if elsewhere.length > 0}
      <!--
        Moving, not copying: the item leaves this screen and arrives at the end of the
        other collection, outside its sections. Its own value resets to the prompt
        straight away, because the control is an action rather than a setting — there
        is no "current collection" for it to sit showing, the item having gone.
      -->
      <select
        class={CONTROL}
        value=""
        onchange={(event) => {
          const to = event.currentTarget.value;
          event.currentTarget.value = '';
          if (to) void itemStore.moveToCollection(item.id, to);
        }}
        aria-label="Move this item to another collection"
      >
        <option value="">Move to…</option>
        {#each elsewhere as collection (collection.id)}
          <option value={collection.id}>{collection.title || 'Untitled'}</option>
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
