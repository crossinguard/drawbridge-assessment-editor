<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  interface Props {
    items: T[];
    row: Snippet<[{ item: T; index: number }]>;
    make: () => T;
    addLabel?: string;
    emptyLabel?: string;
    /** Set false where sequence carries no meaning, e.g. custom field definitions. */
    reorderable?: boolean;
  }

  let {
    items = $bindable(),
    row,
    make,
    addLabel = 'Add',
    emptyLabel = 'Nothing here yet.',
    reorderable = true
  }: Props = $props();

  /*
    Reordering is move up / move down rather than drag and drop. It is keyboard
    reachable for free, it works the same on a trackpad and a locked-down work laptop,
    and the lists it serves are short. Order here is array position — these are config
    arrays, not records with an `order` column.
  */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) next.splice(target, 0, moved);
    items = next;
  }

  function remove(index: number) {
    items = items.filter((_, i) => i !== index);
  }
</script>

<div class="flex flex-col gap-2">
  {#if items.length === 0}
    <p class="py-2 text-sm text-text-muted">{emptyLabel}</p>
  {/if}

  {#each items as item, index (index)}
    <div
      class="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-raised p-2"
    >
      <div class="min-w-0 grow">
        {@render row({ item, index })}
      </div>
      <div class="flex shrink-0 items-center gap-1">
        {#if reorderable}
          <Button
            variant="ghost"
            size="sm"
            title="Move up"
            aria-label="Move up"
            disabled={index === 0}
            onclick={() => move(index, -1)}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Move down"
            aria-label="Move down"
            disabled={index === items.length - 1}
            onclick={() => move(index, 1)}
          >
            ↓
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="sm"
          title="Remove"
          aria-label="Remove"
          onclick={() => remove(index)}
        >
          ✕
        </Button>
      </div>
    </div>
  {/each}

  <div>
    <Button size="sm" onclick={() => (items = [...items, make()])}>+ {addLabel}</Button>
  </div>
</div>
