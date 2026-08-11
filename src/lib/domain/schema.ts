import { z } from 'zod';

/*
  The contract. Every domain type in this app is inferred from a schema in this file;
  none are declared by hand elsewhere. Validation, defaults and types therefore cannot
  disagree with each other.

  Two conventions run through everything here.

  1. Every entity is a `looseObject`, not an `object`.

     Zod strips unknown keys by default. That would make the app quietly delete any
     field written by a newer version of itself, or by a hand-edit, the first time a
     bundle round-tripped through an older build. `looseObject` keeps them. This is
     half of the extension seam; the other half is the explicit `fields` bag, which is
     where the *user's* declared custom fields live.

  2. Vocabularies are strings, not enums.

     `status`, `Collection.kind` and tag values are plain strings validated advisorily
     against the vault's config, never `z.enum`. A course that invents a new status
     must not need a schema change. `ItemKind` is the deliberate exception — see below.
*/

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/*
  Ids are uuids in practice — `newId()` generates them — but the schema only asks for
  a non-empty string. Nothing downstream parses an id, so rejecting an entire imported
  file because someone hand-wrote `id: "outcome-1"` would cost the user real work to
  buy nothing.
*/
const id = z.string().min(1);

/** Machine-managed. Always written by the app as `new Date().toISOString()`. */
const timestamp = z.iso.datetime();

/** User-defined custom fields. Preserved verbatim; the app never interprets these. */
const fields = z.record(z.string(), z.unknown()).default({});

const entity = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
  fields
};

// ---------------------------------------------------------------------------
// Vault configuration — the flexibility seam
// ---------------------------------------------------------------------------

export const VocabSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  colour: z.string().optional()
});

/** A single rubric level. Ordered best-first wherever a list of these appears. */
export const LevelSchema = z.looseObject({
  id,
  name: z.string(),
  points: z.number()
});

export const LevelSetSchema = z.looseObject({
  id,
  name: z.string(),
  levels: z.array(LevelSchema).default([])
});

export const TagDimensionSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  values: z.array(z.string()).default([]),
  ordered: z.boolean().default(false)
});

export const FieldTypeSchema = z.enum([
  'text',
  'longtext',
  'select',
  'multiselect',
  'number',
  'date',
  'boolean'
]);

export const FieldTargetSchema = z.enum(['item', 'collection', 'outcome', 'rubric']);

export const FieldDefSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  type: FieldTypeSchema,
  /** Only meaningful for `select` and `multiselect`. */
  options: z.array(z.string()).optional(),
  appliesTo: z.array(FieldTargetSchema).default([])
});

export const VaultConfigSchema = z.looseObject({
  /** Labels for depth in the outcome tree. Names only — they do not constrain structure. */
  outcomeTiers: z.array(z.string()).default([]),
  /** Advisory shape check for outcome codes, as a regex source string. */
  outcomePattern: z.string().optional(),
  /** Ordered, e.g. drafted → reviewed → ready → retired. */
  statuses: z.array(VocabSchema).default([]),
  collectionKinds: z.array(VocabSchema).default([]),
  levelSets: z.array(LevelSetSchema).default([]),
  tagDimensions: z.array(TagDimensionSchema).default([]),
  customFields: z.array(FieldDefSchema).default([])
});

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** A course. The top-level container; everything else belongs to exactly one. */
export const VaultSchema = z.looseObject({
  ...entity,
  name: z.string(),
  code: z.string(),
  term: z.string().optional(),
  description: z.string().optional(),
  config: VaultConfigSchema
});

/**
 * A node in the outcome tree. Depth is whatever the user makes it; `config.outcomeTiers`
 * supplies display labels per depth and nothing more.
 */
export const OutcomeSchema = z.looseObject({
  ...entity,
  vaultId: id,
  parentId: z.string().nullable().default(null),
  order: z.number().int().default(0),
  /** What items align to, e.g. `EO1.1`. Uniqueness within a vault is advisory. */
  code: z.string(),
  text: z.string(),
  notes: z.string().optional()
});

export const SectionSchema = z.looseObject({
  id,
  title: z.string(),
  description: z.string().optional(),
  order: z.number().int().default(0)
});

