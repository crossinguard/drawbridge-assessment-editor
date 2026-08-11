<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { DISABLED, FOCUS_RING, HIT } from './styles';

  /*
    A button whose whole label is an icon.

    `aria-label` is a REQUIRED prop, not an optional one. These buttons have no text, so
    without it a screen reader announces "button" and nothing else — and there is no
    linter in this repo to catch that. Making it required means `pnpm check` fails on the
    call site instead, which is the gate doing the work.

    `type="button"` is set here and cannot be overridden by accident. A bare <button>
    defaults to `submit`, which is harmless until one of these lands inside a form.
  */

  interface Props extends Omit<HTMLButtonAttributes, 'aria-label' | 'type'> {
    name: IconName;
    'aria-label': string;
    /** `danger` tints on hover only — a destructive control should not shout at rest. */
    tone?: 'default' | 'danger';
  }

  let { name, tone = 'default', class: extra = '', ...rest }: Props = $props();

  const tones = {
    default: 'text-text-muted hover:bg-surface-raised hover:text-text',
    danger: 'text-text-muted hover:bg-surface-raised hover:text-danger'
  };
</script>

<button
  type="button"
  class="{HIT} {FOCUS_RING} {DISABLED} cursor-pointer transition-colors {tones[tone]} {extra}"
  {...rest}
>
  <Icon {name} />
</button>
