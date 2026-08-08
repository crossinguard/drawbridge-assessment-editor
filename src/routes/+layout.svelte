<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { pwaInfo } from 'virtual:pwa-info';

  let { children } = $props();

  // @vite-pwa/sveltekit does not inject the manifest link itself — SvelteKit owns
  // <head>, so the plugin hands us the tag and we place it. Without this the app
  // renders fine and is simply not installable, which is easy to miss.
  // The markup comes from the plugin, not from user content.
  const webManifestLink = pwaInfo?.webManifest?.linkTag ?? '';

  onMount(async () => {
    // Registration is deliberately manual and deliberately `prompt` type (see
    // vite.config.ts): this app holds the only copy of the user's work, so a
    // service worker must never swap itself in mid-edit. Stage 11 turns the
    // callbacks below into a real "a new version is ready" affordance; until
    // then the update simply waits for the next cold load.
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  });
</script>

<svelte:head>
  {@html webManifestLink}
</svelte:head>

<div class="min-h-screen bg-canvas text-text">
  {@render children()}
</div>
