import { newCollection, newItem, newOutcome, newRubric, newVault } from './defaults';
import { newId } from './ids';
import type {
  Collection,
  Criterion,
  Item,
  ItemKind,
  Level,
  Option,
  Outcome,
  Rubric,
  Vault
} from './schema';

/*
  Test-only builders. Not imported by any application code.

  They exist so a test can say what it is actually about — "a group with two parts" —
  instead of spelling out fifteen schema defaults each time. Every builder produces a
  value that would pass its schema, so a test never accidentally asserts against a
  shape the app could not store.
*/

export function aVault(overrides: Partial<Vault> = {}): Vault {
  return { ...newVault({ name: 'Statistics', code: 'STAT101' }), ...overrides };
}

export function anOutcome(overrides: Partial<Outcome> = {}): Outcome {
  return {
    ...newOutcome({ vaultId: 'vault-1', code: 'EO1.1', text: 'Compute a median.' }),
    ...overrides
  };
}

export function aCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    ...newCollection({ vaultId: 'vault-1', kind: 'quiz', title: 'Unit 1 Test' }),
    ...overrides
  };
}

export function anItem(kind: ItemKind, overrides: Partial<Item> = {}): Item {
  return {
    ...newItem({ collectionId: 'collection-1', kind, stem: 'A question.' }),
    ...overrides
  };
}

export function options(...specs: Array<[text: string, correct: boolean]>): Option[] {
  return specs.map(([text, correct]) => ({ id: newId(), text, correct }));
}

export function levels(...specs: Array<[name: string, points: number]>): Level[] {
  return specs.map(([name, points]) => ({ id: newId(), name, points }));
}

/** A criterion with a descriptor filled in for every level, so nothing is sparse. */
export function aCriterion(
  title: string,
  levelList: readonly Level[],
  overrides: Partial<Criterion> = {}
): Criterion {
  return {
    id: newId(),
    title,
    order: 0,
    outcomeIds: [],
    descriptors: Object.fromEntries(
      levelList.map((level) => [level.id, `${title} at ${level.name}`])
    ),
    ...overrides
  };
}

export function aRubric(overrides: Partial<Rubric> = {}): Rubric {
  return { ...newRubric({ vaultId: 'vault-1', title: 'Discussion rubric' }), ...overrides };
}

/** The lookup shape every scoring and coverage function takes. */
export function scoringContext(...rubrics: Rubric[]) {
  return { rubricsById: new Map(rubrics.map((rubric) => [rubric.id, rubric])) };
}
