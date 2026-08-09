<script lang="ts">
  import type { Outcome } from '$lib/domain/schema';

  interface Props {
    selected: string[];
    outcomes: readonly Outcome[];
    onchange: (next: string[]) => void;
  }

  let { selected, outcomes, onchange }: Props = $props();

  let query = $state('');
  let picking = $state(false);

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
  }
</script>

<div class="flex flex-col gap-1.5">
  <span class="text-xs font-medium tracking-wide text-text-muted uppercase">Outcomes</span>

  <div class="flex flex-wrap items-center gap-1.5">
    {#each selected as id (id)}
      {@const outcome = byId.get(id)}
      <span
        class="inline-flex items-center gap-1 rounded border border-border-subtle
               bg-surface-raised py-0.5 pr-1 pl-1.5 text-xs"
        title={outcome?.text}
      >
        <!-- A code that resolves to nothing is shown as-is rather than hidden: the
             alignment is real data and validation reports it as dangling. -->
        <span class="font-mono">{outcome?.code ?? 'unknown'}</span>
        <button
          type="button"
          class="cursor-pointer rounded px-1 text-text-muted hover:text-danger
                 focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Remove alignment to {outcome?.code ?? id}"
          onclick={() => onchange(selected.filter((existing) => existing !== id))}
        >
          ✕
        </button>
      </span>
    {/each}

    {#if picking}
      <input
        class="w-40 rounded border border-border-subtle bg-surface px-2 py-0.5 text-xs
               focus:border-border-strong focus:outline-2 focus:outline-accent"
        placeholder="Code or words…"
        bind:value={query}
        onblur={() => setTimeout(() => (picking = false), 120)}
        aria-label="Search outcomes"
      />
    {:else}
      <button
        type="button"
        class="cursor-pointer rounded border border-dashed border-border-subtle px-1.5 py-0.5
               text-xs text-text-muted hover:border-border-strong hover:text-text
               focus-visible:outline-2 focus-visible:outline-accent"
        onclick={() => (picking = true)}
        disabled={outcomes.length === 0}
        title={outcomes.length === 0 ? 'Add outcomes to this course first' : 'Align to an outcome'}
      >
        + Align
      </button>
    {/if}
  </div>

  {#if picking && matches.length > 0}
    <ul class="flex flex-col rounded-md border border-border-subtle bg-surface">
      {#each matches as outcome (outcome.id)}
        <li>
          <button
            type="button"
            class="flex w-full cursor-pointer items-baseline gap-2 px-2 py-1 text-left text-xs
                   hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
            onmousedown={() => add(outcome.id)}
          >
            <span class="font-mono text-text">{outcome.code}</span>
            <span class="truncate text-text-muted">{outcome.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
