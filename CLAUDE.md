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
pnpm preview      # serve build/ the way Netlify does; required to test the service worker
                  # (it does not register in dev). Rebuild and refresh; no restart needed.
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
"worth up to 4 pt" — so nobody reports it as a bug. Which level is best is a per-criterion
question since stage 15: see `Criterion.levelPoints` below.

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

### The sample course

**`domain/sample.ts` is a module, not a shipped zip.** A binary in `static/` is unreviewable
in a diff and goes stale *silently* against a schema change; a module stops compiling, which
is the whole reason to write it this way. It reuses `defaults.ts`, never `fixtures.ts` —
fixtures are test-only and build the smallest thing that exercises a rule, which is the
opposite of what a demo needs.

**It loads through `importVault(_, 'new')`**, so it inherits the id remapping and gives two
independent courses when loaded twice. It is an ordinary vault the user can edit and delete,
not a shared demo.

**It shows the features, not just the shapes.** Every item kind appears, and so does a
criterion carrying its own `levelPoints` — a grid where every row is worth the same looks
like the only kind there is. `sample.test.ts` pins both, the second by checking the
override actually moves the total.

**It contains a deliberately unfinished item and one uncovered outcome.** `sample.test.ts`
pins both halves: no `error`-severity issue anywhere (a demo that opens red teaches the wrong
lesson about a validator that never blocks), and at least one issue (a clean bill of health
leaves the notes panel and the coverage screen looking broken-because-empty).

### Controls

**Every icon button goes through `ui/IconButton.svelte`, and its `aria-label` is a required
prop.** A button whose whole label is a glyph announces "button" and nothing else without
one, and this repo has no linter to catch that — making the prop required means `pnpm check`
fails at the call site instead. `architecture.test.ts` separately pins that every `<button` in
`components/` and `routes/` carries a `type`, because the HTML default is `submit`.

**Icons are SVG paths on a fixed 16×16 grid (`ui/icons.ts`), never text glyphs.** The mark-up
they replaced drew from four Unicode blocks — arrows, a dingbat, a technical symbol, a
fullwidth plus and an emoji — each with its own ink offset inside its em box, so a row of them
sat at four different heights and no amount of padding fixed it. Two also fell outside the UI
font's coverage, so their advance width, and therefore the button's width, changed per
platform. One `OptionsEditor` button swapped an emoji for a fullwidth plus and changed size
with its own data.

**28px is the floor for a control, at 4px spacing** (`HIT` in `ui/styles.ts`). The originals
were as small as 15×16px in rows 2px apart, which fails WCAG 2.2 SC 2.5.8 on both the size
rule and the spacing exception that would otherwise excuse it.

**Shared class strings live in `ui/styles.ts` as plain exported constants.** Tailwind has to
see them literally to emit the utilities, so a function that composes class names at runtime is
how a utility silently stops being generated. Check the built CSS after touching that file.

**`SaveIndicator`'s error sits inside its `role="status"` region.** It used to sit beside it,
so a screen reader announced "Not saved" and never the reason — in an app with no save button,
where this is the only report that work reached disk.

**`OutcomePicker` is a combobox and behaves like one.** It closes on focus leaving the
component, checked one tick later against `document.activeElement` — not on the input's `blur`.
Opening the picker *replaces* the trigger button with the input, so at the instant `focusout`
fires the focused element is momentarily `<body>` and `relatedTarget` is null; reading it
synchronously closes the picker the moment it opens. The old code closed on a 120ms timer,
which is why its suggestions fired on `onmousedown` to beat it — and a control that only
answers to a mouse button going down is not reachable by keyboard at all.

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

### The PWA

**Nothing activates a new service worker on its own.** `registerType: 'prompt'`, and the
offer sits in a corner until the user takes it. This app holds the only copy of a term's work
in one browser profile, so an update that swapped itself in would be reloading a tab somebody
is typing into.

**Accepting an update flushes every debounced save first.** `pwa.applyUpdate()` awaits
`Autosave.flushAll()` before letting the worker take over, because the reload it triggers
would otherwise race the `pagehide` handlers — and browsers do not promise to finish async
work during unload. `Autosave` keeps a registry of live savers for exactly this;
`autosave.test.ts` pins that `flushAll()` resolves only after the writes land.

**`onNeedRefresh` does not fire for a worker that was already waiting.** It only reports one
that reaches `waiting` while the page is watching, so a build installed during an earlier
visit announces nothing — and since nothing self-activates, it would sit there forever while
the user reloads and reloads. `onRegisteredSW` checks `registration.waiting` directly. Both
paths are needed.

**A failed registration is reported, not swallowed.** `onRegisterError`, plus a `catch` on
the dynamic import. "Offline support silently did not happen" is the worst failure this app
has, because the screen looks completely normal until the day there is no network — which is
precisely how the relative-scope bug survived to Stage 11.

**The maskable icon is its own file.** Android crops to whatever shape the launcher uses and
guarantees only the middle 80%, so `static/icon-maskable-512.png` is rendered from
`scripts/icons/maskable.svg`, which insets the mark to 72% and bleeds the background to the
edges. Pointing the maskable entry at `icon-512.png` — which is what it used to do — takes
the road off both banks.

Icons are rendered from two committed SVG sources; there is no build step, because they
change roughly never:

```bash
rsvg-convert -w 192 -h 192 static/favicon.svg -o static/icon-192.png
rsvg-convert -w 512 -h 512 static/favicon.svg -o static/icon-512.png
rsvg-convert -w 512 -h 512 scripts/icons/maskable.svg -o static/icon-maskable-512.png
rsvg-convert -w 180 -h 180 scripts/icons/maskable.svg -o static/apple-touch-icon.png
```

