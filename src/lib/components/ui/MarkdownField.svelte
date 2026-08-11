<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';
  import { FOCUS_RING, LABEL } from './styles';

  interface Props {
    value: string | undefined;
    label: string;
    placeholder?: string;
    rows?: number;
    hideLabel?: boolean;
    oninput?: () => void;
  }

  let {
    value = $bindable(),
    label,
    placeholder,
    rows = 3,
    hideLabel = false,
    oninput
  }: Props = $props();

  let preview = $state(false);
  let textarea = $state<HTMLTextAreaElement | null>(null);
  const id = $props.id();

  /*
    Preview is a toggle rather than a side-by-side pane. The authoring column is
    already narrow enough on a laptop, and an author writing a stem is reading their
    own Markdown most of the time — the rendered view is for checking a table or a
    list came out right, which is an occasional glance rather than a constant need.

    The toggle is always rendered, including on an empty field. Hiding it until the
    first character was typed meant somebody who had never filled one in had never seen
    that a preview existed.
  */
  const rendered = $derived(renderMarkdown(value ?? ''));

  /**
   * Puts the caret in this field.
   *
   * Exported so callers stop reaching into the DOM for it — the collection screen used
   * to focus a newly added item with `querySelector('textarea')`, which silently picks
   * the wrong element the moment this component grows a second one.
   */
  export function focus(): void {
    preview = false;
    textarea?.focus();
  }
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-2">
    <label for={id} class={hideLabel ? 'sr-only' : LABEL}>
      {label}
    </label>
    <button
      type="button"
      class="min-h-7 cursor-pointer rounded-md px-2 py-0.5 text-2xs text-text-muted
             hover:bg-surface-raised hover:text-text {FOCUS_RING}"
      onclick={() => (preview = !preview)}
      aria-pressed={preview}
    >
      {preview ? 'Edit' : 'Preview'}
    </button>
  </div>

  {#if preview}
    <!--
      Safe because renderMarkdown sanitises with an allow-list. Stems can arrive from
      an imported bundle, so this is not merely defensive about the local author.
    -->
    <div
      class="markdown min-h-[2.5rem] rounded-md border border-border-subtle bg-surface-raised
             px-2.5 py-1.5 text-sm"
    >
      {@html rendered}
    </div>
  {:else}
    <textarea
      bind:this={textarea}
      {id}
      {rows}
      {placeholder}
      class="w-full resize-y rounded-md border border-border-subtle bg-surface px-2.5 py-1.5
             text-sm text-text placeholder:text-text-muted focus:border-border-strong
             focus:outline-2 focus:outline-accent"
      bind:value
      {oninput}
    ></textarea>
  {/if}
</div>
