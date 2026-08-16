# Drawbridge — stages 13 to 23

The staged build in [drawbridge-redux-plan.md](drawbridge-redux-plan.md) finished at stage
12. This is the plan for what a term of real use surfaced afterwards, in the same shape: each
stage is independently shippable, ends with `pnpm check` and `pnpm test` clean plus a browser
check, and lands as one commit whose message explains *why*.

**Every stage in this file is now built.** What follows is therefore a record rather than a
plan: each entry says what shipped, where the plan was wrong, and what only a browser could
have found. Read the entry before touching the thing it describes.

It lives in the repo precisely because it did not at first, and a stage got built from a
one-line summary in CLAUDE.md instead. That worked out, but only because the one-line summary
happened to be right.

## Status

| | Stage | Delivers | Schema |
| --- | --- | --- | --- |
| ✅ | 13 | Controls and focus — hit targets, drawn icons, keyboard | — |
| ✅ | 14 | A sample course, loadable from the home screen | — |
| ✅ | 15 | Per-criterion points (`Criterion.levelPoints`) | **1 → 2** |
| ✅ | 16 | Shared rubric tails — boilerplate criteria, composed live | **2 → 3** |
| ✅ | 17 | Collection-kind capabilities — the task/item builder split | — |
| ✅ | 18 | Markdown toolbar | — |
| ✅ | 19 | Clone a course, and delete from the home list | — |
| ✅ | 20 | Move items between collections | — |
| ✅ | 21 | The write funnel — pure refactor, no new UI | — |
| ✅ | 22 | Session journal — undo, redo, the staging area | — |
| ✅ | 23 | Command palette | — |

`SCHEMA_VERSION` reached **3 at stage 16** and does not move again. The contrast between
stage 16 (arithmetic changes, bump) and stage 17 (chrome changes, no bump) is the clearest
illustration of that rule in the repo's history, and is recorded in both commit messages.

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

### Stage 16 — Shared rubric tails

`Rubric.appends`, composed by `effectiveCriteria` in `domain/rubrics.ts`. Shipped as planned,
including the required-context decision — `rubricTotal(rubric, context)` broke fifteen call
sites at `pnpm check`, which is exactly what an optional parameter would have hidden.

**The decision the stage rests on, restated because it never stops applying:** a tail is
scored against ITS OWN levels, which is why every composed criterion carries its `source`.
The invariants are in the **Rubrics** section of CLAUDE.md, including the one about
`applyLevels` never being handed inherited criteria.

Two additions the plan did not name: `hasAppendCycle` (so `validate.ts` can report a loop
that `effectiveCriteria` merely survives) and `rubricsAppending` (the list badge and the
delete confirmation). `applyLevels` reports `dropped: { descriptors, points }` unchanged;
tails are composed at read time and never touch it.

**`remap.ts` did not break this time.** `appends: rubric.appends.map(ref)` went in with the
schema change rather than after it, and `remap.test.ts` now builds its fixture with a real
tail so the array is never empty. Stages 17 and 19 move id-keyed data too.

**Naming note for later stages:** the composed-criterion type is `EffectiveCriterion
{ criterion, source, inherited }`, and `source` is what everything scores against.

### Stage 17 — Collection-kind capabilities

`CollectionKindSchema` extends `VocabSchema`; `capabilitiesOf(config, kind)` in the new
`domain/collections.ts` resolves it. Shipped as planned, with the `.optional()` /
`.default([])` distinction on `itemKinds` holding up under the bundle round-trip — absent
comes back absent, which a default would have flattened.

**Deviation:** `exam` is NOT narrowed to the selected-response kinds. The sample course's own
exam mixes a stimulus, a group, a short answer and an essay, so narrowing it would ship a demo
whose add row lacks buttons for things already sitting above it. A new `sample.test.ts` case
now fails on exactly that, and is the check that decides how narrow any seeded kind may be.

Three additions the plan did not name: `ALL_CAPABILITIES` (exported so no screen invents a
placeholder while its vault loads — the safe answer is always the full editor), `kindOptions`
(keeps an item's own kind in its dropdown, so a narrowed palette can never render a `<select>`
whose value it does not contain), and an `architecture.test.ts` rule failing the build on
`collection.kind ===` or a comparison against a seeded key. `item.kind` is exempt, and the
guard has to leave `'discussion'` off its literal list because it is both a collection kind
and an `ItemKind`.

