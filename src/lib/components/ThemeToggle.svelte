<script lang="ts">
  /*
    Seeded straight from the DOM rather than through an $effect: app.html resolves the
    theme before first paint, so this reads a settled value once. An effect here would
    re-run on unrelated state changes and fight the toggle for ownership of the
    attribute.
  */
  let theme = $state(document.documentElement.dataset.theme ?? 'light');

  function toggle() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('drawbridge:theme', theme);
    } catch {
      // A locked-down profile may refuse localStorage. The toggle still works for this
      // session; it just will not be remembered.
    }
  }
</script>

<button
  class="cursor-pointer rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs
         text-text-muted transition-colors hover:border-border-strong hover:text-text
         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  onclick={toggle}
  title="Switch to {theme === 'light' ? 'dark' : 'light'} theme"
>
  {theme === 'light' ? '☾' : '☀'}
</button>
