import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts and deliberately without the SvelteKit
// plugin. Everything under src/lib/domain and src/lib/repo is plain TypeScript with
// no DOM and no Svelte, so the Kit plugin would add resolution machinery and $app
// aliasing for no benefit. If a component test ever becomes genuinely necessary it
// gets its own project entry with environment: 'jsdom', not a rewrite of this file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts']
  }
});
