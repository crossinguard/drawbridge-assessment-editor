import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // `fallback` is what makes the client-side routes work. Vault and collection ids
    // live in IndexedDB, so /v/<uuid> cannot exist as a prerendered file — Netlify
    // serves the fallback for it and the router takes over. See src/routes/v/+layout.ts.
    //
    // Named 200.html rather than index.html on purpose: the root route IS prerendered,
    // so an index.html fallback overwrites the real `/` page and the adapter warns
    // about it. Keeping them as separate files means `/` is served directly and only
    // unmatched paths fall through. netlify.toml and static/_redirects both point here.
    adapter: adapter({ fallback: '200.html' })
  }
};

export default config;
