# Drawbridge — agent context

A private, local-first web app for authoring and managing course assessments: unit tests,
quizzes, discussion prompts, rubric-assessed tasks. It replaces writing all of that in Word.

**The centre of gravity is information management, not delivery.** This app never
administers an assessment to a student and never grades one. It is where assessments are
written, organised, aligned to outcomes, reviewed and revised.

The full build brief is [drawbridge-redux-plan.md](drawbridge-redux-plan.md). Read it before
making structural decisions; this file is the running distillation, not a replacement.

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # svelte-kit sync + svelte-check — a required gate
pnpm test         # vitest — a required gate
pnpm build        # static site into build/
pnpm preview      # serve the build; required to test the service worker (it does not register in dev)
```

`pnpm check` and `pnpm test` are the **only** automated gates and both must be clean before a
stage is done. There is deliberately no linter.

## Hard constraints

- **No backend.** No server, no database, no account, no telemetry, no network calls. The app
  is static files; Netlify only serves them.
- **Offline-first.** Installable as a PWA, fully functional with no network.
- **Runs on a locked-down Windows work machine** (browser only, no installs) and on Linux at
  home. That is why it is a web app and not a native one.
- **Will eventually become a Tauri desktop app.** Architect for that now, build it now only
  where it costs nothing — which in practice means the `Repository` port.
- **No vendor lock.** What leaves the app is plain zip, plain JSON with a published schema,
  plain Markdown, plain CSV.

Out of scope, deliberately: `.docx` export, LMS interchange (QTI/Moodle/GIFT), student
delivery, grading, submissions, analytics, multi-user, sync, cloud.

## Principles

These are load-bearing. Each has cost someone something.

**Vocabularies are always data.** Statuses, collection kinds, rubric level sets, outcome tier
names, tag dimensions — all defined per vault in `VaultConfig` and edited by the user. Never
special-case a particular status or kind in code. A course that invents a new one must not
need a code change. Concretely: never write `if (status === 'ready')` or `kind === 'quiz'`.

**Custom fields round-trip untouched.** Any field the app does not recognise is preserved
exactly through load, edit, export and import. This is *the* extension seam, and it works at
two levels — the explicit `fields` bag for user-defined fields, and loose object parsing so
unknown top-level keys from another version survive. See `domain/schema.ts`.

**Validation never blocks.** An assessment sits half-written for weeks. Rules surface in a
panel; nothing prevents a save, closes a view, or rewrites content. There is no such thing as
an invalid document here, only a document with open problems.

**A rubric criterion is worth its best level, not the sum of its levels.** Levels are
alternatives. A multi-part item *is* the sum of its parts. Say so in the UI — write
"worth up to 4 pt" — so nobody reports it as a bug.

**Items belong to exactly one collection.** Ownership, not reference. No shared item pool and
no reference indirection in v1. "Copy items to…" makes independent copies that then diverge,
which is the intended behaviour. But keep `Item` free of the assumption that its collection
is its only context — a later assembly layer may draw one item into several forms.

**Storage is behind an interface.** All persistence goes through the `Repository` port. The
Dexie adapter is the only implementation today; a filesystem adapter replaces it for the
desktop build without touching anything above. **Nothing above `repo/` may import Dexie.**

**The export bundle is self-describing.** It carries a `README.md` explaining its own layout
and a `manifest.json` with a schema version. Someone who finds the zip in five years should
understand it without the app.

**Data lives only in the browser.** Call `navigator.storage.persist()` on first run, surface
the result honestly, and make export easy and obvious. Losing a term's work to a cleared
cache would be unforgivable.

**Ask before inventing scope.** "Grows with me" means an extension seam, not every feature
built up front.

## Architecture, in dependency order

```
src/lib/
  domain/     Zod schemas, derived types, pure computations (points, coverage,
              validation, id remapping). Depends on nothing.
  repo/       The Repository port + the Dexie adapter. The only module that knows
              IndexedDB exists.
  export/     Bundle writer and reader: zip, JSON, Markdown, CSV. Depends on domain only.
  stores/     Svelte runes tying the above to the UI.
  components/ UI. Reads stores, calls repo, renders domain.
