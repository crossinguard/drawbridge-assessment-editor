import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts and deliberately without the SvelteKit
// plugin. Everything under src/lib/domain and src/lib/repo is plain TypeScript with
// no DOM and no Svelte, so the Kit plugin would add resolution machinery and $app
// aliasing for no benefit. If a component test ever becomes genuinely necessary it
// gets its own project entry with environment: 'jsdom', not a rewrite of this file.
//
// The one thing the plugin does provide that is worth keeping is `$lib`, so it is
// declared by hand below. Without it the repo tests fail to resolve their imports.
export default defineConfig({
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
