// Every byte of this app runs in the browser: the data lives in IndexedDB and there
// is no server to render against. `ssr = false` makes that explicit rather than
// letting a component fail the first time it touches `indexedDB` during a build.
export const ssr = false;

// Prerender the static shell. Routes that cannot be enumerated at build time opt
// out individually — see src/routes/v/+layout.ts.
export const prerender = true;
