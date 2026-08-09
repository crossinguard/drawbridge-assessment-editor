<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { collections } from '$lib/stores/collections.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const vault = $derived(activeVault.draft);

  $effect(() => {
    void collections.load(vaultId);
  });

  let creating = $state(false);
  let title = $state('');
  let kind = $state('');

  // Kinds come from vault config, and the picker defaults to whatever is listed first.
  // Nothing here knows what a "quiz" is.
  const kinds = $derived(vault?.config.collectionKinds ?? []);
  $effect(() => {
    if (!kind && kinds.length > 0) kind = kinds[0]!.key;
  });

  const grouped = $derived.by(() => {
    const byKind = new Map<string, typeof collections.items>();
    for (const collection of collections.items) {
      const existing = byKind.get(collection.kind);
      if (existing) existing.push(collection);
      else byKind.set(collection.kind, [collection]);
    }
    for (const list of byKind.values()) list.sort((a, b) => a.order - b.order);
    return byKind;
  });

  const labelFor = (key: string) =>
    kinds.find((entry) => entry.key === key)?.label ?? key;

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim() || !kind) return;
    const collection = await collections.create({ kind, title: title.trim() });
    title = '';
    creating = false;
    await goto(`/v/${vaultId}/c/${collection.id}`);
  }
</script>

<svelte:head><title>Collections — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Collections</h1>
    <p class="mt-1 max-w-prose text-sm text-text-muted">
      Item banks, quizzes, exams, tasks and discussion sets are the same thing with a
      different kind on them.
    </p>
  </header>

  {#if collections.status === 'loading'}
    <p class="text-sm text-text-muted">Loading…</p>
  {:else if collections.items.length === 0}
    <p
      class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted"
    >
      Nothing here yet.
    </p>
  {:else}
    {#each [...grouped] as [kindKey, list] (kindKey)}
      <section class="flex flex-col gap-2">
        <h2 class="text-xs font-medium tracking-wide text-text-muted uppercase">
          {labelFor(kindKey)}
        </h2>
        <ul class="flex flex-col gap-2">
          {#each list as collection (collection.id)}
            <li>
              <a
                href="/v/{vaultId}/c/{collection.id}"
                class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle
                       bg-surface px-4 py-3 transition-colors hover:border-border-strong
                       hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-accent"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{collection.title}</span>
                  {#if collection.description}
                    <span class="block truncate text-xs text-text-muted">
                      {collection.description}
                    </span>
                  {/if}
                </span>
                <span aria-hidden="true" class="text-text-muted">→</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}

  <section class="rounded-lg border border-border-subtle bg-surface p-4">
    {#if creating}
      <form class="flex flex-col gap-3" onsubmit={create}>
        <div class="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Title">
            {#snippet children({ id })}
              <TextInput {id} bind:value={title} placeholder="Unit 1 Test" required />
            {/snippet}
          </Field>
          <Field label="Kind">
            {#snippet children({ id })}
              <select
                {id}
                class="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5
                       text-sm focus:border-border-strong focus:outline-2 focus:outline-accent"
                bind:value={kind}
              >
                {#each kinds as entry (entry.key)}
                  <option value={entry.key}>{entry.label}</option>
                {/each}
              </select>
            {/snippet}
          </Field>
        </div>
        <div class="flex items-center gap-2">
          <Button type="submit" variant="primary">Create</Button>
          <Button type="button" variant="ghost" onclick={() => (creating = false)}>Cancel</Button>
        </div>
      </form>
    {:else if kinds.length === 0}
      <p class="text-sm text-text-muted">
        This course has no collection kinds defined. Add some in
        <a class="text-accent underline" href="/v/{vaultId}/settings">Settings</a> first.
      </p>
    {:else}
      <Button variant="primary" onclick={() => (creating = true)}>+ New collection</Button>
    {/if}
  </section>
</div>
