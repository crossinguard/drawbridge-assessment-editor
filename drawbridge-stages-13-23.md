# Drawbridge — stages 13 to 23

The staged build in [drawbridge-redux-plan.md](drawbridge-redux-plan.md) finished at stage
12. This is the plan for what a term of real use surfaced afterwards, in the same shape: each
stage is independently shippable, ends with `pnpm check` and `pnpm test` clean plus a browser
check, and lands as one commit whose message explains *why*.

**Read this file before starting a stage.** It lives in the repo precisely because it did not
at first, and a stage got built from a one-line summary in CLAUDE.md instead. That worked out,
but only because the one-line summary happened to be right.

## Status

| | Stage | Delivers | Schema |
| --- | --- | --- | --- |
| ✅ | 13 | Controls and focus — hit targets, drawn icons, keyboard | — |
| ✅ | 14 | A sample course, loadable from the home screen | — |
| ✅ | 15 | Per-criterion points (`Criterion.levelPoints`) | **1 → 2** |
| | 16 | Shared rubric tails — boilerplate criteria, composed live | **2 → 3** |
| | 17 | Collection-kind capabilities — the task/item builder split | — |
| | 18 | Markdown toolbar | — |
| | 19 | Clone a course, and delete from the home list | — |
| | 20 | Move items between collections | — |
| | 21 | The write funnel — pure refactor, no new UI | — |
| | 22 | Session journal — undo, redo, the staging area | — |
| | 23 | Command palette | — |

`SCHEMA_VERSION` bumps **once more, at stage 16**, and nowhere else. The contrast between
stage 16 (arithmetic changes, bump) and stage 17 (chrome changes, no bump) is the clearest
illustration of that rule in the repo's history and belongs in both commit messages.

Two orderings are deliberate and worth not undoing:

**The sample course came early (14), not last.** Every stage after it would otherwise begin by
hand-building a fixture. Stages 15 to 17 each extend it — cheap, because it is typed data and
`pnpm check` forces the edits.

**The write funnel is late (21), not first.** Tidier first, but it is an invasive refactor
across eight stores with the whole app downstream. Stages 19 and 20 each add a write path;
write each as a single private method shaped like `items.#write` so the retrofit is one line.

---

## Done

### Stage 13 — Controls and focus

`ui/Icon.svelte`, `ui/IconButton.svelte` (required `aria-label`), `ui/icons.ts`,
`ui/styles.ts`. All 32 hand-rolled buttons replaced; 28px targets at 4px spacing. Fixed four
defects: `SaveIndicator`'s error outside its live region, no focus ring at all on the rubric
grid and `PartsEditor`, `ThemeToggle` with no type or label, and `OutcomePicker` firing on
`onmousedown`. `architecture.test.ts` gained a rule that every `<button>` carries a `type` —
which immediately found that the shared `Button` had no default.

### Stage 14 — Sample course

`domain/sample.ts`, loaded via `backup.loadSample()` → `importVault(_, 'new')`. A module, not
a shipped zip. Contains a deliberately unfinished item and one uncovered outcome;
`sample.test.ts` pins both that nothing is an *error* and that *something* is reported.

**Deviation from plan:** the injectable id generator was dropped. It existed for test
determinism and no test that got written needs fixed ids.

### Stage 15 — Per-criterion points

Shipped as planned. Three naming differences worth knowing when reading the plan text for
later stages:

| Plan said | Shipped as |
| --- | --- |
| `Criterion.points` | **`Criterion.levelPoints`** |
| `levelPoints(criterion, level)` | **`pointsAt(criterion, level)`** in `points.ts` |
| `.optional()` | **`.default({})`**, mirroring `descriptors` directly above it |

The `.default({})` choice is the better one and is now canonical: `levelPoints` is keyed by
level id and sparse in exactly the way `descriptors` is, and the whole safety argument rests
on the two being handled identically everywhere. Making one optional and the other defaulted
would have been the first crack in that.

`applyLevels` reports `dropped: { descriptors, points }`, counted apart. `weight` stays inert
and now always will. See the **Rubrics** section of CLAUDE.md for the invariants.

