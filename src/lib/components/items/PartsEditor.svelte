<script lang="ts">
  import type { Item, ItemKind, Outcome, Rubric, Vault } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { items as itemStore } from '$lib/stores/items.svelte';
  import ItemBody from './ItemBody.svelte';
  import PartsEditor from './PartsEditor.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { CONTROL, LABEL } from '$lib/components/ui/styles';

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

</script>

<div class="flex flex-col gap-2 border-l-2 border-border-subtle pl-3">
  <div class="flex items-baseline justify-between gap-2">
    <span class={LABEL}>
      Parts ({ordered.length})
    </span>
    <!-- Says the rule out loud: a group IS the sum of its parts, unlike a rubric. -->
    <span class="text-2xs text-text-muted">
      worth the sum of its parts — {describePoints(total)}
    </span>
  </div>

  {#each ordered as part, index (part.id)}
    <div class="rounded-md border border-border-subtle bg-surface-raised">
      <header class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-2 py-1.5">
        <span class="font-mono text-2xs text-text-muted">
          {String.fromCharCode(97 + index)}.
        </span>

        <select
          class={CONTROL}
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

        <label class="flex items-center gap-1 text-2xs text-text-muted">
          Points
          <input
            type="number"
            step="any"
            class="{CONTROL} w-16"
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

        <span class="text-2xs text-text-muted">{describePoints(itemPoints(part, scoring))}</span>

        <div class="ml-auto flex items-center gap-1">
          <IconButton
            name="up"
            aria-label="Move part up"
            title="Move up"
            disabled={index === 0}
            onclick={() => itemStore.movePart(parent.id, part.id, -1)}
          />
          <IconButton
            name="down"
            aria-label="Move part down"
            title="Move down"
            disabled={index === ordered.length - 1}
            onclick={() => itemStore.movePart(parent.id, part.id, 1)}
          />
          <IconButton
            name="duplicate"
            aria-label="Duplicate part"
            title="Duplicate"
            onclick={() => itemStore.duplicatePart(parent.id, part.id)}
          />
          <IconButton
            name="close"
            tone="danger"
            aria-label="Remove part"
            title="Remove"
            onclick={() => {
              if (confirm('Remove this part?')) itemStore.removePart(parent.id, part.id);
            }}
          />
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
      <Button size="sm" onclick={() => itemStore.addPart(parent.id, kind)}>+ {kind}</Button>
    {/each}
  </div>
</div>
