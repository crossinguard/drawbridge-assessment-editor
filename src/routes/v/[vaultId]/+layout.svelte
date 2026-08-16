<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { journal } from '$lib/stores/journal.svelte';
  import { storage } from '$lib/stores/storage.svelte';
  import { undo } from '$lib/stores/undo.svelte';
  import SaveIndicator from '$lib/components/SaveIndicator.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let { children } = $props();

  const vaultId = $derived(page.params.vaultId ?? '');

  /*
    Opening the vault is a side effect of the route, so it belongs in an effect — but
    it must depend on the id and nothing else. Reading `activeVault.draft` in here
    would make every keystroke in settings re-open the vault and throw away the draft.
  */
  $effect(() => {
    void activeVault.open(vaultId);
  });

  /*
    `Ctrl+Z` belongs to the TEXT FIELD whenever the cursor is in one.

    Every screen in this app is mostly textareas, and the browser's own undo inside one
    is finer-grained than anything here could be — it works a word at a time, where a
    journal entry is a whole record. Taking the shortcut from it would trade a good undo
    for a coarse one at exactly the moment the user wanted the good one.

    So the shortcut only reaches the journal when focus is somewhere else, which is also
    where it is useful: you have just clicked a delete button, and the thing you want
    back is the record, not the last word you typed.
  */
  function editingText(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    );
  }

  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() !== 'z') return;
    if (editingText(event.target)) return;

    event.preventDefault();
    if (event.shiftKey) void undo.redoLast(vaultId);
    else void undo.undoLast(vaultId);
  }

  onMount(() => {
    void storage.refresh();
    // Anything still debounced when the tab closes would otherwise be lost. This is a
    // best-effort flush: browsers do not guarantee async work during unload, which is
    // the other reason the debounce is short.
    const flush = () => void activeVault.flush();
    window.addEventListener('pagehide', flush);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  const nav = $derived([
    { href: `/v/${vaultId}`, label: 'Dashboard', exact: true },
    { href: `/v/${vaultId}/outcomes`, label: 'Outcomes', exact: false },
    { href: `/v/${vaultId}/collections`, label: 'Collections', exact: false },
    { href: `/v/${vaultId}/rubrics`, label: 'Rubrics', exact: false },
    { href: `/v/${vaultId}/coverage`, label: 'Coverage', exact: false },
    { href: `/v/${vaultId}/changes`, label: 'Changes', exact: false },
    { href: `/v/${vaultId}/settings`, label: 'Settings', exact: false }
  ]);

  const current = $derived(page.url.pathname);

  /*
    A notice from an undo that has run its course. Cleared on navigation so a refusal
    read on the changes screen does not follow the user around the app; a `Ctrl+Z`
    that does not navigate leaves it up, which is the point of it.
  */
  $effect(() => {
    void current;
    journal.notice = null;
  });
</script>

{#if activeVault.status === 'error'}
  <main class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6">
    <h1 class="text-lg font-semibold">Vault not found</h1>
    <p class="text-sm text-text-muted">{activeVault.error}</p>
    <p class="text-sm"><a class="text-accent underline" href="/">Back to courses</a></p>
  </main>
{:else if activeVault.status === 'ready' && activeVault.draft}
  <div class="flex min-h-screen flex-col lg:flex-row">
    <aside
      class="flex shrink-0 flex-col gap-4 border-b border-border-subtle bg-surface px-4 py-4
             lg:w-60 lg:border-r lg:border-b-0"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <a
            href="/"
            class="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            ← Courses
          </a>
          <h1 class="mt-1 truncate text-sm font-semibold text-text">
            {activeVault.draft.name}
          </h1>
          <p class="truncate text-xs text-text-muted">
            {activeVault.draft.code}{activeVault.draft.term ? ` · ${activeVault.draft.term}` : ''}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <nav class="flex gap-1 lg:flex-col">
        {#each nav as link (link.href)}
          {@const active = link.exact ? current === link.href : current.startsWith(link.href)}
          <a
            href={link.href}
            class="rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-accent
                   {active
              ? 'bg-surface-raised font-medium text-text'
              : 'text-text-muted hover:bg-surface-raised hover:text-text'}"
            aria-current={active ? 'page' : undefined}
          >
            {link.label}
          </a>
        {/each}
      </nav>

      <div class="mt-auto hidden lg:flex lg:items-center lg:justify-between lg:gap-2">
        <SaveIndicator saver={activeVault.saver} />
        <a
          href="/help"
          class="rounded px-1.5 py-1 text-xs text-text-muted underline-offset-2
                 hover:text-text hover:underline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Guide
        </a>
      </div>
    </aside>

    <main class="min-w-0 grow bg-canvas px-4 py-6 lg:px-8">
      <!--
        What the last undo did, or would not do.

        A live region, and it has to be: `Ctrl+Z` works from every screen here, and one
        that silently declines — because something newer touched the same record — is
        indistinguishable from one the app never received. It stays until the next
        action or the next navigation rather than fading, for the same reason the save
        indicator's errors do.
      -->
      {#if journal.notice}
        <p
          role="status"
          aria-live="polite"
          class="mb-4 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm
                 text-text-muted"
        >
          {journal.notice}
        </p>
      {/if}
      {@render children()}
    </main>
  </div>
{:else}
  <main class="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6">
    <p class="text-sm text-text-muted">Opening…</p>
  </main>
{/if}
