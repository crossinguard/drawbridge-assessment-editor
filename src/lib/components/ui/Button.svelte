<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { DISABLED, FOCUS_RING } from './styles';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    /** The underlying element, for the rare caller that has to move focus back to it. */
    ref?: HTMLButtonElement | null;
    children: Snippet;
  }

  /*
    `type` defaults to `button`, not to the HTML default of `submit`.

    Nearly every use here is an action, not a form submission; the three that do submit
    say `type="submit"` explicitly. Leaving the HTML default in place meant a plain
    <Button> dropped into a form would submit it, and the symptom — a page that reloads
    instead of doing the thing — gives no clue where it came from.
  */
  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    ref = $bindable(null),
    children,
    class: extra = '',
    ...rest
  }: Props = $props();

  const variants = {
    primary: 'bg-accent text-accent-text hover:opacity-90',
    secondary:
      'bg-surface text-text border border-border-subtle hover:border-border-strong hover:bg-surface-raised',
    ghost: 'text-text-muted hover:text-text hover:bg-surface-raised',
    danger: 'text-danger border border-border-subtle hover:bg-surface-raised hover:border-danger'
  };

  // Both sizes clear a 28px target: `sm` is 20px of text plus 8px of padding.
  const sizes = { sm: 'min-h-7 px-2.5 py-1 text-xs', md: 'min-h-8 px-3 py-1.5 text-sm' };
</script>

<button
  bind:this={ref}
  {type}
  class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium
         transition-colors {FOCUS_RING} {DISABLED}
         {variants[variant]} {sizes[size]} {extra}"
  {...rest}
>
  {@render children()}
</button>
