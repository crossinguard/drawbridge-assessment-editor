<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    description?: string;
    actions?: Snippet;
    children: Snippet;
  }

  let { title, description, actions, children }: Props = $props();
</script>

<section class="rounded-lg border border-border-subtle bg-surface">
  {#if title}
    <header
      class="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3"
    >
      <div>
        <h2 class="text-sm font-semibold text-text">{title}</h2>
        {#if description}
          <p class="mt-0.5 max-w-prose text-xs text-text-muted">{description}</p>
        {/if}
      </div>
      {#if actions}
        <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
      {/if}
    </header>
  {/if}
  <div class="p-4">
    {@render children()}
  </div>
</section>
