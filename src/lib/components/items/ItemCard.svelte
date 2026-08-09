<script lang="ts">
  import type { Issue } from '$lib/domain/validate';
  import type { Item, ItemKind, Outcome, Rubric, Section, Vault } from '$lib/domain/schema';
  import { ItemKindSchema } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { usesExpected, usesOptions } from '$lib/domain/items';
  import { items as itemStore } from '$lib/stores/items.svelte';
  import MarkdownField from '$lib/components/ui/MarkdownField.svelte';
  import OptionsEditor from './OptionsEditor.svelte';
  import OutcomePicker from './OutcomePicker.svelte';

  interface Props {
    item: Item;
    position: number;
    total: number;
    vault: Vault;
    outcomes: readonly Outcome[];
    sections: readonly Section[];
    issues: Issue[];
    rubrics: readonly Rubric[];
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
    scoring,
    focusId,
    onFocused
  }: Props = $props();

  let stemField = $state<HTMLElement | null>(null);
  let expanded = $state(true);

  // Stage 5 covers the selected-response kinds. The rest of the enum is offered but
  // marked, so switching to one is a deliberate act rather than a surprise.
  const READY_KINDS: readonly ItemKind[] = ['choice', 'multi', 'trueFalse', 'shortAnswer'];
  const allKinds = ItemKindSchema.options as readonly ItemKind[];

  const points = $derived(itemPoints(item, scoring));
  const worst = $derived(
    issues.some((issue) => issue.severity === 'error')
      ? 'error'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : null
  );

  $effect(() => {
    if (focusId === item.id && stemField) {
      stemField.querySelector('textarea')?.focus();
      onFocused();
    }
  });

  function edited() {
    itemStore.queueFieldSave(item.id);
  }

  const control =
    'rounded border border-border-subtle bg-surface px-2 py-1 text-xs text-text ' +
    'focus:border-border-strong focus:outline-2 focus:outline-accent';
</script>

<article
  bind:this={stemField}
  class="group rounded-lg border bg-surface transition-colors
         {worst === 'error' ? 'border-danger/40' : 'border-border-subtle'}"
  aria-label="Item {position + 1}"
>
  <header class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
    <button
      type="button"
      class="cursor-pointer rounded px-1 text-xs text-text-muted hover:text-text
             focus-visible:outline-2 focus-visible:outline-accent"
      onclick={() => (expanded = !expanded)}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse item' : 'Expand item'}
    >
      {expanded ? '▾' : '▸'}
    </button>

    <span class="font-mono text-xs text-text-muted">{position + 1}</span>

    <select
      class={control}
      value={item.kind}
      onchange={(event) => void itemStore.setKind(item.id, event.currentTarget.value as ItemKind)}
      aria-label="Item kind"
    >
      {#each allKinds as kind (kind)}
        <option value={kind}>{kind}{READY_KINDS.includes(kind) ? '' : ' (later stage)'}</option>
      {/each}
    </select>

    <label class="flex items-center gap-1 text-xs text-text-muted">
      Points
      <input
        type="number"
        step="any"
        class="{control} w-16"
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

    <select
      class={control}
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
        class={control}
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

    <div class="ml-auto flex items-center gap-0.5">
      <button
        type="button"
        class="cursor-pointer rounded px-1.5 py-1 text-xs text-text-muted hover:text-text
               disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
        title="Move up"
        aria-label="Move item up"
        disabled={position === 0}
        onclick={() => void itemStore.move(item.id, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        class="cursor-pointer rounded px-1.5 py-1 text-xs text-text-muted hover:text-text
               disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
        title="Move down"
        aria-label="Move item down"
        disabled={position === total - 1}
        onclick={() => void itemStore.move(item.id, 1)}
      >
        ↓
      </button>
      <button
        type="button"
        class="cursor-pointer rounded px-1.5 py-1 text-xs text-text-muted hover:text-text
               focus-visible:outline-2 focus-visible:outline-accent"
        title="Duplicate"
        aria-label="Duplicate item"
        onclick={() => void itemStore.duplicate(item.id)}
      >
        ⧉
      </button>
      <button
        type="button"
        class="cursor-pointer rounded px-1.5 py-1 text-xs text-text-muted hover:text-danger
               focus-visible:outline-2 focus-visible:outline-accent"
        title="Delete"
        aria-label="Delete item"
        onclick={() => {
          if (confirm('Delete this item? This cannot be undone.')) void itemStore.remove(item.id);
        }}
      >
        ✕
      </button>
    </div>
  </header>

  {#if expanded}
    <div class="flex flex-col gap-3 px-3 py-3">
      <MarkdownField
        bind:value={item.stem}
        label="Stem"
        hideLabel
        rows={3}
        placeholder="The question. Markdown works — tables, lists, code."
        oninput={edited}
      />

      {#if usesOptions(item.kind)}
        <OptionsEditor {item} onedit={edited} />
      {/if}

      {#if usesExpected(item.kind)}
        <MarkdownField
          bind:value={item.expected}
          label={item.kind === 'essay' ? 'Model answer' : 'Expected answer'}
          rows={2}
          placeholder={item.kind === 'essay' ? 'What a strong response covers' : '25'}
          oninput={edited}
        />

        {#if item.kind === 'shortAnswer'}
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium tracking-wide text-text-muted uppercase">
              Also accept
            </span>
            <input
              class="rounded border border-border-subtle bg-surface px-2 py-1 text-sm
                     focus:border-border-strong focus:outline-2 focus:outline-accent"
              value={item.accepted.join(', ')}
              oninput={(event) => {
                item.accepted = event.currentTarget.value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                edited();
              }}
              placeholder="25.0, twenty-five"
            />
          </label>
        {/if}
      {/if}

      <div class="grid gap-3 sm:grid-cols-2">
        <MarkdownField
          bind:value={item.rationale}
          label="Rationale"
          rows={2}
          placeholder="Why the key is the key"
          oninput={edited}
        />
        <MarkdownField
          bind:value={item.feedback}
          label="Feedback"
          rows={2}
          placeholder="Shown whatever they answered"
          oninput={edited}
        />
      </div>

      <!--
        Offered on every kind, not just essay and discussion. A rubric-scored short
        answer is unusual but not wrong, and points.ts already resolves a rubric on
        anything that carries one — hiding the field would make the model and the
        editor disagree.
      -->
      <label class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span class="font-medium tracking-wide uppercase">Rubric</span>
        <select
          class={control}
          value={item.rubricId ?? ''}
          onchange={(event) => {
            const next = event.currentTarget.value;
            if (next) item.rubricId = next;
            else delete item.rubricId;
            edited();
          }}
          aria-label="Rubric"
        >
          <option value="">None</option>
          {#each rubrics as rubric (rubric.id)}
            <option value={rubric.id}>{rubric.title || 'Untitled'}</option>
          {/each}
        </select>
        {#if item.rubricId && item.points === undefined}
          <span>Scored by the rubric — {describePoints(points)}.</span>
        {:else if item.rubricId}
          <span class="text-warning">The points above override the rubric total.</span>
        {/if}
      </label>

      <OutcomePicker
        selected={item.outcomeIds}
        {outcomes}
        onchange={(next) => {
          item.outcomeIds = next;
          edited();
        }}
      />

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
