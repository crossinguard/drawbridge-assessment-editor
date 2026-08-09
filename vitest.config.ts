import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/*
  Deliberately separate from vite.config.ts, and deliberately WITHOUT the SvelteKit
  plugin — domain and repo tests are plain TypeScript with no DOM, and Kit's routing
  and $app aliasing would buy nothing.

  The plain Svelte plugin is here for a narrower reason: store logic lives in
  `.svelte.ts` files that use runes, and those need compiling before they can be
  imported. That is what lets `stores/autosave.test.ts` exist, and that test pins a
  silent data-loss bug — worth the one plugin.

  `$lib` is declared by hand because it comes from Kit, which is not loaded here.
*/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts']
  }
});