/**
 * The single container shape. An item bank, a quiz, an exam, a discussion set and a
 * task are all Collections differing only by `kind`, which is a key from
 * `config.collectionKinds`. There are deliberately no separate types for them.
 */
export const CollectionSchema = z.looseObject({
  ...entity,
  vaultId: id,
  kind: z.string(),
  title: z.string(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  status: z.string().default(''),
  order: z.number().int().default(0),
  sections: z.array(SectionSchema).default([]),
  /** The author's stated total. Cross-checked against the computed one; never corrected. */
  declaredPoints: z.number().optional(),
  /** Set when the whole collection is rubric-scored rather than per-item. */
  rubricId: z.string().optional()
});

export const OptionSchema = z.looseObject({
  id,
  text: z.string(),
  correct: z.boolean().default(false),
  feedback: z.string().optional()
});

export const LogEntrySchema = z.looseObject({
  id,
  /** User-entered, so deliberately unconstrained — a date or a datetime both read fine. */
  date: z.string(),
  kind: z.string(),
  text: z.string(),
  author: z.string().optional()
});

export const DiscussionSpecSchema = z.looseObject({
  initialPost: z
    .looseObject({
      dueNote: z.string().optional(),
      minWords: z.number().optional(),
      requirements: z.string().optional()
    })
    .default({}),
  replies: z
    .looseObject({
      count: z.number().optional(),
      minWords: z.number().optional(),
      dueNote: z.string().optional(),
      requirements: z.string().optional()
    })
    .default({})
});

/*
  ItemKind is the one closed vocabulary in the model, and it is closed on purpose.

  Unlike a status or a collection kind, each of these implies a different *shape* —
  `choice` needs options, `group` needs parts, `stimulus` carries no points — so code
  must branch on it and adding a member is a code change by definition. The predecessor
  derived answer kind from content because Markdown had nowhere to declare it;
  structured data does, so it is declared.

  `matching` and `ordering` are plausible later additions. Nothing here forecloses them.
*/
export const ItemKindSchema = z.enum([
  'choice', // options, exactly one correct
  'multi', // options, two or more correct
  'trueFalse', // two fixed options
  'shortAnswer', // expected + accepted[], numeric or text
  'essay', // expected as a model answer, optional rubric
  'discussion', // stem as prompt + discussion spec + usually a rubric
  'group', // container; worth the SUM of its parts
  'stimulus' // shared passage/table/figure; carries no points
]);

/*
  Every field of an Item except `parts`.

  Exported because it is the non-recursive half: anything that wants `.shape`,
  `.extend()` or `.partial()` — a form builder, most likely — should reach for this.
  `ItemSchema` below is annotated as a plain `ZodType` to break the type cycle, which
  costs it those object-only methods.
*/
export const ItemBaseSchema = z.looseObject({
  ...entity,
  collectionId: id,
  sectionId: z.string().optional(),
  order: z.number().int().default(0),
  kind: ItemKindSchema,
  /** Markdown. */
  stem: z.string().default(''),
  options: z.array(OptionSchema).default([]),
  /** The model answer, for shortAnswer and essay. */
  expected: z.string().optional(),
  /** Other responses to accept, for shortAnswer. */
  accepted: z.array(z.string()).default([]),
  rationale: z.string().optional(),
  feedback: z.string().optional(),
  /** An explicit value here wins over anything computed. See points.ts. */
  points: z.number().optional(),
  outcomeIds: z.array(z.string()).default([]),
  rubricId: z.string().optional(),
  discussion: DiscussionSpecSchema.optional(),
  /** The item this one reads from, e.g. a shared passage. */
  stimulusId: z.string().optional(),
  tags: z.record(z.string(), z.string()).default({}),
  status: z.string().default(''),
  log: z.array(LogEntrySchema).default([])
});

type ItemBase = z.infer<typeof ItemBaseSchema>;
type ItemBaseInput = z.input<typeof ItemBaseSchema>;

/*
  `parts` holds a `group` item's sub-items inline rather than as separate rows: they
  are never reused independently, and splitting them out would put their ordering in
  two places at once.

  The type has to be written by hand. TypeScript cannot infer a schema that appears in
  its own initialiser, so Zod's getter-recursion idiom alone yields an implicit `any`
  here. Declaring `Item` and `ItemInput` explicitly and annotating the schema breaks
  the cycle. The two differ because of `.default()` — on the way in `parts` is
  optional, on the way out it is always an array — and conflating them would make
  every parsed item look like it might be missing its own defaults.

  Note what is NOT here: nothing assumes an item's collection is its only context. The
  id is stable, and outcome alignment and scoring are self-contained, so a later
  assembly layer can draw one item into several forms without reshaping this.
*/
export type Item = ItemBase & { parts: Item[] };
export type ItemInput = ItemBaseInput & { parts?: ItemInput[] };

export const ItemSchema: z.ZodType<Item, ItemInput> = z.lazy(() =>
  ItemBaseSchema.extend({ parts: z.array(ItemSchema).default([]) })
);

export const CriterionSchema = z.looseObject({
  id,
  title: z.string(),
  description: z.string().optional(),
  order: z.number().int().default(0),
  outcomeIds: z.array(z.string()).default([]),
  weight: z.number().optional(),
  /** Keyed by level id. May be sparse — missing descriptors are a warning, not an error. */
  descriptors: z.record(z.string(), z.string()).default({}),
  /**
   * What this criterion scores at each level, overriding the points declared on the
   * level itself. Keyed by level id and sparse in the same way as `descriptors`: a
   * level with no entry here is worth whatever its column says.
   *
   * This is what lets one criterion matter more than another on a shared scale —
   * Thesis running 10/7/4 while Mechanics runs 4/3/2 — without giving every criterion
   * its own columns.
   */
  levelPoints: z.record(z.string(), z.number()).default({})
});

/**
 * Rubrics are shared, unlike items — a discussion participation rubric gets reused
 * every week — so they belong to the vault and are referenced by id.
 */
export const RubricSchema = z.looseObject({
  ...entity,
  vaultId: id,
  title: z.string(),
  description: z.string().optional(),
  /** Ordered best-first, from a LevelSet or bespoke. */
  levels: z.array(LevelSchema).default([]),
  criteria: z.array(CriterionSchema).default([]),
  /**
   * Rubrics whose criteria are appended, in order, after this rubric's own — the
   * boilerplate tail a course repeats on every task. Composed live, so editing the tail
   * updates every rubric using it.
   *
   * An array because "professionalism tail" plus "citation tail" is one course away.
   * The UI offers one picker; the schema does not need to be revisited when it offers
   * two.
   *
   * An appended criterion is scored against ITS OWN rubric's levels, never the host's.
   * See `effectiveCriteria` in `rubrics.ts` — that is the decision this whole feature
   * rests on.
   */
  appends: z.array(z.string()).default([])
});

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/** Everything in one vault. The unit of export, import and backup. */
export const VaultSnapshotSchema = z.looseObject({
  vault: VaultSchema,
  outcomes: z.array(OutcomeSchema).default([]),
  collections: z.array(CollectionSchema).default([]),
  items: z.array(ItemSchema).default([]),
  rubrics: z.array(RubricSchema).default([])
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Vocab = z.infer<typeof VocabSchema>;
export type Level = z.infer<typeof LevelSchema>;
export type LevelSet = z.infer<typeof LevelSetSchema>;
export type TagDimension = z.infer<typeof TagDimensionSchema>;
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type FieldTarget = z.infer<typeof FieldTargetSchema>;
export type FieldDef = z.infer<typeof FieldDefSchema>;
export type VaultConfig = z.infer<typeof VaultConfigSchema>;
export type Vault = z.infer<typeof VaultSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Option = z.infer<typeof OptionSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type DiscussionSpec = z.infer<typeof DiscussionSpecSchema>;
export type ItemKind = z.infer<typeof ItemKindSchema>;
// `Item` and `ItemInput` are declared beside ItemSchema — they cannot be inferred.
export type Criterion = z.infer<typeof CriterionSchema>;
export type Rubric = z.infer<typeof RubricSchema>;
export type VaultSnapshot = z.infer<typeof VaultSnapshotSchema>;
