<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    children: Snippet;
  }

  let { variant = 'secondary', size = 'md', children, class: extra = '', ...rest }: Props =
    $props();

  const variants = {
    primary: 'bg-accent text-accent-text hover:opacity-90',
    secondary:
      'bg-surface text-text border border-border-subtle hover:border-border-strong hover:bg-surface-raised',
    ghost: 'text-text-muted hover:text-text hover:bg-surface-raised',
    danger: 'text-danger border border-border-subtle hover:bg-surface-raised hover:border-danger'
  };

  const sizes = { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm' };
</script>

<button
  class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium
         transition-colors focus-visible:outline-2 focus-visible:outline-offset-2
         focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45
         {variants[variant]} {sizes[size]} {extra}"
  {...rest}
>
  {@render children()}
</button>
