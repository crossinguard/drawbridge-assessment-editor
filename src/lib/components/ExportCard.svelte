<script lang="ts">
  import { onMount } from 'svelte';
  import { backup } from '$lib/stores/backup.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    vaultId: string;
    vaultName: string;
  }

  let { vaultId, vaultName }: Props = $props();

  onMount(() => backup.load());

  const days = $derived(backup.daysSinceExport(vaultId));

  /*
    The nudge. Deliberately not a modal and not a red banner — it appears on the
    dashboard, states a fact, and offers the button that fixes it.

    "Never" is treated as the most urgent case rather than a neutral one, because a
    vault that has never been exported is exactly the one where a cleared cache costs
    a term.
  */
  const tone = $derived(days === null ? 'urgent' : days >= 14 ? 'urgent' : days >= 7 ? 'soft' : 'calm');

  const message = $derived(
    days === null
      ? 'This course has never been exported from this browser.'
      : days === 0
        ? 'Exported today.'
        : days === 1
          ? 'Exported yesterday.'
          : `Last exported ${days} days ago.`
  );
</script>

<Card
  title="Backup"
  description="A bundle is a plain zip of plain JSON. It is the only copy of this work that lives outside this browser."
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p
      class="text-sm {tone === 'urgent'
        ? 'text-warning'
        : tone === 'soft'
          ? 'text-text'
          : 'text-text-muted'}"
    >
      {message}
    </p>

    <div class="flex items-center gap-2">
      <Button variant="primary" disabled={backup.busy} onclick={() => backup.exportVault(vaultId)}>
        {backup.busy ? 'Exporting…' : `Export ${vaultName}`}
      </Button>
    </div>
  </div>

  {#if backup.error}
    <p class="mt-2 text-xs text-danger">{backup.error}</p>
  {/if}
</Card>
