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
    adapter: adapter({ fallback: '200.html' }),
    paths: {
      /*
        Absolute asset URLs, not relative ones.

        SvelteKit defaults `relative` to true, which writes `./_app/…` into every
        prerendered page and hands Vite a base of `./`. In an app whose routes are
        mostly one and two levels deep and served from a single fallback file, that
        is wrong in two ways at once, and both were silent:

        - the service worker registered `./sw.js` with scope `./`, so opening the app
          at /v/<id> tried to register a worker under /v/<id>/ — it never registered
          at all, and the offline-first app quietly had no offline support unless you
          happened to arrive at the root first;
        - the prerendered root, if anything ever served it for a deeper URL, asked
          for /v/<id>/_app/… and never booted.

        Absolute paths cost us the ability to serve from a subdirectory, which this
        app does not do: it is published at the root of its own Netlify site.
      */
      relative: false
    }
  }
};

export default config;
