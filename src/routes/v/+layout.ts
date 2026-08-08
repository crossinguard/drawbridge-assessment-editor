// Everything under /v is keyed by a vault id that only exists in this browser's
// IndexedDB. The prerenderer has no way to enumerate those ids, so leaving the
// root's `prerender = true` in force here would fail the build the moment a
// [vaultId] route appears.
//
// Turning it off is safe because adapter-static writes `fallback: 'index.html'`
// (see svelte.config.js) and Netlify serves that for any unmatched path — the
// client router then resolves the real route. This is the standard SvelteKit SPA
// shape and it is the piece people forget.
export const prerender = false;
