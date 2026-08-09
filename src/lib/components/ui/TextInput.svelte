<script lang="ts">
  import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    value: string | number | undefined;
    /** Renders as a textarea instead. */
    multiline?: boolean;
    rows?: number;
  }

  let {
    value = $bindable(),
    multiline = false,
    rows = 3,
    class: extra = '',
    ...rest
  }: Props = $props();

  const base =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text ' +
    'placeholder:text-text-muted focus:border-border-strong focus:outline-2 ' +
    'focus:outline-offset-0 focus:outline-accent disabled:opacity-45';

  /*
    The props are declared against the input element, so the textarea branch needs a
    cast. The two attribute sets differ only in the element type threaded through every
    event handler — an intersection would collide on all of them and a union would make
    every ordinary attribute unusable. One cast at the single spread site is the
    smallest honest way to say "same attributes, other element".
  */
  const textareaProps = $derived(rest as unknown as HTMLTextareaAttributes);
</script>

{#if multiline}
  <textarea class="{base} {extra}" {rows} bind:value {...textareaProps}></textarea>
{:else}
  <input class="{base} {extra}" bind:value {...rest} />
{/if}