src/routes/   SvelteKit routes.
```

`domain/` must stay pure and DOM-free so it can be tested headlessly. **It must never import
from `repo/`, `stores/`, or anything Svelte.** This single rule is what keeps the model
testable, and the model is the most expensive thing to get wrong.

`src/lib/domain/schema.ts` is the contract: import validation, defaults and TypeScript types
all come from there via `z.infer`. Do not declare a domain type by hand anywhere else. The
one exception is `Item`, which cannot be inferred — TypeScript will not infer a schema that
appears in its own initialiser — and is declared beside its schema with the reason recorded.

### Repository invariants

**`put` writes verbatim; `update` stamps `updatedAt`.** Import depends on the first: a
restored bundle whose timestamps had been rewritten would no longer match what was exported,
and "restore a backup" would stop being a faithful operation. Use `update` for editing.

**A `group` item's parts are not rows.** They live in the parent's `parts` array, so the
`items` table holds top-level items only and `items.get()` cannot find a part by id. This
keeps a group's ordering in exactly one place — parts as sibling rows would let row order and
array order disagree, and one of them would always be silently wrong.

**Export must never be able to fail.** It is the data-rescue path. Do not put validation, or
anything else that can throw on unexpected input, in front of `exportVault`. (A consequence:
JSON key order in a bundle depends on whether a record was created here or came in through an
import, since Zod reconstructs objects in schema order. That is cosmetic — JSON key order
carries no meaning — and is not worth trading the guarantee above to fix.)

**Deleting cascades.** Removing a collection removes its items; `deleteVault` removes
everything beneath it. Anything that adds a new owned entity has to extend both.

### Store and UI invariants

**Everything crossing into the repository goes through `plain()`** (`stores/plain.svelte.ts`).
`$state` hands out a Proxy and IndexedDB writes through structured clone, which throws on
one. The symptom is a `DataCloneError` at write time, which reads as a storage problem and
sends you looking in the wrong layer entirely.

**Autosave needs its baseline accepted after a load.** `Autosave.accept(value)` records what
is already stored. Without it, the first run of the effect that watches a freshly loaded
record writes it straight back, bumping `updatedAt` and flashing "Saved" when nothing
changed.

**The settings autosave effect reads the draft deeply, on purpose.** Calling `plain(draft)`
inside it is what makes a level's points three objects down re-run the effect. A shallow
read there would mean edits inside `config` never reach storage — and nothing would report
it, because the screen would still show the change.

**But the route effect that opens a vault must depend on the id and nothing else.** Reading
`activeVault.draft` in that effect would make every keystroke in settings re-open the vault
and discard the draft. This is the `$effect` trap above, in its most expensive form.

**There is no save button, so `SaveIndicator` is load-bearing.** It reports `saved` strictly
after a write resolves, keeps errors visible rather than fading them, and will not report
"saved" over the top of an edit that queued while a write was in flight.

**Queue the content you want written, never a handle to it.** `Autosave.queue()` skips a
write whose value matches what was last stored. Queue something that does not vary with the
record — a list of dirty ids, say — and every edit after the first looks like a no-op and is
dropped, with no error and no change to the indicator. This shipped once and lost typed text.
`stores/outcomes.test.ts` pins it.

**A queued write has to be cancelled when its subject stops being true.** Deleting a record
with an edit still pending resurrects it; reverting an edit writes the value you undid,
because the superseded value is still sitting in the queue. Both go through
`Autosave.cancel()` — see `#requeue()` in the outcomes store for the pattern.

**Structural edits write immediately and report via `markSaved` / `markFailed`.** They touch
several records and renumber siblings, so a half-applied debounce would leave a shape that
never existed. They still have to reach the indicator, or it reads "No changes" straight
after the user moved a row, and says nothing at all when the write failed.

**`vitest.config.ts` loads the plain Svelte plugin** (not SvelteKit) so `.svelte.ts` store
files can be imported and tested. The store tests are integration tests over the real
repository against `fake-indexeddb` — the bugs above live in how the store drives the saver,
which a unit test of either half cannot see.

