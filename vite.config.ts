import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
      manifest: {
        name: 'Drawbridge',
        short_name: 'Drawbridge',
        description: 'Author and manage course assessments, offline.',
        theme_color: '#1b3a5c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