**Worth repeating from that commit:** `remap.ts` remapped the descriptor keys and not the new
ones, two lines below a comment warning about that exact hazard, and every test in the file
passed. It was caught by opening the imported sample and reading a wrong total off the screen.
Stage 16 touches the same three files and can fail the same way.

---

## Stage 16 — Shared rubric tails

**Delivers** boilerplate criteria that always appear at the end, composed live — edit the tail
once and every rubric using it updates.

```ts
// RubricSchema
/** Rubrics whose criteria are appended, in order, after this rubric's own. */
appends: z.array(z.string()).default([])
```

An array because "professionalism tail" plus "citation tail" is one course away, but **the UI
offers one picker in this stage**. Schema general, surface narrow.

**A tail scores against its own levels.** New in `domain/rubrics.ts`:

```ts
export interface EffectiveCriterion { criterion: Criterion; source: Rubric; inherited: boolean }
export function effectiveCriteria(rubric: Rubric, rubricsById: ReadonlyMap<string, Rubric>): EffectiveCriterion[]
```

`rubricTotal(rubric)` becomes `rubricTotal(rubric, context)` and reduces
`criterionMax(e.criterion, e.source.levels)`. This is the decision the whole stage rests on:
`criterionMax` resolves `levelPoints` through `pointsAt`, which is keyed by **the tail's**
level ids. Scoring a tail criterion against the *host's* levels finds no entries, silently
falls back to the host's column points, and renders every descriptor blank. Carrying the
source rubric with each criterion is the only correct answer — and it has a good side effect:
a 2-point complete/incomplete tail on a 4-point rubric adds 2, which is what anyone expects.

The grid is therefore no longer rectangular. **Render the tail as its own sub-table** below
the main grid, with its own header, a link to edit it, and read-only cells. Honest about what
is happening, and makes "this is shared" visible.

Make the `context` parameter **required**, not optional. Four call sites, each already holding
one (`points.ts` ×2, `rubrics/[rubricId]/+page.svelte`, `rubrics/+page.svelte`). An optional
context that silently drops tails is a lie the type system could have prevented.

**`SCHEMA_VERSION` 2 → 3.** A v2 reader ignores `appends` and computes a smaller total. Same
misread as stage 15, different field.

Also modify: `coverage.ts` (both `criterionMax` call sites iterate `effectiveCriteria`, or an
outcome aligned only on a tail criterion reads as uncovered); three validate rules
(`rubric.dangling-append` error, `rubric.append-cycle` error, `rubric.append-empty` info);
`remap.ts` (`appends: rubric.appends.map(ref)` — **the file that broke last stage**); the
rubric list shows which rubrics are used as tails and `rubrics.remove` warns with a count;
`export/markdown.ts` renders inherited criteria with a link to the tail's document
(`rubricSlugs` already exists in `export/readable.ts`); `domain/sample.ts` gains a
"Professionalism" tail; `/help#rubrics`.

`effectiveCriteria` needs a `seen: Set<string>` and a depth cap. State in the file that
`applyLevels`, `withoutLevel` and `descriptorCoverage` operate on `rubric.criteria` and **must
never** touch inherited ones — those belong to another record.

**Tests.** The one that pins the design: `rubricTotal` of a 4-point host with a 2-point tail is
host + 2, **not** host + 4. Plus ordering, self-append terminates, an A→B→A cycle terminates,
a dangling append is skipped rather than thrown on, coverage through a tail criterion, and a
bundle round-trip with `appends` set.

**Risk.** Somebody will "helpfully" make `applyLevels` operate on effective criteria, which
would rewrite another rubric's descriptors from a screen that is not editing it.

---

## Stage 17 — Collection-kind capabilities

**Delivers** the task/item builder split, driven by data. One screen whose chrome is
capability-driven: a task shows no answer-key machinery and no kind palette; an exam shows no
rubric-first block. `collection.kind` is currently never read by the collection editor, so
this is additive rather than a rewrite.

**Not a `mode` field.** `if (kind.mode === 'task')` is `if (kind === 'quiz')` wearing a hat,
and fails the vocabularies-are-data rule for the reason that rule exists — a course that
invents "lab practical" gets two boxes to choose between rather than the behaviour it wants.