### The guide

**`/help` describes the shipped UI, so it goes stale the moment a screen changes.** Any
change to a label, a shortcut, a confirmation or a default is also an edit to
`src/routes/help/+page.svelte`. It names buttons — `+ Align`, `Reload now`, `Delete
permanently` — because a guide that gestures vaguely is no use, and that precision is
exactly what rots.

**It says what is missing, on purpose.** No undo, no command palette, no way to move an
item between collections. Someone deciding whether it is safe to click delete is the
reader most in need of an accurate answer, and "the guide didn't mention it" reads as
"there must be a way".

**It is static markup and prerenders**, so it lands in the precache and can be read with no
network — which is when a locked-down work machine is most likely to need it.

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

**`Criterion.levelPoints` is keyed the same way, and carries the same hazard with a worse
failure mode.** It is what a criterion scores at each level, overriding the level's own
`points` — the mechanism that lets Thesis run 10/7/4/0 on the same grid where Mechanics
runs 4/3/2/1. A lost descriptor is visibly missing; a lost override just makes the total
smaller, and that total reaches the item scored by the rubric and its collection. Anything
here that touches levels handles both records or it is wrong.

**Absent means "inherit the column"; `0` means "worth nothing at this level".** Both are
real and a "Not evident" column wants the second, so the editor `delete`s the key rather
than writing 0 — the same distinction `points.ts` draws between `undeclared` and
`explicit` on an item.

**`Criterion.weight` is inert and now always will be.** `levelPoints` says the same thing
outright and in the unit the reader already understands, so applying a multiplier on top
would be a second way to express one idea and a way for the two to disagree.
`rubric.weight-not-applied` says so and names the replacement.

**`applyLevels` carries descriptors AND points overrides across BY POSITION.** The incoming
levels are fresh objects with fresh ids, so matching on id finds nothing and blanks the
grid. Position is the only correspondence available and the right one: swapping a
four-point scale for a differently-named four-point scale should keep what was written for
"best", "second best" and so on, and what each was worth. Carrying the text and leaving the
numbers is the worst of the outcomes — the grid still looks right. It reports
`dropped: { descriptors, points }`, counted apart because they read differently in a
warning, so the UI can warn *before* committing.

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
file, or a field that older code carries through as an unknown key, is not a reason. It is
2, for `Criterion.levelPoints`: version 1 preserves it as an unknown key but scores around
it, so rubric totals, the items those rubrics score and their collection totals all come
out lower with nothing to show anything was ignored.

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

**The staged build in the brief is finished — stages 0 to 12.** Scaffold, domain,
repository, vaults and settings, outcomes, items, export/import, rubrics, all eight item
kinds, coverage and validation, Markdown and CSV in the bundle, the PWA, and the `/help`
guide. See README.md for what that means in user terms, and `git log` for the reasoning
behind each.

**Stages 13 onwards follow a second plan**, covering what a term of real use surfaced:
controls and focus (13), a loadable sample course (14), per-criterion rubric points (15),
shared rubric tails (16), collection-kind capabilities and the task/item split (17), a
Markdown toolbar (18), cloning a course (19), moving items between collections (20), a write
funnel (21), the session journal and undo (22), and a command palette (23). **Stages 13, 14
and 15 are done**, taking `SCHEMA_VERSION` to 2. It bumps once more, at 16, and nowhere
else.

Deliberately not built yet:

| | |
| --- | --- |
| Undo/redo | Brief §5. Cross-cutting; deferred until the item model settled, which it now has. |
| Command palette | Brief §5, `Ctrl/Cmd+K`. Also cross-cutting. |
| Markdown sanitiser | Decided: DOMPurify with an allow-list. Not named by the brief; see `src/lib/markdown.ts`. |
| Netlify deploy | The user's action, not the agent's. Verify the PWA locally instead. |
| Update checks in a long-lived tab | The app only looks for a new build on load. A tab left open for a week will not notice one until it is reloaded. A throttled check on `visibilitychange` is the obvious addition; it was not asked for. |

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
and cannot be enumerated at build time. `adapter-static` with `fallback: '200.html'` serves
those routes and the client router resolves them. Removing either half breaks deep links.

**`paths.relative = false`, and it is load-bearing.** SvelteKit's default writes `./_app/…`
into every prerendered page and hands Vite a base of `./`, which broke two things silently at
once: the service worker registered `./sw.js` with scope `./`, so opening the app at
`/v/<id>` registered nothing at all and the offline-first app had no offline support unless
you arrived at the root first; and the prerendered root, served for a deeper URL, asked for
`/v/<id>/_app/…` and never booted. The cost is that the app must live at the root of its
domain, which it does.

**Both fallback paths must name the same file.** Netlify redirects unmatched paths to
`200.html`; the service worker's `navigateFallback` has to as well, which is what
`kit: { adapterFallback: '200.html', spa: true }` in `vite.config.ts` is for. Left at its
default the plugin falls back to `/` — the *prerendered root*, which is a different document
from the SPA fallback — and every deep link opens blank once the worker is installed. `spa:
true` is what gets `200.html` into the precache at all: adapter-static writes it after the
PWA plugin has already generated the worker.

**The service worker must be served `must-revalidate`** (`netlify.toml`), or an install gets
pinned to a stale shell and stops picking up new builds.

**`pnpm preview` is `scripts/serve-build.js`, not `vite preview`.** SvelteKit's preview
server re-renders the SPA fallback per request with asset paths relative to the depth of the
URL asked for, so it hides exactly the class of bug above. The replacement is a plain static
server with netlify.toml's two rules — serve the file if it exists, otherwise `200.html`;
never cache `sw.js` — and it reads from disk per request, so a rebuild needs only a refresh.

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
