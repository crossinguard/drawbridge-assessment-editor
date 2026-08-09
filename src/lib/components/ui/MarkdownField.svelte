<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';

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
  const id = $props.id();

  /*
    Preview is a toggle rather than a side-by-side pane. The authoring column is
    already narrow enough on a laptop, and an author writing a stem is reading their
    own Markdown most of the time — the rendered view is for checking a table or a
    list came out right, which is an occasional glance rather than a constant need.
  */
  const rendered = $derived(renderMarkdown(value ?? ''));
  const hasContent = $derived((value ?? '').trim().length > 0);
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-2">
    <label
      for={id}
      class={hideLabel ? 'sr-only' : 'text-xs font-medium tracking-wide text-text-muted uppercase'}
    >
      {label}
    </label>
    {#if hasContent}
      <button
        type="button"
        class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-text-muted
               hover:bg-surface-raised hover:text-text focus-visible:outline-2
               focus-visible:outline-accent"
        onclick={() => (preview = !preview)}
        aria-pressed={preview}
      >
        {preview ? 'Edit' : 'Preview'}
      </button>
    {/if}
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
