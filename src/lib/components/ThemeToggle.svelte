<script lang="ts">
  import IconButton from '$lib/components/ui/IconButton.svelte';

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

<!--
  The label is the action, not the state. "Switch to dark theme" tells you what pressing
  it does; a moon glyph alone told a screen reader nothing at all, since this was the one
  button in the app with neither an aria-label nor text.
-->
<IconButton
  name={theme === 'light' ? 'moon' : 'sun'}
  class="border border-border-subtle bg-surface hover:border-border-strong"
  onclick={toggle}
  title="Switch to {theme === 'light' ? 'dark' : 'light'} theme"
  aria-label="Switch to {theme === 'light' ? 'dark' : 'light'} theme"
/>