### Markdown and safety

**`src/lib/markdown.ts` sanitises with an allow-list, and that is not optional.** The threat
model is not the local author — it is **import**. A bundle is a plain zip that can arrive by
email or out of an old backup, and its stems go straight into `{@html}` the moment a
collection is opened. `marked` dropped its own `sanitize` option years ago; DOMPurify does
the work. `img` is deliberately absent from the allow-list: a remote image would put a
network request into an app that promises to make none, and would leak the fact that a file
was opened.

It lives outside `domain/` because DOMPurify needs a DOM and domain has to stay headless.
`markdown.test.ts` is the one file in the suite that runs under jsdom.

**Clearing a number field means "not stated", which is not zero.** `points.ts` reports the
two differently (`undeclared` vs `explicit`) and a collection total depends on it, so the
editors `delete` the property rather than writing `0` or `NaN`.

### Review screens

**`stores/review.svelte.ts` gathers through `repository.exportVault`.** That method already
assembles exactly the shape coverage and validation need and is covered by the round-trip
tests, so reusing it means one gather path instead of two that drift. It is a read; nothing
about it is export-specific.

**The review snapshot is not live, but it re-reads on every arrival.** Numbers that shift
while you are reading them are worse than useless, so it holds still within a visit —
and `onMount` reloads it, because coming back after an edit and being shown stale totals
is its own kind of wrong.

**Only a LEAF with no coverage is a gap.** A parent is reached through its children, so the
matrix shows "via children" for one rather than a warning. Flagging every parent would paint
most of a tree as a problem and bury the real ones.

**A problem you cannot navigate to is only half reported.** `review.linkFor(issue)` resolves
an issue to the screen that can fix it. Issue ids for nested things are `parentId:childId`,
so only the first segment is an entity.

### Item kinds

**A group's parts are edited in place inside the top-level record.** Every part operation is
an edit to ONE row, so they go through the debounced field path, not the immediate structural
path. `queueSaveForOwnerOf(id)` walks up to whichever top-level ancestor actually gets
written — queueing against a part's own id would target something that is not a row and
silently go nowhere.

**`ItemBody` is shared between a top-level item and a nested part.** ItemCard adds the
header, which is where all the store coupling lives (sections, collection ordering,
duplicate). Keeping that split is what stops the part editor either duplicating the field
UI or dragging collection concerns into a nested context.

**A stimulus is a passage, so the answer machinery is hidden rather than shown empty**, and
the points field is not offered at all — `points.ts` pins it to zero regardless, and offering
a field the model ignores would be a lie. Everything else stays visible even where it is
unusual: hiding a field the schema accepts makes the editor and the model disagree.

**`DiscussionSpec` is created on first edit, not on item creation.** `item.discussion ===
undefined` is what validation reads to say "no posting requirements set", so writing an empty
spec into every discussion item would silence a rule that is doing its job.

### Rubrics

**`Criterion.descriptors` is keyed by LEVEL ID, and that makes changing levels the most
destructive operation in the app.** Get it wrong and a grid someone spent an afternoon on
comes back blank, with no error and nothing to undo. Every level change goes through
`domain/rubrics.ts` rather than editing arrays in a store or a component.

**`applyLevels` carries descriptors across BY POSITION.** The incoming levels are fresh
objects with fresh ids, so matching on id finds nothing and blanks the grid. Position is the
only correspondence available and the right one: swapping a four-point scale for a
differently-named four-point scale should keep what was written for "best", "second best"
and so on. It reports `droppedDescriptors` so the UI can warn *before* committing.

**Rubrics are shared; items and collections reference them by id.** Editing one changes
every item pointing at it — intended, but worth remembering before "just tweaking" a level's
points. Levels are always *copied* out of a config level set, never referenced, so a rubric
owns its own.

### The bundle

**Export must never be able to fail, and import must never be all-or-nothing.** A damaged
file costs you that file and nothing else; only a missing or unreadable `vault.json` is
fatal, because without it there is no course to attach anything to. `readBundle` reports
problems per file and returns everything it could salvage.