```ts
export const CollectionKindSchema = VocabSchema.extend({
  /** Item kinds offered here. Absent means every kind; empty means none. */
  itemKinds: z.array(ItemKindSchema).optional(),
  /** Offer per-item points, answer keys and the item-kind picker. */
  itemScoring: z.boolean().default(true),
  sections: z.boolean().default(true),
  /** Lead the screen with the collection's rubric rather than burying it in the header. */
  rubricFirst: z.boolean().default(false)
});
```

`itemKinds` is **optional**, not defaulted to `[]`. Absent means "not stated" → every kind;
`[]` means an explicit none, which is right for a task scored wholly by one rubric. Same
"cleared is not zero" distinction the codebase already draws for `item.points` and for
`levelPoints`.

A new schema rather than editing `VocabSchema` in place — that schema is shared with
`statuses`, where collection capabilities are meaningless. `.extend()` keeps it compatible
with all eight structural readers (`labelOf`, `validate.ts`, `csv.ts`, the collections index).

New `domain/collections.ts` — `capabilitiesOf(config, kind): KindCapabilities`, pure. **An
unknown kind returns everything enabled**; a bundle from another course must never open
degraded.

**Components take the resolved capability object, never a kind key.** `ItemBody`'s existing
branches on `item.kind` stay — those branch on `ItemKind`, the one legitimate closed
structural discriminant. What changes is collection-level chrome: the hard-coded `KINDS` array
in the collection route goes; sections gate on `capabilities.sections`; "Scored by" moves into
a prominent block when `rubricFirst`.

Settings gets a `CollectionKindsEditor.svelte` beside `VocabEditor` rather than a conditional
inside it. `defaults.ts` seeds `task`/`discussion` with `itemScoring: false, rubricFirst:
true` and narrows `quiz`/`exam` to the selected-response kinds — starting points only.

**No `SCHEMA_VERSION` bump.** An older reader ignoring `itemScoring` shows a busier editor. No
number changes, nothing is misread.

**Risk.** Hiding the points field contradicts `ItemBody`'s stated rule that hiding a field the
schema accepts makes editor and model disagree. The difference is that this is a *user's*
choice for a *kind*, and `points.ts` still honours a value if present. Add
`item.points-hidden-by-kind` at info severity so a counted-but-unshown number is never
invisible.

---

## Stage 18 — Markdown toolbar

**Delivers** formatting buttons that insert Markdown into the existing textarea. **Not a third
mode** — `MarkdownField` already has edit/preview and a third makes the button ambiguous. What
this solves is not having to remember the syntax.

New `src/lib/markdown-edit.ts` — pure string manipulation, no DOM, beside the existing
`text.ts`: `toggleWrap`, `toggleLinePrefix`, `insertLink`, `insertTable`, each returning
`{ text, selectionStart, selectionEnd }`.

**`setRangeText` does not fire `input`.** `MarkdownField`'s `oninput` prop is the textarea's
native handler, so a programmatic edit would change the text and never queue a save — silent
data loss of exactly the family CLAUDE.md catalogues. Compute the new string in JS, assign to
the `$bindable` value, call `oninput?.()` explicitly, and restore selection after
`await tick()`. Reuse the `focus()` method `MarkdownField` gained in stage 13.

**Scope guard:** the toolbar goes in `MarkdownField` only. The rubric grid's descriptor cells
and the rubric description are raw textareas; a toolbar per cell in a dense grid would be
absurd.

**Tests** in `markdown-edit.test.ts`, pure and node-environment: wrap/unwrap, empty selection
places the caret between markers, line prefix applies to every line of a multi-line selection
and toggles off when all lines have it, link puts the caret in the URL slot. Selection offsets
in every case — that is the half that breaks and the half a browser test would not pin.

---

## Stage 19 — Clone a course, and delete from the home list

**Delivers** a new course carrying this one's settings, with a choice of how much content
comes with it. `importVault(await exportVault(id), 'new')` already yields an independent copy
because `'new'` routes through `remapSnapshotIds`. Three things it gets wrong: name, code and
timestamps copy verbatim.

