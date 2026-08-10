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
| `pnpm preview` | serves `build/` the way Netlify does; **required** to test the service worker, which does not register in dev |

`pnpm preview` is a small static server (`scripts/serve-build.js`) rather than `vite
preview`. SvelteKit's own preview re-renders the SPA fallback per request, which hides the
service-worker problems this is meant to catch. Rebuild and refresh; it reads from disk each
time, so there is nothing to restart.

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
- [x] Stage 4 — the outcome tree
- [x] Stage 5 — collections and selected-response items
- [x] Stage 6 — export and import
- [x] Stage 7 — rubrics
- [x] Stage 8 — discussion prompts, essays, groups and stimuli
- [x] Stage 9 — coverage and validation
- [x] Stage 10 — Markdown and CSV in the export bundle
- [x] Stage 11 — PWA: offline, installable, update prompt, icons
- [ ] Stage 12 — the in-app guide (next)

You can create courses, configure them, build an outcome hierarchy, and author
choice / multiple-response / true-false / short-answer items with keys, per-option
feedback, points, rationale, outcome alignment, status and sections — plus essays,
discussion prompts with posting requirements, multi-part groups, and shared stimulus
passages that other items read from. Rubrics get a grid editor and can be attached to an
item or to a whole collection. The dashboard summarises coverage, recent work and open
problems; the coverage matrix shows outcome × collection with the gaps called out.

Your work can now leave the browser. **Export** writes a `drawbridge-<code>-<date>.zip` — a
plain zip with a README inside explaining its own layout — and **Import** brings one back,
either as a new course or merged into the matching one. The dashboard says how long it has
been since you last exported.

The bundle holds each course twice over. The JSON is the lossless form and the only thing
import reads. Beside it sit the readable views: each assessment as a Markdown document with
its questions, key and rationale; each rubric as a criteria × levels table; the outcome tree
as a nested list; and two spreadsheets, `items.csv` and `coverage.csv`. Questions are
numbered the same way throughout, so question 4 in the document is row `4.` in the CSV.

Drawbridge installs as an app and runs with no network at all — open it, author, save,
export, offline throughout. When a new version has been deployed it says so in the corner
and waits: nothing reloads until you say so, and accepting writes out anything still being
saved before it does.

Not built yet, both listed in the brief's UI expectations: undo/redo across structured
edits, and the Ctrl/Cmd+K command palette.

Architecture notes and the invariants that matter are in [CLAUDE.md](CLAUDE.md).

## Deployment

Netlify, static publish of `build/`. `netlify.toml` carries the build command, the SPA
fallback and the cache headers the service worker needs.
