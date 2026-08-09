# Drawbridge

A private, local-first web app for authoring and managing course assessments — unit tests,
quizzes, discussion prompts, rubric-assessed tasks — kept aligned to a course outcome
hierarchy.

It never administers an assessment and never grades one. It is where assessments get
written, organised, aligned, reviewed and revised.

## Running it

```bash
pnpm install
pnpm dev
```

| command | what it does |
| --- | --- |
| `pnpm dev` | dev server on http://localhost:5173 |
| `pnpm check` | svelte-check with strict TypeScript — a required gate |
| `pnpm test` | vitest — a required gate |
| `pnpm build` | static site into `build/` |
| `pnpm preview` | serves the build; **required** to test the service worker, which does not register in dev |

Note: `vite preview` caches its file listing at startup, so restart it after every `pnpm
build` or it will 404 the newly hashed bundles.

## Where the data lives

In your browser, in IndexedDB, and nowhere else. There is no server, no account and no
network call. That is the point, and it is also the risk — export early and often once
Stage 6 lands.

## Status

Under construction, following the staged build order in
[drawbridge-redux-plan.md](drawbridge-redux-plan.md).

- [x] Stage 0 — scaffold, theming, PWA, deploy config
- [x] Stage 1 — domain model, points, coverage, validation
- [x] Stage 2 — repository port and IndexedDB adapter
- [x] Stage 3 — vaults, and the settings screen for vocabularies and custom fields
- [ ] Stage 4 — outcomes (next)
- [ ] Stages 5–12 — see the brief

You can create courses and configure them. Outcomes, collections, items and rubrics arrive
next; settings came first because everything downstream reads the vocabularies defined
there.

Architecture notes and the invariants that matter are in [CLAUDE.md](CLAUDE.md).

## Deployment

Netlify, static publish of `build/`. `netlify.toml` carries the build command, the SPA
fallback and the cache headers the service worker needs.
