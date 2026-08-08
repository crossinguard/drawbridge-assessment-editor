<script lang="ts">
  // Stage 0 placeholder. The vault list replaces this in Stage 3.
  //
  // Seeded straight from the DOM rather than through an $effect: app.html has
  // already resolved the theme before first paint, so this is a one-time read of
  // a settled value. An effect here would re-run on unrelated state changes and
  // fight the toggle for ownership.
  let theme = $state(document.documentElement.dataset.theme ?? 'light');

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('drawbridge:theme', theme);
    } catch {
      // A locked-down profile may refuse localStorage; the toggle still works
      // for this session, it just will not be remembered.
    }
  }
</script>

<svelte:head>
  <title>Drawbridge</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Drawbridge</h1>
    <p class="mt-2 text-text-muted">
      Author and manage course assessments. Everything stays in this browser.
    </p>
  </div>

  <div class="rounded-lg border border-border-subtle bg-surface p-5">
    <p class="text-sm text-text-muted">
      Scaffold only. The vault list lands in Stage 3.
    </p>
    <button
      class="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-text"
      onclick={toggleTheme}
    >
      Switch to {theme === 'light' ? 'dark' : 'light'} theme
    </button>
  </div>
</main>
