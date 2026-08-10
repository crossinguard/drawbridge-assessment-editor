import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Injected rather than imported: importing package.json would pull the whole file,
  // dependency list and all, into the client bundle just to read one string.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      // `prompt`, not `autoUpdate`: this app holds the only copy of the user's work,
      // so a new service worker must never activate under a live editing session.
      registerType: 'prompt',
      // Registration happens by hand in src/routes/+layout.svelte. SvelteKit owns
      // <head>, so the plugin cannot inject its own script tag anyway; leaving this
      // on just emits a registerSW.js that nothing loads.
      injectRegister: null,
      /*
        Which page the service worker hands back for a URL it has no file for —
        i.e. every route under /v, whose ids live in IndexedDB.

        Without this the plugin defaults `navigateFallback` to `base` ('/') and
        serves the PRERENDERED ROOT for a deep link. That document addresses its
        assets relatively and derives `base` from `location`, so at /v/<id>/settings
        it asks for /v/<id>/_app/… , gets four 404s, and never boots. A blank page,
        no error banner, on the URL somebody bookmarked.

        `200.html` is the adapter's fallback page and the only one written with
        absolute asset paths, which is exactly why netlify.toml redirects to it.
        `spa: true` is what gets it into the precache manifest: adapter-static writes
        it after this plugin has already generated the service worker, so the plugin
        takes its revision from _app/version.json instead of hashing the file.
      */
      kit: { adapterFallback: '200.html', spa: true },
      manifest: {
        name: 'Drawbridge',
        short_name: 'Drawbridge',
        description: 'Author and manage course assessments, offline.',
        theme_color: '#1b3a5c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // A separate file, not the same one relabelled. A maskable icon is cropped
          // to whatever shape the launcher uses, so it needs the mark inset into the
          // middle 80% — pointing this at icon-512.png took the road off both banks.
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // The whole app shell is precached; there is no runtime caching to configure
        // because the app makes no network calls at all after load.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    })
  ]
});
