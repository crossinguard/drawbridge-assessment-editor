import { newId, nowIso } from './ids';
import type {
  Collection,
  Item,
  ItemKind,
  Outcome,
  Rubric,
  Vault,
  VaultConfig
} from './schema';

/*
  Starting points, not rules.

  Everything in `defaultVaultConfig` is ordinary vault data the moment a vault exists —
  the settings screen can rename, reorder or delete any of it, and no code path may
  look up one of these keys by name. They are here so a new vault is usable in the
  first minute, and for no other reason.
*/

export function defaultVaultConfig(): VaultConfig {
  return {
    outcomeTiers: ['Course Outcome', 'Evidence Outcome', 'Learning Objective'],
    // Advisory only: flags codes like `EO1.1` that drift from the house style.
    outcomePattern: '^[A-Z]{1,4}\\d+(\\.\\d+)*$',
    statuses: [
      { key: 'drafted', label: 'Drafted', colour: '#94a3b8' },
      { key: 'reviewed', label: 'Reviewed', colour: '#60a5fa' },
      { key: 'ready', label: 'Ready', colour: '#34d399' },
      { key: 'retired', label: 'Retired', colour: '#cbd5e1' }
    ],
    /*
      Starting points, not rules. Every one of these is editable in Settings, and the
      capabilities are data precisely so that a course inventing "lab practical" can
      describe it without a code change.

      `itemKinds` absent means every kind — see CollectionKindSchema for why that is not
      the same as `[]`.
    */
    collectionKinds: [
      // A bank holds anything, and holds it to be drawn on later.
      { key: 'bank', label: 'Item bank', itemScoring: true, sections: true, rubricFirst: false },
      {
        key: 'quiz',
        label: 'Quiz',
        // Auto-markable kinds only. An essay in a quiz is possible, just not offered
        // by default — widen it here and the button appears.
        itemKinds: ['choice', 'multi', 'trueFalse', 'shortAnswer'],
        itemScoring: true,
        sections: true,
        rubricFirst: false
      },
      // Deliberately NOT narrowed: an exam mixes a passage, a group, a short answer and
      // an essay, which is exactly what the sample course's own exam does.
      { key: 'exam', label: 'Exam', itemScoring: true, sections: true, rubricFirst: false },
      {
        key: 'task',
        label: 'Task',
        // Scored as one piece by a rubric, so the prompt and its materials are all it
        // holds, and per-item points would be a number nobody uses.
        itemKinds: ['essay', 'stimulus'],
        itemScoring: false,
        sections: false,
        rubricFirst: true
      },
      {
        key: 'discussion',
        label: 'Discussion',
        itemKinds: ['discussion', 'stimulus'],
        itemScoring: false,
        sections: false,
        rubricFirst: true
      },
      {
        key: 'survey',
        label: 'Survey',
        // Answered but not marked, which is what itemScoring off says.
        itemKinds: ['choice', 'multi', 'shortAnswer'],
        itemScoring: false,
        sections: true,
        rubricFirst: false
      }
    ],
    levelSets: [
      {
        id: newId(),
        name: 'Four-point',
        // Best-first, always. Scoring reads levels[0] as the maximum.
        levels: [
          { id: newId(), name: 'Exemplary', points: 4 },
          { id: newId(), name: 'Proficient', points: 3 },
          { id: newId(), name: 'Developing', points: 2 },
          { id: newId(), name: 'Beginning', points: 1 }
        ]
      },
      {
        id: newId(),
        name: 'Complete / incomplete',
        levels: [
          { id: newId(), name: 'Complete', points: 1 },
          { id: newId(), name: 'Incomplete', points: 0 }
        ]
      }
    ],
    tagDimensions: [
      {
        key: 'difficulty',
        label: 'Difficulty',
        values: ['easy', 'moderate', 'hard'],
        ordered: true
      },
      {
        key: 'bloom',
        label: "Bloom's level",
        values: ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create'],
        ordered: true
      },
      {
        key: 'source',
        label: 'Source',
        values: ['original', 'adapted', 'textbook'],
        ordered: false
      }
    ],
    customFields: []
  };
}

// ---------------------------------------------------------------------------
// Entity factories
//
// Pure and explicit: they fill in ids, timestamps and every schema default so a
// caller never has to know which fields carry defaults. The repository writes what
// these return without further massaging.
// ---------------------------------------------------------------------------

function stamp() {
  const at = nowIso();
  return { id: newId(), createdAt: at, updatedAt: at, fields: {} };
}

export function newVault(input: {
  name: string;
  code: string;
  term?: string;
  description?: string;
  config?: VaultConfig;
}): Vault {
  return {
    ...stamp(),
    name: input.name,
    code: input.code,
    ...(input.term === undefined ? {} : { term: input.term }),
    ...(input.description === undefined ? {} : { description: input.description }),
    config: input.config ?? defaultVaultConfig()
  };
}

export function newOutcome(input: {
  vaultId: string;
  code: string;
  text: string;
  parentId?: string | null;
  order?: number;
  notes?: string;
}): Outcome {
  return {
    ...stamp(),
    vaultId: input.vaultId,
    parentId: input.parentId ?? null,
    order: input.order ?? 0,
    code: input.code,
    text: input.text,
    ...(input.notes === undefined ? {} : { notes: input.notes })
  };
}

export function newCollection(input: {
  vaultId: string;
  kind: string;
  title: string;
  status?: string;
  order?: number;
  description?: string;
  instructions?: string;
}): Collection {
  return {
    ...stamp(),
    vaultId: input.vaultId,
    kind: input.kind,
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
    status: input.status ?? '',
    order: input.order ?? 0,
    sections: []
  };
}

export function newItem(input: {
  collectionId: string;
  kind: ItemKind;
  stem?: string;
  sectionId?: string;
  order?: number;
  status?: string;
}): Item {
  return {
    ...stamp(),
    collectionId: input.collectionId,
    ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId }),
    order: input.order ?? 0,
    kind: input.kind,
    stem: input.stem ?? '',
    // trueFalse is the one kind whose options are fixed rather than authored, so it
    // is the one kind worth pre-filling. Everything else starts empty on purpose.
    options:
      input.kind === 'trueFalse'
        ? [
            { id: newId(), text: 'True', correct: false },
            { id: newId(), text: 'False', correct: false }
          ]
        : [],
    accepted: [],
    outcomeIds: [],
    tags: {},
    status: input.status ?? '',
    log: [],
    parts: []
  };
}

export function newRubric(input: {
  vaultId: string;
  title: string;
  levels?: Rubric['levels'];
  description?: string;
}): Rubric {
  return {
    ...stamp(),
    vaultId: input.vaultId,
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    levels: input.levels ?? [],
    criteria: [],
    appends: []
  };
}
