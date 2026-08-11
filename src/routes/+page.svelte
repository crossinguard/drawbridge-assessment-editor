<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { vaultList } from '$lib/stores/vaults.svelte';
  import { storage } from '$lib/stores/storage.svelte';
  import { backup } from '$lib/stores/backup.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import StorageNotice from '$lib/components/StorageNotice.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import ImportPanel from '$lib/components/ImportPanel.svelte';

  let creating = $state(false);
  let name = $state('');
  let code = $state('');
  let term = $state('');
  let busy = $state(false);
  let sampleError = $state<string | null>(null);

  async function loadSample() {
    sampleError = null;
    const outcome = await backup.loadSample();
    if (outcome.fatal || !outcome.vaultId) {
      sampleError = outcome.fatal ?? 'The sample course could not be loaded.';
      return;
    }
    await vaultList.load();
    await goto(`/v/${outcome.vaultId}`);
  }

  onMount(async () => {
    // First run is where persistence has to be requested: Firefox shows a prompt, and
    // a prompt on the very first screen is at least explicable.
    await storage.ensure();
    await vaultList.load();
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || !code.trim()) return;
    busy = true;
    try {
      const vault = await vaultList.create({
        name: name.trim(),
        code: code.trim(),
        ...(term.trim() ? { term: term.trim() } : {})
      });
      await goto(`/v/${vault.id}`);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Drawbridge</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Drawbridge</h1>
      <p class="mt-1 text-sm text-text-muted">
        Course assessments, authored and kept aligned. Everything stays in this browser.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <a
        href="/help"
        class="rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors
               hover:bg-surface-raised hover:text-text focus-visible:outline-2
               focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Guide
      </a>
      <ThemeToggle />
    </div>
  </header>

  <StorageNotice />

  {#if vaultList.status === 'loading'}
    <p class="text-sm text-text-muted">Opening…</p>
  {:else if vaultList.status === 'error'}
    <p class="text-sm text-danger">Could not read local storage: {vaultList.error}</p>
  {:else}
    <section class="flex flex-col gap-2">
      <h2 class="text-xs font-medium tracking-wide text-text-muted uppercase">Courses</h2>

      {#if vaultList.items.length === 0}
        <p class="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted">
          No courses yet. Create one below to get started.
        </p>
      {:else}
        <!--
          The row is a container with links inside it, not one big link. Nesting a
          button or a second anchor inside an anchor is invalid, and browsers resolve it
          by guessing.
        -->
        <ul class="flex flex-col gap-2">
          {#each vaultList.items as vault (vault.id)}
            <li
              class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border
                     border-border-subtle bg-surface px-4 py-3 transition-colors
                     hover:border-border-strong hover:bg-surface-raised"
            >
              <a
                href="/v/{vault.id}"
                class="min-w-0 grow rounded-md focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-accent"
              >
                <span class="block truncate text-sm font-medium text-text">{vault.name}</span>
                <span class="block truncate text-xs text-text-muted">
                  {vault.code}{vault.term ? ` · ${vault.term}` : ''}
                </span>
              </a>
              <span class="flex shrink-0 items-center gap-1">
                <a
                  href="/v/{vault.id}/clone"
                  class="rounded-md px-2 py-1 text-xs text-text-muted transition-colors
                         hover:bg-surface-raised hover:text-text focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Copy…
                </a>
                <!--
                  A link to the settings screen's own delete block, not a second
                  implementation of deleting. That block asks for the course code typed
                  out, and two confirmations that drift apart is how the weaker one ends
                  up being the one that runs.
                -->
                <a
                  href="/v/{vault.id}/settings#delete"
                  class="rounded-md px-2 py-1 text-xs text-text-muted transition-colors
                         hover:bg-surface-raised hover:text-danger focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Delete…
                </a>
                <span aria-hidden="true" class="pl-1 text-text-muted">→</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="rounded-lg border border-border-subtle bg-surface p-4">
      {#if creating}
        <form class="flex flex-col gap-3" onsubmit={create}>
          <div class="grid gap-3 sm:grid-cols-3">
            <Field label="Course name">
              {#snippet children({ id })}
                <TextInput {id} bind:value={name} placeholder="Introductory Statistics" required />
              {/snippet}
            </Field>
            <Field label="Code">
              {#snippet children({ id })}
                <TextInput {id} bind:value={code} placeholder="STAT101" required />
              {/snippet}
            </Field>
            <Field label="Term">
              {#snippet children({ id })}
                <TextInput {id} bind:value={term} placeholder="Fall 2026" />
              {/snippet}
            </Field>
          </div>
          <div class="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>Create course</Button>
            <Button type="button" variant="ghost" onclick={() => (creating = false)}>Cancel</Button>
          </div>
        </form>
      {:else}
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="primary" onclick={() => (creating = true)}>+ New course</Button>
          <!--
            Beside "new course" rather than beside "import", because it is the answer to
            "what does this thing do", not to "I have a file".
          -->
          <Button disabled={backup.busy} onclick={loadSample}>
            {backup.busy ? 'Loading…' : 'Load a sample course'}
          </Button>
        </div>
        <p class="mt-2 text-xs text-text-muted">
          A worked statistics course — outcomes, a quiz, an exam, a discussion and a
          rubric-scored task. It is an ordinary course: edit it, export it, delete it.
        </p>
        {#if sampleError}
          <p class="mt-2 text-xs text-danger">{sampleError}</p>
        {/if}
      {/if}
    </section>

    <section class="rounded-lg border border-border-subtle bg-surface p-4">
      <h2 class="text-sm font-semibold">Import a bundle</h2>
      <p class="mt-0.5 mb-3 text-xs text-text-muted">
        A <code class="font-mono">drawbridge-*.zip</code> exported from here or from another
        machine.
      </p>
      <ImportPanel />
    </section>
  {/if}
</main>