**Say which failure happened.** A zip that will not open and a zip missing its vault record
need different fixes — "download it again" versus "this is not a whole bundle" — and someone
reading that message is usually mid-recovery.

**Unrecognised files in a bundle are ignored, not rejected.** The Markdown and CSV are
skipped on import along with anything else that is not `.json`, and a user may drop their
own notes in. Neither is an error.

**The readable files are derived views, and only the JSON is read back.** That asymmetry
is what lets `export/markdown.ts` and `export/csv.ts` collapse a stem onto one line, drop
an item's revision log, and abbreviate a heading — the lossless form is in the same zip.
Do not add a Markdown or CSV *reader*; JSON is the round-trip path.

**A collection's `.json` and `.md` must share a filename stem**, so slugs are computed
once in `buildBundleFiles` and passed down. A second `uniqueSlugger()` for the Markdown
would silently produce `unit-1-test.json` beside `unit-1-test-2.md`. The collection
documents also link to the rubric documents, which is the other reason every slug has to
be known before the first file is written.

**Each derived file is rendered inside `safely()`**, which returns a note in its place if
the writer throws. Export must never be able to fail, and unlike `JSON.stringify` these
writers walk the model and format its numbers. One unrenderable readable file, with the
lossless JSON still beside it, costs the reading and nothing else.

**`export/readable.ts` owns document order, and both writers follow it.** The one way
these files can embarrass the app is by disagreeing — question 4 in the exam document
being a different question from row `4.` in `items.csv`. Numbering runs continuously
across sections, as a printed test numbers itself, and a group's parts are `4.1.`, `4.2.`.

**`src/lib/export/markdown.ts` is not `src/lib/markdown.ts`.** The first only writes
Markdown, for the bundle; the second sanitises it for display and is the one with the
DOMPurify allow-list.

**The CSVs carry a UTF-8 BOM and CRLF line endings.** Excel on the locked-down Windows
machine reads a BOM-less UTF-8 CSV as the system code page, so `Café` arrives as `CafÃ©`;
every other reader skips the mark. The BOM is written as `'\ufeff'` and never as the
character — a literal one is invisible in an editor and in a diff. Fields are otherwise
untouched: a leading `=` is left alone, because the usual defence corrupts the data and
`=MEAN(x)` is a plausible thing to find in a stem.

**`SCHEMA_VERSION` bumps only when an older reader would MISREAD a newer bundle.** Adding a
file, or a field that older code carries through as an unknown key, is not a reason.

**Last-export time lives in localStorage, not on the vault.** Stored on the record it would
travel inside the bundle, so restoring a backup would report that you had just exported —
exactly backwards.

**Changing an item's kind never destroys authored content.** Options stay put when a choice
item becomes an essay. A mis-click on a dropdown that silently deleted four written
distractors would be unforgivable; validation reports them as unused instead.

## How to work on this

The build follows the staged order in the brief (§7). Each stage ends with `pnpm check` and
`pnpm test` clean, a browser check, and one commit whose message explains *why*.

**Verify in a real browser, and do not trust the UI's own report.** This is the practice that
found every serious bug in this codebase, and none of them would have been caught any other
way — the unit tests passed throughout.

The method: drive the actual screen, then read IndexedDB **directly** and compare. Twice the
screen said one thing and storage held another:

- The outcomes store dropped every edit after the first. The save indicator said "Saved".
- Reverting an edit wrote the value you had undone, because the superseded value was still
  queued.

Both were silent, both destroyed typed text, and both were invisible to `pnpm test`. A
`fake-indexeddb` integration test now pins each one, but the browser found them first.

Also worth doing every time:

- **Wipe and restore.** Export, clear every store, re-import, deep-compare. Use a structural
  compare, not `JSON.stringify` — Zod reconstructs objects in schema order, so key order
  differs harmlessly and a string compare reports a false failure.
- **Hand-check arithmetic** against seeded data rather than reading the totals back. The
  coverage matrix was verified cell by cell.
- **Clean up after yourself.** Delete scratch courses and clear `drawbridge:last-export`;
  this is the user's real browser profile.

