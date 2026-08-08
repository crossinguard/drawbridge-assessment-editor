# Drawbridge — build brief

You are building a new application from scratch in this repository. Read this whole file
before writing code.

## 1. What this is

A **private, local-first web app for authoring and managing course assessments**. It
replaces a miserable workflow of writing tests, quizzes, discussion prompts and rubrics in
Microsoft Word.

The user is an instructor who teaches several courses (statistics among them) and needs to
author and maintain: unit tests, quizzes, discussion board prompts, rubric-assessed tasks,
and other formative and summative assessments — while keeping them aligned to a course
outcome hierarchy and knowing what is and is not covered.

**The centre of gravity is information management, not delivery.** This app never
administers an assessment to a student and never grades one. It is where assessments are
written, organised, aligned to outcomes, reviewed and revised.

### Constraints that shape everything

- **No backend.** No server, no database, no account, no telemetry, no network calls. The
  app is static files. Netlify only serves them.
- **Offline-first.** Installable as a PWA and fully functional with no network.
- **Runs on a locked-down Windows work machine** (no installs, browser only) and on Linux
  at home. This is why it is a web app.
- **Will eventually become a desktop app** (Tauri). Architect for that now; do not build
  it now.
- **No vendor lock.** What leaves the app is open, documented and readable by other tools —
  plain zip, plain JSON with a published schema, plain Markdown, plain CSV. Not because the
  app is designed around interoperability, but because the file types are ordinary ones.
- **Grows with the user.** Every course has different requirements. Vocabularies and fields
  are data the user edits, never enum literals in code.

### Explicitly out of scope for v1

- Word/`.docx` export — likely a separate tool later. Do not build it. Do not design for it.
- LMS interchange (QTI, Moodle XML, GIFT) — not a goal. Do not shape the model around it.
- Student delivery, grading, submissions, analytics.
- Multi-user, sharing, sync, cloud.

## 2. Principles

These are load-bearing. Put them in `CLAUDE.md` as you go, with the reasoning, so they
survive into later sessions.

**Vocabularies are always data.** Statuses, collection kinds, rubric level sets, outcome
tier names, tag dimensions — all defined per vault and edited by the user. Never
special-case a particular status or kind in code. A course that invents a new one must not
need a code change.

**Custom fields round-trip untouched.** Any field the app does not recognise is preserved
exactly through load, edit, export and import. This is the extension seam.

**Validation never blocks.** An assessment is half-written for weeks. Rules surface in a
panel; nothing prevents a save, closes a view or rewrites content.

**A rubric criterion is worth its best level, not the sum of its levels.** Those are
alternatives. A multi-part item *is* the sum of its parts. Say so in the UI — write "worth
up to 4 pt" — so nobody reports it as a bug.

**Items belong to exactly one collection.** There is no shared item pool in v1 and no
reference indirection. See §4.3.

**Storage is behind an interface.** All persistence goes through a `Repository` port. The
IndexedDB adapter is the only implementation for now; a filesystem adapter replaces it for
the desktop build without touching anything above.

**The export bundle is self-describing.** It contains a `README.md` explaining its own
layout and a `manifest.json` with a schema version. Someone who finds the zip in five years
can understand it without the app.

**Data lives only in the browser.** Call `navigator.storage.persist()` on first run,
surface the result honestly, and make export easy and obvious. Losing a term's work to a
cleared cache would be unforgivable.

## 3. Stack

| | |
| --- | --- |
| Framework | SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-static` |
| Language | TypeScript, `strict: true` |
| Styling | Tailwind 4, CSS-first (`@theme` in one CSS entry, no `tailwind.config.js`) |
| Storage | IndexedDB via **Dexie 4** |
| Schema | **Zod** — the single source of truth; TS types come from `z.infer` |
| Zip | **fflate** |
| Markdown | **marked** for rendering; sanitise output |
| Tests | **Vitest** (`environment: 'node'` for domain, `jsdom` only if a component test is genuinely needed) |
| PWA | `@vite-pwa/sveltekit` |
| Deploy | Netlify, static publish of `build/` |

Prerender everything (`export const prerender = true` in the root layout) with
`fallback: 'index.html'` so client-side routes resolve. Add `netlify.toml` with
`publish = "build"`, `command = "pnpm build"` and a SPA redirect.

Use `pnpm`. Gates are `pnpm check` (svelte-check + tsc) and `pnpm test`. Both must be clean
before any stage is considered done. Do not add a linter.

## 4. Domain model

Define every entity as a Zod schema in `src/lib/domain/schema.ts` and derive TypeScript
types from it. That file is the contract: import validation, defaults and types all come
from one place.

All entities carry `id` (uuid), `createdAt`, `updatedAt`, and `fields: Record<string,
unknown>` for user-defined custom fields.

### 4.1 Vault

A course. The top-level container; everything else belongs to one.

```
Vault { id, name, code, term?, description?, config: VaultConfig, fields }

