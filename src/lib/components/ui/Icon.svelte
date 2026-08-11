<script lang="ts">
  import { ICONS, type IconName } from './icons';

  /*
    Decorative by construction. The icon never carries the accessible name — `IconButton`
    requires an `aria-label` for that — so this is always `aria-hidden`. An icon that
    announced itself as well would read the action out twice.
  */

  interface Props {
    name: IconName;
    /** Extra classes, for the rare case that wants a size other than 16px. */
    class?: string;
  }

  let { name, class: extra = '' }: Props = $props();
</script>

<svg
  viewBox="0 0 16 16"
  class="pointer-events-none size-4 shrink-0 {extra}"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as d (d)}
    <path {d} />
  {/each}
</svg>