**No `SCHEMA_VERSION` bump**, and stage 16 →17 is the clearest illustration in the repo of
when that rule applies: tails changed arithmetic an older reader would get wrong, capabilities
only change which controls a newer reader draws.

### Stage 18 — Markdown toolbar

`src/lib/markdown-edit.ts` — `toggleWrap`, `toggleLinePrefix`, `insertLink`, `insertTable` —
wired into `MarkdownField` only, as the scope guard said. Shipped as planned, including the
`oninput` call by hand; verified in the browser by reading the stem back out of IndexedDB
rather than trusting the save indicator.

**The toolbar shares the label row** rather than adding one of its own. An item card stacks
up to six of these fields and six new rows of chrome would push the writing off screen. Seven
28px buttons fit beside a label and the Preview toggle down to about 340px of field width,
which is what the two-column rationale/feedback grid gives at an 800px viewport; below that
the row wraps rather than overflowing.

Two decisions the plan did not spell out, both settled by tests rather than taste:
`toggleWrap` unwraps markers whether they sit inside OR outside the selection, because both
states arise naturally and a toggle that only handled one would refuse to undo itself half
the time; and `toggleLinePrefix` keeps a selection that began at a line start exactly there,
so selecting a paragraph whole and pressing the list button does not leave the first bullet
outside the selection.

Seven icons joined `ui/icons.ts`. `bold` and `italic` are letterforms drawn as strokes — the
never-text-glyphs rule has no exception for glyphs that happen to be ASCII.

### Stage 19 — Clone a course, and delete from the home list

`domain/clone.ts` (`cloneSnapshot`, `codeIsTaken`, `suggestCode`), `vaultList.clone()`, and
the `/v/[vaultId]/clone` route. Shipped as planned. `clone.test.ts` runs all sixteen include
combinations against `validateVault` using the sample course as the fixture, which is the only
thing in the repo carrying one of everything the stripping has to handle.

**The browser found a bug the tests could not.** The form checked the code against every
course EXCEPT the one being copied — the reflex from a rename form, and wrong here, because a
clone is a new record and its source's code is as much of a conflict as any other. It let the
one collision the form exists to prevent straight through. `codeIsTaken` was unit-tested and
correct; the call site was not. Fixed and re-verified.

**And the stale service worker cost a round.** The re-test after the fix still failed, because
loading the app had registered a worker from the previous build and `registerType: 'prompt'`
meant the rebuild sat waiting. The verification note at the bottom of this file says to
unregister first; it needs doing again after every rebuild, not once per session.

Two additions the plan did not name: `suggestCode`, so the commonest answer is already typed
in (`STAT101` → `STAT101-2`, and it does not stack suffixes when cloning a clone), and
dropping `declaredPoints` when items stay behind — a declared total describes questions that
are not coming, and carried onto an empty shell it reports itself as a points mismatch on the
new course's first screen. Settings survive whole, though `remapSnapshotIds` mints new ids for
the level sets, which is correct: the copy owns its own.

### Stage 20 — Move items between collections

`relocateItem` in `domain/items.ts`, `items.moveToCollection(id, to)`, and a "Move to…" select
in the item header. Shipped as planned except for one instruction that was wrong.

**Deviation, and it matters:** the plan said write with `repository.items.update`. `update`
MERGES (`{ ...existing, ...patch }`), so the keys `relocateItem` deletes — `sectionId`,
`stimulusId` — would have kept their stored values, landing the item pointing at a section of
the collection it just left. That is the exact failure `relocateItem` exists to prevent. It
writes a complete record with `put` instead, and CLAUDE.md's repository section now carries
the general rule: an edit that REMOVES a field cannot use `update`.

**The flush is durability, not correctness, and the tests cannot prove it.** The plan's
reasoning — that cancelling loses typed text, and cancelling afterwards resurrects a ghost —
does not hold against this implementation: the moved record is built from the live in-memory
item and `#requeue()` rebuilds the queue for whatever stays. Swapping `flush()` for `cancel()`
leaves every test passing, which was checked by doing it. Flushing is still right, for the
narrower reason that everything after it is `await`ed and pending keystrokes should not live
only in memory across a read, a write and a renumber. Both the store comment and the test say
so rather than claiming more.