**The clone must change the code.** `code` is indexed and is the merge fallback key in
`dexie.ts`, so two vaults sharing one makes a later merge-import pick an arbitrary row. That
is a correctness requirement — the form blocks submit on a duplicate.

New `domain/clone.ts` — pure; filters and rewrites, then hands the result to
`importVault(_, 'new')` for id remapping. **One remapper, not two.**

```ts
export function cloneSnapshot(snapshot, { name, code, term, include, now }): VaultSnapshot
// include: { outcomes, rubrics, collections, items }
```

Where it goes wrong:
- Excluding **rubrics** must strip `rubricId` from every collection and item and drop
  `criterion.outcomeIds`. A new course opening with red dangling-reference errors is a bad
  first impression.
- Excluding **outcomes** must strip `outcomeIds` from items and criteria.
- Excluding **collections** forces excluding items — an item with no collection is
  unreachable. Enforce it; do not offer the combination.
- Excluding **items** but keeping collections leaves shells. **This is the main case**: same
  structure, same settings, new questions.
- Restamp `createdAt`/`updatedAt` to `now`. A clone is new work, not a restore.
- `VaultConfig` always comes across whole. That is the point.

`vaults.svelte.ts` gains `clone(sourceId, options)` as a single method, so stage 21's retrofit
is one line. New route `/v/[vaultId]/clone` — a route not a modal: seven controls, and it
should survive a reload. `routes/+page.svelte` gains **Clone…** and **Delete…** per row;
**delete is a link to `/v/{id}/settings#delete`**, not a second implementation.

**Call `Autosave.flushAll()` before cloning** — `exportVault` reads storage, not the draft.

**Tests.** `clone.test.ts` carries the weight: parameterise `validateVault` over all eight
include combinations and assert no `error`-severity issues.

---

## Stage 20 — Move items between collections

**Delivers** "Move to…" on an item card. Fifth thing `/help#missing` lists as absent.

New `relocateItem(item, toCollectionId, order)` in `domain/items.ts` beside `duplicateItem`.
**`sectionId` and `stimulusId` are cleared** — both name things scoped to the old collection.
`collectionId` **recurses into parts**: the items store gives each part its own, so a group
moved without recursion leaves parts claiming the old collection — invisible until an export.

`moveToCollection(id, to)` in the items store, in this order:

1. **`await this.saver.flush()`** — not `cancel()`. There may be typed text pending for this
   item; cancelling loses it, and cancelling *after* the move writes the pending value with
   the old `collectionId` and resurrects a ghost.
2. `#dirty.delete(id)`; read the target group for the append order; `repository.items.update`
   through `plain()`; drop from local state; `#requeue()`; `#renumber` the vacated group.

**Refuse moving a *part* out of a group.** A part is not a row. That is "promote part to item",
its own stage.

**Tests** (integration, `fake-indexeddb`): a pending debounced edit is written before the move
and the moved record carries the typed text — this is the one that would ship broken.

---

## Stage 21 — The write funnel

**Delivers** every repository write through one place, and every write reporting to a save
indicator. No user-visible feature, but the reporting improvement is real:
`collections.create` failing today shows the user nothing at all.

Today: three write paths, `repository` imported directly by eight stores, two private funnels
that got it right (`outcomes.#persistOrder`, `items.#write`) surrounded by seven methods that
did not — `vaultList.create/rename/remove`, `collections.create/remove`,
`rubrics.create/remove`, plus `backup.importFile`.

New `stores/writer.svelte.ts` with `put`/`putMany`/`update`/`remove`, each taking a
`WriteIntent { label, vaultId, report? }`. Reuse `EntityType` from `validate.ts` rather than
inventing a table union — `review.linkFor` already maps it to a screen, which stage 22 needs
for free. One `tables` map and exactly one cast, inside the funnel.

Keep `put` and `update` as separate funnel methods: `put` writes verbatim, and that is what
makes import faithful. Keep `plain()` at the call site, not inside the funnel.

