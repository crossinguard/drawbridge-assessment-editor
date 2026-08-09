<script lang="ts">
  import { activeVault } from '$lib/stores/vault.svelte';
  import { storage } from '$lib/stores/storage.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import StorageNotice from '$lib/components/StorageNotice.svelte';
  import ExportCard from '$lib/components/ExportCard.svelte';

  const vault = $derived(activeVault.draft);

  /*
    Stage 3 shows what the vault is configured with, not what is in it — outcomes,
    collections and rubrics do not exist yet. The coverage summary, recent work and
    warnings the brief asks for land alongside the screens that produce them.
  */
  const config = $derived(vault?.config);
</script>

<svelte:head><title>{vault?.name ?? 'Vault'} — Drawbridge</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5">
  <div>
    <h1 class="text-xl font-semibold tracking-tight">{vault?.name}</h1>
    {#if vault?.description}
      <p class="mt-1 max-w-prose text-sm text-text-muted">{vault.description}</p>
    {/if}
  </div>

  <StorageNotice />

  {#if vault}
    <ExportCard vaultId={vault.id} vaultName={vault.name} />
  {/if}

  <Card title="How this course is set up" description="All of it is editable in Settings.">
    <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Outcome tiers</dt>
        <dd class="mt-0.5 text-sm">
          {config?.outcomeTiers.length ? config.outcomeTiers.join(' → ') : 'None defined'}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Statuses</dt>
        <dd class="mt-0.5 text-sm">
          {config?.statuses.length
            ? config.statuses.map((s) => s.label).join(', ')
            : 'None defined'}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Collection kinds</dt>
        <dd class="mt-0.5 text-sm">
          {config?.collectionKinds.length
            ? config.collectionKinds.map((k) => k.label).join(', ')
            : 'None defined'}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Rubric level sets</dt>
        <dd class="mt-0.5 text-sm">
          {config?.levelSets.length
            ? config.levelSets.map((l) => l.name).join(', ')
            : 'None defined'}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Tag dimensions</dt>
        <dd class="mt-0.5 text-sm">
          {config?.tagDimensions.length
            ? config.tagDimensions.map((t) => t.label).join(', ')
            : 'None defined'}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wide text-text-muted uppercase">Custom fields</dt>
        <dd class="mt-0.5 text-sm">
          {config?.customFields.length ? `${config.customFields.length} defined` : 'None defined'}
        </dd>
      </div>
    </dl>
  </Card>

  <Card title="Storage">
    <p class="text-sm text-text-muted">
      {#if storage.state.supported}
        {storage.state.persisted
          ? 'This browser has marked Drawbridge’s data as permanent.'
          : 'This browser has not marked the data as permanent, so it can be evicted.'}
        Using {storage.usedLabel}.
      {:else}
        This browser does not report storage permanence.
      {/if}
    </p>
  </Card>

  <Card title="Next">
    <p class="text-sm text-text-muted">
      Outcomes, collections and rubrics arrive in the coming stages. Settings is
      deliberately first, because everything downstream reads the vocabularies defined
      there.
    </p>
  </Card>
</div>