**Verification note:** two false alarms, both mine. Orders reading `0, 2, 3` after a move
looked like a renumber failure and was the sample numbering `order` continuously across a
collection while the store scopes it per section. And a card selected by `header.innerText
.includes('group')` matched every card, because the kind `<select>` contains all eight option
labels — the wrong item got moved. Select by `select.value`, not by header text.

### Stage 21 — The write funnel

`stores/writer.svelte.ts` — `run`/`put`/`putMany`/`update`/`remove`, each taking a
`WriteIntent { label, vaultId, report?, journal? }`. Every store write routed through it; all
reads left direct. Shipped as planned. **The existing store tests passed unchanged**, which
was the stated signal that the refactor changed no behaviour.

Two additions the plan did not name. `run(intent, operation)` is the general case the other
four delegate to, and is what `deleteVault` and `importVault` route through — they are not
single-record writes, so `put`/`remove` could not have carried them. And `WriteStatus`, a
reporter for a store with no debounced editing to need an `Autosave`: the vault list had
nowhere at all to put a failure, so the home screen now renders one, kept separate from
`vaultList.error` because a load failure replaces the list and a failed rename must not.

`ItemsStore` gained a `vaultId`, read from its collection on load. The intent needs one and
the store did not have it; reading it there beats having the route supply it and carry an
empty string the day someone forgets.

**`architecture.test.ts` gained two rules**, which is what stops this eroding one convenient
call at a time: no `repository.<table>.put/putMany/update/remove` outside the funnel, and no
component or route importing the repository singleton. The second needed narrowing on the
first run — `ImportPanel` imports the `ImportMode` *type* from `$lib/repo/types`, which is a
shape and not a way to write anything.

**Verification note:** forcing a real write failure in the browser is not worth attempting.
`indexedDB.deleteDatabase` while the app holds a connection stays *blocked*, and every later
`open` queues behind it — so writes hang rather than fail, which reports neither way and
wedges the tab. The failure path is pinned in `writer.test.ts` against `fake-indexeddb`
instead, reporter state and all; the browser is for confirming the refactor did not quietly
stop something writing, which it did by exercising all nine paths and reading each back.

### Stage 22 — Session journal, undo and redo

`domain/journal.ts` (pure), `stores/journal.svelte.ts` (the log), `stores/undo.svelte.ts`
(the flip), `/v/[vaultId]/changes`, and `Ctrl+Z` / `Ctrl+Shift+Z` in the vault layout.
Shipped as planned, in memory, capped at 100 with the screen saying so.

**Three store modules, not one, and that is the shape to keep.** The funnel has to file
changes into the log and the flip has to write through the funnel — one module doing both
puts `writer.svelte.ts` and the journal in an import circle. Splitting the LOG (no
repository, no writer) from the OPERATION (imports everything) removes it entirely.

**`intent.into` was not in the plan and the feature needs it.** Deleting an item is a
removal AND a renumber; deleting an outcome is N removals AND a renumber. Recorded per
write, those are two and N+1 entries, and undoing one of them leaves a state that never
existed — the question back among siblings still numbered as though it had gone. The three
call sites that need it are `items.remove`, `items.moveToCollection` and `outcomes.remove`.

**Removing a collection has to capture its items.** The repository cascades in one
transaction, so a journal holding only the collection restores it empty and reports success.

**Three delete confirmations said "This cannot be undone" and had to be corrected.** Item,
outcome and collection. The course-delete block still says there is no undo, correctly. This
is the `/help` staleness rule reaching UI strings — budget for it.

**A no-op filter cost an afternoon and is the reason there isn't one.** It dropped a change
whose before and after shared an `updatedAt`, which is true of any two writes inside one
millisecond — including creating a record and saving the first thing typed into it. Entries
simply never appeared. The same millisecond-resolution caveat applies to the staleness check
and is *not* reachable there, because the writes it guards against carry stamps from another
machine; the reasoning is recorded beside `stampOf`.