VaultConfig {
  outcomeTiers:     string[]        // e.g. ["Course Outcome","Evidence Outcome","Learning Objective"]
  outcomePattern?:  string          // regex, advisory shape check for codes
  statuses:         Vocab[]         // ordered; e.g. drafted → reviewed → ready → retired
  collectionKinds:  Vocab[]         // e.g. bank, quiz, exam, task, discussion, survey
  levelSets:        LevelSet[]      // named rubric level sets
  tagDimensions:    TagDimension[]  // e.g. difficulty, bloom, source
  customFields:     FieldDef[]
}

Vocab       { key, label, colour? }
LevelSet    { id, name, levels: { id, name, points }[] }   // ordered best-first
TagDimension{ key, label, values: string[], ordered: boolean }
FieldDef    { key, label, type, options?, appliesTo: ('item'|'collection'|'outcome'|'rubric')[] }
            // type: text | longtext | select | multiselect | number | date | boolean
```

`config` is the flexibility seam. Ship sensible defaults for a new vault, and make every
part of it editable in a settings screen.

### 4.2 Outcome

A tree. Depth is whatever the user makes it; tier *names* come from
`config.outcomeTiers` and are labels, not structure.

```
Outcome { id, vaultId, parentId: string | null, order, code, text, notes?, fields }
```

`code` is what items align to (`EO1.1`). Codes should be unique within a vault — flag
duplicates as a validation issue, do not enforce.

### 4.3 Collection

**The single container shape.** An item bank, a quiz, an exam, a discussion set and a task
are all Collections that differ only by `kind`, which comes from
`config.collectionKinds`. Do not build separate types for them.

```
Collection {
  id, vaultId, kind, title, description?, instructions?,
  status, order,
  sections: Section[],        // optional grouping: "Part I — Descriptive statistics"
  declaredPoints?: number,    // cross-checked against the computed total, advisory
  rubricId?: string,          // when the whole collection is rubric-scored
  fields
}

Section { id, title, description?, order }
```

**Items belong to exactly one collection.** Ownership, not reference. Items are generally
not reused across collections — a quiz item does not appear on an exam, and two item banks
do not overlap. Provide **"Copy items to…"** for the occasional exception; it makes
independent copies that then diverge, which is the intended behaviour.

A later **assembly layer** (out of scope now, but do not make it impossible) would let a
form — *practice*, *first take*, *second take* — draw items from one or more banks, and
there an item may legitimately appear in more than one form. Keep `Item` free of any
assumption that its collection is its only context: give it a stable id, keep its outcome
alignment and scoring self-contained, and do not bake `collectionId` into anything but
ownership.

### 4.4 Item

Owned by a collection, ordered within it, optionally inside a section.

```
Item {
  id, collectionId, sectionId?: string, order,
  kind: ItemKind,
  stem: string,               // Markdown
  options: Option[],          // choice | multi | trueFalse
  expected?: string,          // shortAnswer | essay — the model answer
  accepted?: string[],        // shortAnswer — other accepted responses
  rationale?: string,
  feedback?: string,
  points?: number,
  outcomeIds: string[],
  rubricId?: string,          // essay | discussion | task items
  discussion?: DiscussionSpec,
  parts: Item[],              // group — nested items
  stimulusId?: string,        // item this one reads from
  tags: Record<string,string>,
  status: string,
  log: LogEntry[],
  fields
}

Option    { id, text, correct: boolean, feedback?: string }
LogEntry  { id, date, kind, text, author? }

DiscussionSpec {
  initialPost: { dueNote?, minWords?, requirements? }
  replies:     { count?, minWords?, dueNote?, requirements? }
}
```

**ItemKind** — an explicit field. (The predecessor derived answer kind from content because
markdown had nowhere to declare it; structured data does, so declare it.)

| kind | shape |
| --- | --- |
| `choice` | options, exactly one correct |
| `multi` | options, two or more correct |
| `trueFalse` | two fixed options |
| `shortAnswer` | `expected` + `accepted[]`, numeric or text |
| `essay` | `expected` as a model answer, optional `rubricId` |
| `discussion` | stem as the prompt + `discussion` spec + usually a `rubricId` |
| `group` | container; `parts` are its sub-items; worth the **sum** of its parts |
| `stimulus` | a shared passage, data table or figure; carries no points; other items point at it via `stimulusId` |

`matching` and `ordering` are plausible later additions — leave room, build neither now.

### 4.5 Rubric

**Rubrics are shared**, unlike items — a discussion participation rubric gets reused every
week. They belong to the vault and are referenced by id.

```
Rubric {
  id, vaultId, title, description?,
  levels: { id, name, points }[],          // ordered best-first, from a LevelSet or bespoke
  criteria: Criterion[],
  fields
}

