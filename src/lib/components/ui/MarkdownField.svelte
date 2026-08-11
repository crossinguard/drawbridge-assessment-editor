<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '$lib/markdown';
  import {
    insertLink,
    insertTable,
    toggleLinePrefix,
    toggleWrap,
    type EditResult,
    type Selection
  } from '$lib/markdown-edit';
  import IconButton from './IconButton.svelte';
  import type { IconName } from './icons';
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
    The toolbar. What it saves is not typing — `**` is two keystrokes — but remembering
    which syntax this dialect wants, and which way round a link's brackets go.

    Deliberately NOT a third mode beside edit and preview: the toggle button would stop
    having an obvious meaning, and what an author wants here is to keep typing with the
    syntax filled in for them.
  */
  const TOOLS: { name: IconName; label: string; apply: (text: string, at: Selection) => EditResult }[] = [
    { name: 'bold', label: 'Bold', apply: (text, at) => toggleWrap(text, at, '**') },
    { name: 'italic', label: 'Italic', apply: (text, at) => toggleWrap(text, at, '*') },
    { name: 'code', label: 'Code', apply: (text, at) => toggleWrap(text, at, '`') },
    { name: 'list', label: 'Bulleted list', apply: (text, at) => toggleLinePrefix(text, at, '- ') },
    { name: 'quote', label: 'Quote', apply: (text, at) => toggleLinePrefix(text, at, '> ') },
    { name: 'link', label: 'Link', apply: insertLink },
    { name: 'table', label: 'Table', apply: insertTable }
  ];

  /**
   * Applies one tool to the current selection.
   *
   * The write goes through the bound `value` and then calls `oninput` BY HAND. This is
   * the trap the whole feature turns on: `oninput` here is the textarea's own handler,
   * and a programmatic edit — `setRangeText`, or assigning `textarea.value` — does not
   * fire it. The text would change on screen and no save would ever be queued, which is
   * the exact family of silent loss this codebase has been bitten by twice.
   *
   * Selection is restored after `tick()`, because the textarea has not been re-rendered
   * with the new text until then and setting a range against the old string puts the
   * caret in the wrong place.
   */
  async function apply(tool: (typeof TOOLS)[number]): Promise<void> {
    if (!textarea) return;

    const result = tool.apply(value ?? '', {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    });

    value = result.text;
    oninput?.();

    await tick();
    textarea.focus();
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  }

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
  <!--
    The toolbar shares the row the label and Preview toggle already occupy, rather than
    adding one of its own. An item card stacks six of these fields, and six extra rows
    of chrome would push the writing off the screen to save nobody any typing.
  -->
  <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
    <label for={id} class={hideLabel ? 'sr-only' : LABEL}>
      {label}
    </label>
    <div class="ml-auto flex flex-wrap items-center gap-0.5">
      {#if !preview}
        <div class="flex flex-wrap items-center gap-0.5" role="group" aria-label="Formatting">
          {#each TOOLS as tool (tool.name)}
            <!--
              `preventDefault` on mousedown stops the button taking focus, so the
              textarea keeps its selection and its caret — otherwise every press would
              have to guess where the text had been.

              The ACTION still runs on click, which is what keeps this reachable by
              keyboard: tab to the button, press Enter, and the selection the textarea
              is still holding is the one that gets formatted. A control that acted on
              mousedown instead would answer to a mouse and nothing else, which is the
              mistake `OutcomePicker` shipped with once.
            -->
            <IconButton
              name={tool.name}
              title={tool.label}
              aria-label={tool.label}
              aria-controls={id}
              onclick={() => void apply(tool)}
              onmousedown={(event) => event.preventDefault()}
            />
          {/each}
        </div>
      {/if}
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