**Verification note, and it is the fourth entry on CLAUDE.md's browser-found list.** The log
held its entries in plain `$state`, which proxies deeply, so every before-image came back out
as a Proxy and the first undo threw `DataCloneError` — the failure `plain()` exists to
prevent, arriving from the one direction nothing watches: a value on its way OUT of a store.
`$state.raw` fixes it. **It cannot be pinned by a test in this repo**, which was checked
rather than assumed: `fake-indexeddb` clones by walking the object in JS, Node's own
`structuredClone` accepts a Svelte proxy, and the proxy carries no symbol or tag to probe.
A test asserting `structuredClone` does not throw was written, found to pass either way, and
deleted — a test that claims a pin it does not have is worse than none.

**Also verified against IndexedDB rather than the screen:** an item delete restored with its
options, key, points and outcome alignment and its siblings' original stamps; a four-outcome
branch restored in one `Ctrl+Z` with parents and orders intact; a settings edit undone with
the settings screen then mounting and NOT writing it back (the `accept` in `refresh`); the
run offer undoing two edits to the same record in the right order; the ownership refusal
declining to strand a question and then allowing the same undo once the run took the
question first; and `Ctrl+Z` inside a textarea leaving the journal alone.

### Stage 23 — Command palette

`src/lib/search.ts` (pure), `components/CommandPalette.svelte`, mounted in the vault layout
and opened with `Ctrl/Cmd+K`. Sources the existing nav array, `review.snapshot` and a small
command registry, exactly as planned. The accessibility contract holds and was driven by
keyboard alone: `role="dialog"`, `aria-modal`, focus trapped across the two tabbable
elements, `aria-activedescendant` tracking the active row, Escape closing, focus restored to
the element that had it.

**Matching is two passes, and the plan's "scored subsequence match" needed the second one.**
Forward-greedy answers whether it matches and finds the earliest end; on its own it aligns
every character as far left as possible, so "spread" against "Describe the spread"
highlighted the `s` of "Describe" and then "pread". The backward pass re-walks from that end
taking the LAST position for each character, which lands the whole run on the word somebody
typed. The browser found this by looking wrong, not by failing.

**An acronym across word starts outscores a leading run**, and a test says so, because it
looks like a bug for a second: "des" at "Data extraction summary" beats "des" at "Describing
data". Typing initials is how a palette gets used.

**Two additions the plan did not name.** `review.refresh(vaultId)`, past `load`'s guard, so
the palette never offers a collection deleted a minute ago — the same shape as the store
refreshes stage 22 added. And `segments()` beside `rank()`, so highlighting is string
arithmetic with a test rather than an off-by-one nobody would catch by looking.

**Verification note, and it is the fifth entry on CLAUDE.md's browser-found list.** The
keydown handler was bound on the backdrop AND the dialog. Focus is trapped inside the
dialog, so every key already bubbled through it and each keystroke ran twice: one press of
ArrowDown moved the selection two rows. Nothing errors, nothing logs, and it reads as a
twitchy trackpad. Also caught by driving it: `aria-controls` pointing at a listbox that is
not rendered when nothing matches — a dangling reference assistive technology cannot
resolve, now removed alongside `aria-expanded` and `aria-activedescendant`.

**Two of my own test premises were wrong before the code was.** Both were comparisons —
"this label should outscore that one" — written from intuition and contradicted by the
arithmetic. The scorer was right both times. Comparison tests over a scoring function need
the numbers worked out first, or they pin an opinion rather than a behaviour.

---

## Cross-cutting

These held across the eleven stages and are the ones to expect again.

**`/help` was edited in most of them.** It names buttons and goes stale the moment a screen
changes. Three stages *removed* lines from `#missing` — 20, 22 and 23 — and stage 22 also
had to correct three delete confirmations that said "This cannot be undone" and no longer
could. Budget for it per change; a cleanup pass at the end is how the guide gets rewritten
from memory.

**`remap.ts` is the file that gets forgotten.** It broke in stage 15 for a field added in the
same commit, two lines below a comment warning about it, with every test passing. Stages 16,
17 and 19 all add or move id-keyed data.

**Never put literal control characters in source.** `architecture.test.ts` guards it.

## Verification, per change

Unchanged, and it earned every line: five silent bugs were found by step 3 and none by the
suite.

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
