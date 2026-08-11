<script lang="ts">
  import type { Issue } from '$lib/domain/validate';
  import type { Outcome } from '$lib/domain/schema';
  import { outcomes } from '$lib/stores/outcomes.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import type { IconName } from '$lib/components/ui/icons';

  interface Props {
    outcome: Outcome;
    depth: number;
    /** Label for this depth, from config.outcomeTiers. Purely a label. */
    tier: string | undefined;
    issues: Issue[];
    focusId: string | null;
    onFocused: () => void;
    onAddSibling: (afterId: string) => void;
    onAddChild: (parentId: string) => void;
    onRemove: (outcome: Outcome) => void;
  }

  let {
    outcome,
    depth,
    tier,
    issues,
    focusId,
    onFocused,
    onAddSibling,
    onAddChild,
    onRemove
  }: Props = $props();

  let textField = $state<HTMLInputElement | null>(null);
  let showNotes = $state(false);

  const siblings = $derived(outcomes.siblingsOf(outcome.parentId));
  const index = $derived(siblings.findIndex((s) => s.id === outcome.id));
  const canMoveUp = $derived(index > 0);
  const canMoveDown = $derived(index >= 0 && index < siblings.length - 1);
  const canIndent = $derived(index > 0);
  const canOutdent = $derived(outcome.parentId !== null);

  const worst = $derived(
    issues.some((i) => i.severity === 'error')
      ? 'error'
      : issues.some((i) => i.severity === 'warning')
        ? 'warning'
        : issues.length > 0
          ? 'info'
          : null
  );

  // A newly added outcome should be ready to type into. This effect fires only when
  // the page hands this row the focus token, and clears it immediately so it cannot
  // steal focus back on an unrelated re-render.
  $effect(() => {
    if (focusId === outcome.id && textField) {
      textField.focus();
      onFocused();
    }
  });

  function edited() {
    outcomes.queueFieldSave(outcome.id);
  }

  /*
    Alt is the modifier for structure, deliberately. Plain Tab keeps its normal job of
    moving focus — hijacking it the way a note-taking outliner does would make the tree
    unusable with a screen reader and unreachable by keyboard for anyone who relies on
    Tab to get past it.
  */
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onAddSibling(outcome.id);
      return;
    }
    if (!event.altKey) return;

    const actions: Record<string, () => void> = {
      ArrowUp: () => void outcomes.move(outcome.id, -1),
      ArrowDown: () => void outcomes.move(outcome.id, 1),
      ArrowRight: () => void outcomes.indent(outcome.id),
      ArrowLeft: () => void outcomes.outdent(outcome.id)
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  const control =
    'rounded border border-border-subtle bg-surface px-2 py-1 text-sm text-text ' +
    'placeholder:text-text-muted focus:border-border-strong focus:outline-2 focus:outline-accent';
</script>

<div
  class="group flex items-start gap-2 rounded-md py-1 pr-1 hover:bg-surface-raised
         focus-within:bg-surface-raised"
  style="padding-left: {depth * 1.25}rem"
>
  <span
    class="mt-1.5 w-24 shrink-0 truncate text-3xs tracking-wide text-text-muted uppercase"
    title={tier ?? `Depth ${depth + 1}`}
  >
    {tier ?? `Depth ${depth + 1}`}
  </span>

  <input
    class="{control} w-28 shrink-0 font-mono text-xs"
    bind:value={outcome.code}
    oninput={edited}
    onkeydown={onKeydown}
    placeholder="EO1.1"
    aria-label="Outcome code"
  />

  <div class="flex min-w-0 grow flex-col gap-1">
    <input
      bind:this={textField}
      class="{control} w-full"
      bind:value={outcome.text}
      oninput={edited}
      onkeydown={onKeydown}
      placeholder="What the learner can do"
      aria-label="Outcome text"
    />

    {#if showNotes}
      <textarea
        class="{control} w-full"
        rows="2"
        bind:value={outcome.notes}
        oninput={edited}
        placeholder="Notes — context, sources, things to revisit"
        aria-label="Notes"
      ></textarea>
    {/if}

    {#if worst}
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

  <!--
    Seven controls in one row, which is why they were the worst case for mismatched
    glyph baselines — four Unicode blocks, four different ink offsets. They are all on
    the same 16×16 grid now.
  -->
  <div
    class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity
           group-hover:opacity-100 group-focus-within:opacity-100"
  >
    {#snippet action(label: string, name: IconName, enabled: boolean, run: () => void)}
      <IconButton
        {name}
        title={label}
        aria-label={label}
        disabled={!enabled}
        onclick={run}
        class="focus-visible:opacity-100"
      />
    {/snippet}

    {@render action('Move up (Alt+↑)', 'up', canMoveUp, () => void outcomes.move(outcome.id, -1))}
    {@render action('Move down (Alt+↓)', 'down', canMoveDown, () => void outcomes.move(outcome.id, 1))}
    {@render action('Outdent (Alt+←)', 'left', canOutdent, () => void outcomes.outdent(outcome.id))}
    {@render action('Indent (Alt+→)', 'right', canIndent, () => void outcomes.indent(outcome.id))}
    {@render action('Add child', 'plus', true, () => onAddChild(outcome.id))}
    {@render action(showNotes ? 'Hide notes' : 'Notes', 'notes', true, () => (showNotes = !showNotes))}
    <IconButton
      name="close"
      tone="danger"
      title="Delete"
      aria-label="Delete"
      onclick={() => onRemove(outcome)}
      class="focus-visible:opacity-100"
    />
  </div>
</div>
