<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    hint?: string;
    /** Visually hides the label but keeps it for screen readers. */
    hideLabel?: boolean;
    children: Snippet<[{ id: string }]>;
  }

  let { label, hint, hideLabel = false, children }: Props = $props();

  // $props.id() gives a stable per-instance id, so label/control association survives
  // list reordering without the caller having to invent unique ids.
  const id = $props.id();
  const hintId = `${id}-hint`;
</script>

<div class="flex flex-col gap-1">
  <label
    for={id}
    class={hideLabel
      ? 'sr-only'
      : 'text-xs font-medium tracking-wide text-text-muted uppercase'}
  >
    {label}
  </label>
  {@render children({ id })}
  {#if hint}
    <p id={hintId} class="text-xs text-text-muted">{hint}</p>
  {/if}
</div>
