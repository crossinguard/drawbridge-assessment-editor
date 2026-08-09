<script lang="ts">
  import { storage } from '$lib/stores/storage.svelte';

  /*
    Honest about eviction risk. If the browser has not granted persistent storage it
    may clear this data whenever it feels short of disk, without warning. Saying
    nothing, or saying something reassuring, would be the wrong call for an app that
    holds the only copy of a term's work.
  */
  let { compact = false }: { compact?: boolean } = $props();
</script>

{#if storage.asked && storage.state.supported && !storage.state.persisted}
  <div
    class="rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-xs text-text-muted"
  >
    <span class="font-medium text-warning">Storage is not marked permanent.</span>
    {#if !compact}
      This browser may clear Drawbridge's data if it runs short on disk. Export a bundle
      after any session you would not want to redo.
    {/if}
  </div>
{:else if storage.asked && !storage.state.supported}
  <div
    class="rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-xs text-text-muted"
  >
    This browser does not report storage permanence, so there is no way to tell whether
    the data is safe from eviction. Export regularly.
  </div>
{/if}