**Escape sequences in generated files may land as literal bytes.** A NUL byte reached
`coverage.ts` this way, and combining marks reached `format.ts`. The file compiles, tests
pass, and `grep` silently matches nothing in it. `architecture.test.ts` guards both now;
build such patterns with a script and verify the stored bytes.

## Where things stand

Stages 0–9 are done: scaffold, domain, repository, vaults and settings, outcomes, items,
export/import, rubrics, all eight item kinds, coverage and validation. See README.md for what
that means in user terms, and `git log` for the reasoning behind each.

Deliberately not built yet:

| | |
| --- | --- |
| Stage 10 | Markdown and CSV in the export bundle. The reader already ignores unrecognised files, so adding them cannot break an older import. |
| Stage 11 | PWA polish — offline verification, install prompt, update flow (the `registerType: 'prompt'` seam is in place), real icons. |
| Stage 12 | The `/help` guide, written last against the shipped UI. |
| Undo/redo | Brief §5. Cross-cutting; deferred until the item model settled, which it now has. |
| Command palette | Brief §5, `Ctrl/Cmd+K`. Also cross-cutting. |
| Markdown sanitiser | Decided: DOMPurify with an allow-list. Not named by the brief; see `src/lib/markdown.ts`. |
| Netlify deploy | The user's action, not the agent's. Verify the PWA locally instead. |
| App icons | Placeholders. The real ones land at Stage 11. |

## Stack notes and traps

**Pin `typescript` to 6.x.** npm's `latest` is 7.x (the native compiler), but `svelte-check`
peers on `^5 || ^6` and `@sveltejs/kit` on `^5.3.3 || ^6`. Upgrading to 7 breaks `pnpm check`
immediately. Revisit only when both packages declare support.

**Theming is `data-theme`, never Tailwind's `dark:` variant.** One attribute on `<html>`
restyles the whole tree. `dark:` only reaches elements Tailwind generated classes for, so any
embedded editor or third-party widget would need a parallel theming path and would drift.
`src/app.css` uses `@theme inline` — the `inline` is required, or Tailwind resolves the
`var()` at build time and the utilities freeze to the light palette.

**Root `prerender = true`, but `prerender = false` under `/v`.** Vault ids live in IndexedDB
and cannot be enumerated at build time. `adapter-static` with `fallback: 'index.html'` serves
those routes and the client router resolves them. Removing either half breaks deep links.

**The service worker must be served `must-revalidate`** (`netlify.toml`), or an install gets
pinned to a stale shell and stops picking up new builds.

**`$effect` tracks every reactive read in its body, including ones you only meant to *use*.**
An effect that reads state in order to *construct* something will re-run on every change to
that state, destroying and rebuilding what it made. On a predecessor this took the cursor and
the undo history with it on every keystroke. Wrap construction in `untrack`, or seed from a
settled value at init instead of reaching for an effect at all.

**`structuredClone` on a raw `$state` proxy throws.** Snapshot first:
`structuredClone($state.snapshot(draft))`.

**Never put literal control characters in source.** Write the escape — and be careful,
because tools that generate code are exactly how one gets in. This has already happened once
here, in a template literal meant to hold a separator.

The failure is nasty because nothing complains: the file still compiles and every test still
passes. What breaks is the toolchain around it — `file` reports the source as `data` instead
of text, and **`grep` silently matches nothing in it**, so a search for the very symbol you
are chasing comes back empty. Diagnose with `file src/...` when a grep result looks
impossibly wrong.

`src/lib/architecture.test.ts` guards against this across `src/lib` and `src/routes`. If you
need to write a character class for control characters, build it with `String.raw` and
`\uXXXX` escapes, and verify the stored bytes afterwards rather than trusting what you
typed.

## Testing

`vitest.config.ts` is separate from `vite.config.ts` and deliberately omits the SvelteKit
plugin — domain and repo tests are plain TypeScript with no DOM. Repository tests run against
`fake-indexeddb`. Component tests need a real justification; prefer pushing the logic down
into `domain/` where it can be tested without a renderer.

The tests that carry the weight: points arithmetic across nested groups and rubrics, coverage
computation, every validation rule, and bundle round-tripping (export → import → deep equal).
