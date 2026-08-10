// Everything under /v is keyed by a vault id that only exists in this browser's
// IndexedDB. The prerenderer has no way to enumerate those ids, so leaving the
// root's `prerender = true` in force here would fail the build the moment a
// [vaultId] route appears.
//
// Turning it off is safe because adapter-static writes `fallback: '200.html'` (see
// svelte.config.js) and that page is served for any unmatched path — by Netlify's
// redirect online, and by the service worker's navigation fallback offline. The
// client router then resolves the real route. Both halves have to point at the same
// file: when they disagreed, a deep link served the prerendered root instead and
// never booted.
export const prerender = false;
