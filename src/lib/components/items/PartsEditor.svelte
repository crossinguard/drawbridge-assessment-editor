<script lang="ts">
  import type { Item, ItemKind, Outcome, Rubric, Vault } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { items as itemStore } from '$lib/stores/items.svelte';
  import ItemBody from './ItemBody.svelte';
  import PartsEditor from './PartsEditor.svelte';

  interface Props {
    parent: Item;
    vault: Vault;
    outcomes: readonly Outcome[];
    rubrics: readonly Rubric[];
    stimuli: readonly Item[];
    scoring: ScoringContext;
    depth?: number;
  }

  let { parent, vault, outcomes, rubrics, stimuli, scoring, depth = 0 }: Props = $props();

  const ordered = $derived([...parent.parts].sort((a, b) => a.order - b.order));
  const total = $derived(itemPoints(parent, scoring));

  /*
    Parts are not rows of their own — they live inside the top-level record — so every
    edit here queues a save for whichever ancestor actually gets written. The store
    works that out rather than each component tracking its own lineage.
  */
  function edited(partId: string) {
    itemStore.queueSaveForOwnerOf(partId);
  }

  // Kinds a part can be. A part may itself be a group, which the schema and the
  // points arithmetic both allow; the nesting is capped in the UI only so the
  // indentation stays legible. Derived rather than const because it reads `depth`,
  // which is a prop — a plain const would freeze whatever it was at first render.
  const KINDS: readonly ItemKind[] = $derived([
    'choice',
    'multi',
    'trueFalse',
    'shortAnswer',
    'essay',
    ...(depth < 1 ? (['group'] as const) : [])
  ]);

  const control =
    'rounded border border-border-subtle bg-surface px-2 py-1 text-xs text-text ' +
    'focus:border-border-strong focus:outline-2 focus:outline-accent';
</script>

<div class="flex flex-col gap-2 border-l-2 border-border-subtle pl-3">
  <div class="flex items-baseline justify-between gap-2">
    <span class="text-xs font-medium tracking-wide text-text-muted uppercase">
      Parts ({ordered.length})
    </span>
    <!-- Says the rule out loud: a group IS the sum of its parts, unlike a rubric. -->
    <span class="text-[11px] text-text-muted">
      worth the sum of its parts — {describePoints(total)}
    </span>
  </div>

  {#each ordered as part, index (part.id)}
    <div class="rounded-md border border-border-subtle bg-surface-raised">
      <header class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-2 py-1.5">
        <span class="font-mono text-[11px] text-text-muted">
          {String.fromCharCode(97 + index)}.
        </span>

        <select
          class={control}
          value={part.kind}
          onchange={(event) => {
            part.kind = event.currentTarget.value as ItemKind;
            edited(part.id);
          }}
          aria-label="Part kind"
        >
          {#each KINDS as kind (kind)}
            <option value={kind}>{kind}</option>
          {/each}
        </select>

        <label class="flex items-center gap-1 text-[11px] text-text-muted">
          Points
          <input
            type="number"
            step="any"
            class="{control} w-14"
            value={part.points ?? ''}
            oninput={(event) => {
              const raw = event.currentTarget.value;
              if (raw === '') delete part.points;
              else part.points = Number(raw);
              edited(part.id);
            }}
            placeholder="—"
            aria-label="Part points"
          />
        </label>

        <span class="text-[11px] text-text-muted">{describePoints(itemPoints(part, scoring))}</span>

        <div class="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-text-muted
                   hover:text-text disabled:opacity-30"
            aria-label="Move part up"
            disabled={index === 0}
            onclick={() => itemStore.movePart(parent.id, part.id, -1)}>↑</button
          >
          <button
            type="button"
            class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-text-muted
                   hover:text-text disabled:opacity-30"
            aria-label="Move part down"
            disabled={index === ordered.length - 1}
            onclick={() => itemStore.movePart(parent.id, part.id, 1)}>↓</button
          >
          <button
            type="button"
            class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text"
            aria-label="Duplicate part"
            onclick={() => itemStore.duplicatePart(parent.id, part.id)}>⧉</button
          >
          <button
            type="button"
            class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-danger"
            aria-label="Remove part"
            onclick={() => {
              if (confirm('Remove this part?')) itemStore.removePart(parent.id, part.id);
            }}>✕</button
          >
        </div>
      </header>

      <div class="flex flex-col gap-3 px-2 py-2">
        <ItemBody
          item={part}
          {outcomes}
          {rubrics}
          {stimuli}
          {scoring}
          onedit={() => edited(part.id)}
        />

        {#if part.kind === 'group'}
          <PartsEditor
            parent={part}
            {vault}
            {outcomes}
            {rubrics}
            {stimuli}
            {scoring}
            depth={depth + 1}
          />
        {/if}
      </div>
    </div>
  {/each}

  <div class="flex flex-wrap items-center gap-1.5">
    {#each KINDS as kind (kind)}
      <button
        type="button"
        class="cursor-pointer rounded border border-dashed border-border-subtle px-2 py-0.5
               text-[11px] text-text-muted hover:border-border-strong hover:text-text
               focus-visible:outline-2 focus-visible:outline-accent"
        onclick={() => itemStore.addPart(parent.id, kind)}
      >
        + {kind}
      </button>
    {/each}
  </div>
</div>