`vaultList.remove` and `backup.importFile` route through for *reporting only*, flagged
`journal: false` — both are unbounded writes whose before-image cannot be captured cheaply.

**Tests.** The existing store tests are the safety net and must pass **unchanged**. If one
needs editing, that is a signal the refactor changed behaviour.

---

## Stage 22 — Session journal, undo and redo

**Delivers** the staging area: a session change list with per-entry undo/redo, plus `Ctrl+Z`.

**In memory, not IndexedDB.** What changed *in a session*, taken literally. Persisting means a
new table, extending `deleteVault`'s cascade, a decision about the bundle (it must not
travel), and unbounded growth from whole-record before-images. Cap at ~100 entries, oldest
dropped, and **say so in the UI**.

```ts
// domain/journal.ts — pure
interface Change { type: EntityType; id: string; before: unknown | null; after: unknown | null }
interface JournalEntry { id; at; vaultId; label; changes: Change[]; state: 'applied' | 'reverted' }
```

**Whole records, not field diffs.** A diff over a `looseObject` that promises to round-trip
unknown keys is exactly where an unknown key gets lost.

Before-images are read from the repository inside the funnel immediately before the write —
not from the store's in-memory copy, because several paths mutate in place *then* write, so
the store's copy is already the after-image. Granularity comes free from the debounce.

**Out-of-order revert is allowed only when no later applied entry touches any of the same
record ids** — a set intersection over `changes[].id`. Conservative on purpose. When it
refuses, offer "Undo everything back to here (3 changes)".

It must additionally refuse: a revert that would orphan a record; vault deletion and import
(not journalled at all); and any revert where the stored record's `updatedAt` no longer
matches the entry's `after.updatedAt`. Before applying, `await Autosave.flushAll()`, then
apply, then reload the affected stores — their load guards will bite here.

Redo is not a second stack: each entry carries `state`, reverting flips it, and a new entry
clears nothing.

`/help` gains an `#undo` section, and **must name `Item.log` as *not* this** — it is a
user-authored revision log with no write path, and someone will reasonably assume otherwise.

**Risk.** The pending-write race is the highest-probability, highest-cost failure and is
invisible to a UI that says "Saved".

---

## Stage 23 — Command palette

**Delivers** `Ctrl/Cmd+K` reaching every collection, item, rubric, outcome and command.

Honest assessment: the lowest-value item on the list for one user who wrote the app, and the
highest-risk for accessibility if done casually. It is cheap now — `review.svelte.ts` is
already a whole-vault read and `linkFor` already resolves an entity to its screen.

New `src/lib/search.ts` — `rank(query, candidates)`, a scored subsequence match, pure and
dependency-free. `CommandPalette.svelte` mounted in the vault layout, sourcing the existing
`nav` array, `review.snapshot`, and a command registry.

Non-negotiable and the reason this is last: `role="dialog"`, `aria-modal`, a focus trap,
`aria-activedescendant`, Escape closes, focus restored on close.

---

## Cross-cutting

**`/help` is edited in most of these stages.** It names buttons and goes stale the moment a
screen changes. Three stages *remove* lines from `#missing`: 20, 22, 23. Budget for it per
stage — a cleanup pass at the end is how the guide gets rewritten from memory.

**`remap.ts` is the file that gets forgotten.** It broke in stage 15 for a field added in the
same commit, two lines below a comment warning about it, with every test passing. Stages 16,
17 and 19 all add or move id-keyed data.

**Never put literal control characters in source.** `architecture.test.ts` guards it.

## Verification, per stage

1. `pnpm check` and `pnpm test` clean. They are the only gates.
2. `pnpm build && pnpm preview`. **Unregister any service worker first** — a stale one serves
   the previous build and makes working code look broken. Then drive the real screen at
   800/1100/1280 in both themes.
3. **Do not trust the UI's own report.** Read IndexedDB directly and compare. Every serious
   bug in this codebase was found that way, including stage 15's, and none by the suite.
4. Load the sample course as the fixture; hand-check arithmetic against it rather than reading
   totals back off the screen.
5. Clean up: delete scratch courses and clear `drawbridge:*` localStorage keys. This is a real
   browser profile.