Criterion {
  id, title, description?, order,
  outcomeIds: string[],
  weight?: number,
  descriptors: Record<levelId, string>,    // may be sparse; missing ones are a warning
}
```

**Scoring.** A criterion is worth its **best** level. A rubric total is the **sum of its
criteria maxima**. Show this in words.

### 4.6 Points, computed

- `group` item → sum of `parts`
- rubric-scored item → the rubric total
- item with its own `points` → that value wins over anything derived
- collection total → sum of top-level items
- `declaredPoints` mismatch → validation warning, never a correction

## 5. Architecture

```
src/lib/
  domain/        Zod schemas, derived types, pure computations.
                 Depends on nothing. Points, coverage, validation live here.
  repo/          The Repository port + the Dexie adapter. The only module that
                 knows about IndexedDB.
  export/        Bundle writer and reader: zip, JSON, Markdown, CSV.
                 Depends on domain only.
  stores/        Svelte runes tying the above to the UI.
  components/    UI. Reads stores, calls repo, renders domain.
routes/          SvelteKit routes (see below).
```

`domain/` must stay pure and DOM-free so it can be tested headlessly. It must never import
from `repo/`, `stores/` or anything Svelte. This is the rule that keeps the model testable.

### Repository port

```ts
interface Repository {
  vaults:      Crud<Vault>
  outcomes:    Crud<Outcome>     & { listByVault(vaultId): Promise<Outcome[]> }
  collections: Crud<Collection>  & { listByVault(vaultId): Promise<Collection[]> }
  items:       Crud<Item>        & { listByCollection(collectionId): Promise<Item[]> }
  rubrics:     Crud<Rubric>      & { listByVault(vaultId): Promise<Rubric[]> }
  exportVault(vaultId): Promise<VaultSnapshot>
  importVault(snapshot: VaultSnapshot, mode: 'new' | 'merge'): Promise<string>
}
```

One interface, one adapter now (`DexieRepository`), a filesystem adapter later for Tauri.
Nothing above `repo/` may import Dexie.

### Routes

```
/                                   vault list, create, import
/v/[vaultId]                        dashboard — coverage summary, recent work, warnings
/v/[vaultId]/outcomes               the outcome tree
/v/[vaultId]/collections            all collections, grouped by kind
/v/[vaultId]/c/[collectionId]       item authoring — the main working screen
/v/[vaultId]/rubrics                rubric list
/v/[vaultId]/rubrics/[rubricId]     rubric grid editor
/v/[vaultId]/coverage               outcome × collection matrix
/v/[vaultId]/settings               vocabularies, custom fields, vault metadata
/help                               the in-app guide
```

### UI expectations

- **Keyboard-first.** A `Ctrl/Cmd+K` command palette that reaches every vault, collection,
  item and command. Real shortcuts for the frequent actions (new item, duplicate, move
  up/down, cycle status, save-and-next).
- **Item authoring is the screen that must feel good.** A scrolling column of item cards,
  each fully editable in place, keyboard-navigable, with drag or keyboard reordering.
  Every text field accepts Markdown and shows a rendered preview.
- **Autosave**, debounced, with an honest save indicator. No save button.
- **Undo/redo** across structured edits, not just within a text field.
- Light and dark themes driven by a single `data-theme` attribute on `:root`, so the whole
  tree including any embedded editor restyles at once. Do not use Tailwind's `dark:`
  variant.
- Responsive down to a laptop screen; this is a desktop-class tool, not a phone app.

## 6. Export and import

One command produces `drawbridge-<vault-code>-<YYYY-MM-DD>.zip`:

```
README.md              what this bundle is, what each file holds, how to read it
manifest.json          { schemaVersion, exportedAt, appVersion, vaultId, counts }
vault.json             vault record + full config (vocabularies, custom field defs)
outcomes.json          the outcome tree, lossless
outcomes.md            the same tree as a readable nested list
rubrics/<slug>.json
rubrics/<slug>.md      criteria × levels as a Markdown table
collections/<slug>.json
collections/<slug>.md  the assessment as readable Markdown
items.csv              every item flattened — id, collection, kind, stem, outcomes, points, status
coverage.csv           outcome × collection counts and points
```

**JSON is the lossless form and the one `import` reads.** Markdown and CSV are for humans
and other tools; the importer ignores them. Validate every JSON file with Zod on import and
report problems per-file rather than failing the whole bundle.

Import offers **new vault** or **merge into existing** (match on id, then on code; prompt
on collision). Also support exporting a single collection or rubric.

### Markdown export dialect

Readable first, faithful second. Frontmatter for metadata, `##` headings per item with the
id, outcome and points as inline code tags, task-list options with `[x]` marking the key,
and `**Answer.** / **Rationale.**` blocks. Something like:

```markdown
---
title: Unit 1 Test
kind: exam
points: 20
---

## Part I — Descriptive statistics

## Median of five shifts `#001` `@EO1.1` `1pt`

A charge nurse records patients over five shifts: 24, 28, 22, 31, 25.
What is the median?

- [ ] 24
- [x] 25
- [ ] 26
- [ ] 28

**Rationale.** Ordered: 22, 24, 25, 28, 31 → 25.
```

Keep it parseable enough that a future importer could read it back, but do not build that
importer now — JSON is the round-trip path.

## 7. Build order

Each stage ends with `pnpm check` and `pnpm test` clean, and leaves the app working. Commit
per stage with a message explaining *why*, not just what.

**Stage 0 — Scaffold.** SvelteKit + adapter-static, Tailwind 4, TypeScript strict, Vitest,
Dexie, Zod, PWA plugin, `netlify.toml`, `CLAUDE.md` seeded with §2. Deploy a hello-world to
Netlify and confirm it installs as a PWA before writing a line of domain code.

**Stage 1 — Domain.** Every Zod schema, derived types, and the pure computations: points,
coverage, validation rules. No UI. This stage is almost entirely tests — the model is the
thing most expensive to get wrong.

**Stage 2 — Repository.** The port and the Dexie adapter, with tests against
`fake-indexeddb`. Include `navigator.storage.persist()` and surface the outcome.

**Stage 3 — Vaults and settings.** Create, rename, delete, switch. The settings screen for
vocabularies and custom field definitions — build this early, because everything downstream
reads it.

**Stage 4 — Outcomes.** Tree view with create, edit, reorder, nest, and inline codes.

**Stage 5 — Collections and selected-response items.** The main authoring screen: choice,
multi, trueFalse, shortAnswer. Options, keys, per-option feedback, points, rationale,
outcome alignment, status, sections, reordering, duplicate, delete.

**Stage 6 — Export and import.** Do this before more content types. Data currently exists
in exactly one place; the user needs a way to get it out and back long before the app is
feature-complete. Include a "you have not exported in N days" nudge.

**Stage 7 — Rubrics.** Grid editor, level sets from config, attach to items and
collections.

**Stage 8 — Discussion prompts, essays, groups and stimuli.** The remaining item kinds.

**Stage 9 — Coverage and validation.** The outcome × collection matrix, uncovered-leaf
detection, and the advisory problems panel across the vault.

**Stage 10 — Markdown and CSV export.** Add to the bundle.

**Stage 11 — PWA polish.** Offline verification, install prompt, update flow, icons.

**Stage 12 — In-app guide.** A `/help` route: a short quickstart, then reference sections
per item kind and one on setting up and customising a vault. Write it last, against the
shipped UI, so it is accurate the first time.

Stages 1–2 are the ones to be slow and careful about. Stages 5 and 7 are where the product
becomes worth using.

## 8. Verification

- `pnpm check` and `pnpm test` clean at every stage — these are the only automated gates.
- Domain tests carry the weight: points arithmetic across groups and rubrics, coverage
  computation, every validation rule, and bundle round-tripping (export → import → deep
  equal).
- Repository tests run against `fake-indexeddb`.
- Verify the running app in a browser at each UI stage rather than assuming: create a
  vault, author an item, reload the page and confirm it persisted, export, wipe, re-import,
  and confirm the vault comes back identical.
- Before calling the PWA done: build, serve, load once, go offline, reload, and confirm the
  app still opens and the data is still there.

## 9. Notes for whoever builds this

- The domain model in §4 is the distillation of a working predecessor. Trust it, but say so
  if something does not survive contact with the UI — better to change the schema in stage
  1 than to work around it for a year.
- Prefer boring, well-understood choices. This tool has to be maintainable by one person
  alongside a teaching load.
- Write the comments that explain *why*. The next session has none of this context.
- Ask before inventing scope. "Grows with me" means an extension seam, not every feature
  built up front.
