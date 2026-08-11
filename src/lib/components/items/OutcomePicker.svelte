<script lang="ts">
  import type { Outcome } from '$lib/domain/schema';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { FOCUS_RING, LABEL } from '$lib/components/ui/styles';

  interface Props {
    selected: string[];
    outcomes: readonly Outcome[];
    onchange: (next: string[]) => void;
  }

  let { selected, outcomes, onchange }: Props = $props();

  let query = $state('');
  let picking = $state(false);
  let container = $state<HTMLElement | null>(null);
  let field = $state<HTMLInputElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  /** Set when the picker closed by choosing something, so focus can go back to the trigger. */
  let returning = $state(false);

  const byId = $derived(new Map(outcomes.map((outcome) => [outcome.id, outcome])));

  const matches = $derived(
    outcomes
      .filter((outcome) => !selected.includes(outcome.id))
      .filter((outcome) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return (
          outcome.code.toLowerCase().includes(needle) ||
          outcome.text.toLowerCase().includes(needle)
        );
      })
      .slice(0, 8)
  );

  function add(id: string) {
    onchange([...selected, id]);
    query = '';
    picking = false;
    returning = true;
  }

  /*
    Closing when focus leaves the whole picker, not when the input blurs.

    The previous version closed on `onblur` behind a 120ms timer, which meant a click on
    a suggestion had to beat that timer — so the suggestions fired on `onmousedown` to
    get in first, which made them unreachable by keyboard entirely.

    The check is deferred by a tick, and it reads `document.activeElement` rather than
    the event's `relatedTarget`. That is not the same 120ms guess in new clothes: opening
    the picker REPLACES the trigger button with the input, so at the instant focusout
    fires the focused element is momentarily <body> and `relatedTarget` is null. Reading
    it synchronously closes the picker the moment it opens. One tick later the DOM has
    settled and "is focus still inside this component" is a question with a real answer.
  */
  function onFocusOut() {
    setTimeout(() => {
      if (container && !container.contains(document.activeElement)) picking = false;
    }, 0);
  }

  /** The suggestion buttons, in order, for roving focus. */
  function options(): HTMLElement[] {
    return [...(container?.querySelectorAll<HTMLElement>('[data-suggestion]') ?? [])];
  }

  function step(from: number, by: number) {
    const list = options();
    if (list.length === 0) return;
    const next = Math.min(Math.max(from + by, 0), list.length - 1);
    list[next]?.focus();
  }

  /*
    Roving focus rather than `aria-activedescendant`. The suggestions stay real <button>
    elements, so Enter and Space work natively and nothing has to reimplement activation —
    which is the half of a hand-rolled combobox that usually goes wrong.
  */
  function onFieldKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options()[0]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      picking = false;
    }
  }

  function onOptionKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) field?.focus();
      else step(index, -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      picking = false;
      field?.focus();
    }
  }

  // Opening moves the caret into the search field; choosing hands focus back to the
  // trigger, so a keyboard user is never dropped on <body> after picking an outcome.
  $effect(() => {
    if (picking) field?.focus();
  });

  $effect(() => {
    if (!picking && returning && trigger) {
      trigger.focus();
      returning = false;
    }
  });
</script>

<div bind:this={container} class="flex flex-col gap-1.5" onfocusout={onFocusOut}>
  <span class={LABEL}>Outcomes</span>

  <div class="flex flex-wrap items-center gap-1.5">
    {#each selected as id (id)}
      {@const outcome = byId.get(id)}
      <span
        class="inline-flex min-h-7 items-center gap-1 rounded-md border border-border-subtle
               bg-surface-raised py-0.5 pr-0.5 pl-2 text-xs"
        title={outcome?.text}
      >
        <!-- A code that resolves to nothing is shown as-is rather than hidden: the
             alignment is real data and validation reports it as dangling. -->
        <span class="font-mono">{outcome?.code ?? 'unknown'}</span>
        <IconButton
          name="close"
          tone="danger"
          aria-label="Remove alignment to {outcome?.code ?? id}"
          onclick={() => onchange(selected.filter((existing) => existing !== id))}
        />
      </span>
    {/each}

    {#if picking}
      <input
        bind:this={field}
        class="w-40 min-h-7 rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-xs
               focus:border-border-strong focus:outline-2 focus:outline-accent"
        placeholder="Code or words…"
        bind:value={query}
        onkeydown={onFieldKeydown}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="outcome-suggestions"
        aria-autocomplete="list"
        aria-label="Search outcomes"
      />
    {:else}
      <Button
        bind:ref={trigger}
        size="sm"
        onclick={() => (picking = true)}
        disabled={outcomes.length === 0}
        title={outcomes.length === 0 ? 'Add outcomes to this course first' : 'Align to an outcome'}
      >
        + Align
      </Button>
    {/if}
  </div>

  {#if picking && matches.length > 0}
    <ul id="outcome-suggestions" class="flex flex-col rounded-md border border-border-subtle bg-surface">
      {#each matches as outcome, index (outcome.id)}
        <li>
          <button
            type="button"
            data-suggestion
            class="flex w-full cursor-pointer items-baseline gap-2 px-2 py-1.5 text-left text-xs
                   hover:bg-surface-raised {FOCUS_RING}"
            onclick={() => add(outcome.id)}
            onkeydown={(event) => onOptionKeydown(event, index)}
          >
            <span class="font-mono text-text">{outcome.code}</span>
            <span class="truncate text-text-muted">{outcome.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
