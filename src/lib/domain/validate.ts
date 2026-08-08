import { collectionPoints, flattenItems, itemPoints, type ScoringContext } from './points';
import { computeCoverage } from './coverage';
import type { Collection, Item, Outcome, Rubric, Vault } from './schema';

/*
  Advisory rules.

  Nothing in this file blocks anything. An assessment sits half-written for weeks and
  every rule below will fire during normal authoring — an item with no key yet, a
  collection whose points do not add up because two questions are still stubs. These
  populate a panel; they never prevent a save, close a view, or rewrite content.

  `severity` therefore ranks attention, not permission. Even `error` means "this is
  almost certainly wrong", never "you may not do this".

  Every rule is written against vault config rather than literals. There is no
  `status === 'ready'` here and there must never be one.
*/

export type Severity = 'error' | 'warning' | 'info';

export type EntityType = 'vault' | 'outcome' | 'collection' | 'item' | 'rubric';

export interface Issue {
  /** Stable across runs for the same problem, so a UI can keep a row selected. */
  id: string;
  ruleId: string;
  severity: Severity;
  entityType: EntityType;
  entityId: string;
  message: string;
}

export interface ValidationInput {
  vault: Vault;
  outcomes: readonly Outcome[];
  collections: readonly Collection[];
  /** Top-level items per collection id. */
  itemsByCollection: ReadonlyMap<string, readonly Item[]>;
  rubrics: readonly Rubric[];
}

/** Points can be fractional, so totals are compared with a tolerance, not `===`. */
const EPSILON = 1e-9;

function issue(
  ruleId: string,
  severity: Severity,
  entityType: EntityType,
  entityId: string,
  message: string
): Issue {
  return { id: `${ruleId}:${entityId}`, ruleId, severity, entityType, entityId, message };
}

export function validateVault(input: ValidationInput): Issue[] {
  const { vault, outcomes, collections, itemsByCollection, rubrics } = input;

  const issues: Issue[] = [];
  const rubricsById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  const context: ScoringContext = { rubricsById };
  const outcomeIds = new Set(outcomes.map((outcome) => outcome.id));
  const statusKeys = new Set(vault.config.statuses.map((status) => status.key));
  const kindKeys = new Set(vault.config.collectionKinds.map((kind) => kind.key));

  // -------------------------------------------------------------------------
  // Outcomes
  // -------------------------------------------------------------------------

  const byCode = new Map<string, Outcome[]>();
  for (const outcome of outcomes) {
    const group = byCode.get(outcome.code);
    if (group) group.push(outcome);
    else byCode.set(outcome.code, [outcome]);
  }

  for (const [code, group] of byCode) {
    if (group.length < 2) continue;
    for (const outcome of group) {
      issues.push(
        issue(
          'outcome.duplicate-code',
          'warning',
          'outcome',
          outcome.id,
          `Code ${code} is used by ${group.length} outcomes. Items aligned by code cannot tell them apart.`
        )
      );
    }
  }

  // The pattern is a house style, not a constraint — an outcome inherited from a
  // department document may legitimately not match.
  if (vault.config.outcomePattern !== undefined && vault.config.outcomePattern !== '') {
    let pattern: RegExp | null = null;
    try {
      pattern = new RegExp(vault.config.outcomePattern);
    } catch {
      issues.push(
        issue(
          'vault.bad-outcome-pattern',
          'warning',
          'vault',
          vault.id,
          `The outcome code pattern is not a valid regular expression, so codes are not being checked.`
        )
      );
    }

    if (pattern) {
      for (const outcome of outcomes) {
        if (!pattern.test(outcome.code)) {
          issues.push(
            issue(
              'outcome.code-shape',
              'info',
              'outcome',
              outcome.id,
              `Code ${outcome.code} does not match the vault's code pattern.`
            )
          );
        }
      }
    }
  }

  for (const outcome of outcomes) {
    if (outcome.parentId !== null && !outcomeIds.has(outcome.parentId)) {
      issues.push(
        issue(
          'outcome.dangling-parent',
          'error',
          'outcome',
          outcome.id,
          `${outcome.code} names a parent outcome that no longer exists. It is shown at the top level.`
        )
      );
    }
    if (outcome.text.trim() === '') {
      issues.push(
        issue('outcome.empty-text', 'warning', 'outcome', outcome.id, `${outcome.code} has no text.`)
      );
    }
  }

  // -------------------------------------------------------------------------
  // Rubrics
  // -------------------------------------------------------------------------

  for (const rubric of rubrics) {
    if (rubric.levels.length === 0) {
      issues.push(
        issue(
          'rubric.no-levels',
          'error',
          'rubric',
          rubric.id,
          `"${rubric.title}" has no levels, so every criterion is worth nothing.`
        )
      );
    }
    if (rubric.criteria.length === 0) {
      issues.push(
        issue(
          'rubric.no-criteria',
          'warning',
          'rubric',
          rubric.id,
          `"${rubric.title}" has no criteria yet.`
        )
      );
    }

    for (const criterion of rubric.criteria) {
      const missing = rubric.levels.filter(
        (level) => (criterion.descriptors[level.id] ?? '').trim() === ''
      );
      if (missing.length > 0 && rubric.levels.length > 0) {
        issues.push(
          issue(
            'rubric.sparse-descriptors',
            'warning',
            'rubric',
            `${rubric.id}:${criterion.id}`,
            `"${criterion.title}" has no descriptor for ${missing
              .map((level) => level.name)
              .join(', ')}.`
          )
        );
      }

      for (const outcomeId of criterion.outcomeIds) {
        if (!outcomeIds.has(outcomeId)) {
          issues.push(
            issue(
              'rubric.dangling-outcome',
              'error',
              'rubric',
              `${rubric.id}:${criterion.id}`,
              `"${criterion.title}" is aligned to an outcome that no longer exists.`
            )
          );
        }
      }

      // Weight is stored but not applied to totals — see rubricTotal in points.ts.
      // Saying so is the honest alternative to silently ignoring the field.
      if (criterion.weight !== undefined) {
        issues.push(
          issue(
            'rubric.weight-not-applied',
            'info',
            'rubric',
            `${rubric.id}:${criterion.id}`,
            `"${criterion.title}" has a weight, which is recorded but not applied to the rubric total.`
          )
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Collections and items
  // -------------------------------------------------------------------------

  for (const collection of collections) {
    if (!kindKeys.has(collection.kind)) {
      issues.push(
        issue(
          'collection.unknown-kind',
          'warning',
          'collection',
          collection.id,
          `"${collection.title}" has kind "${collection.kind}", which is not one of this vault's collection kinds.`
        )
      );
    }
    if (collection.status !== '' && !statusKeys.has(collection.status)) {
      issues.push(
        issue(
          'collection.unknown-status',
          'warning',
          'collection',
          collection.id,
          `"${collection.title}" has status "${collection.status}", which is not one of this vault's statuses.`
        )
      );
    }
    if (collection.rubricId !== undefined && !rubricsById.has(collection.rubricId)) {
      issues.push(
        issue(
          'collection.dangling-rubric',
          'error',
          'collection',
          collection.id,
          `"${collection.title}" points at a rubric that no longer exists.`
        )
      );
    }

    const topLevel = itemsByCollection.get(collection.id) ?? [];
    const all = flattenItems(topLevel);

    if (collection.declaredPoints !== undefined) {
      const computed = collectionPoints(collection, topLevel, context).points;
      if (Math.abs(computed - collection.declaredPoints) > EPSILON) {
        issues.push(
          issue(
            'collection.points-mismatch',
            'warning',
            'collection',
            collection.id,
            `"${collection.title}" declares ${collection.declaredPoints} points but its items add up to ${computed}.`
          )
        );
      }
    }

    const sectionIds = new Set(collection.sections.map((section) => section.id));
    const stimulusIds = new Set(
      all.filter((item) => item.kind === 'stimulus').map((item) => item.id)
    );

    for (const item of all) {
      issues.push(
        ...validateItem(item, {
          collection,
          context,
          outcomeIds,
          rubricsById,
          statusKeys,
          sectionIds,
          stimulusIds
        })
      );
    }
  }

  // -------------------------------------------------------------------------
  // Coverage
  // -------------------------------------------------------------------------

  const coverage = computeCoverage({ outcomes, collections, itemsByCollection, context });
  const outcomesById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));

  for (const outcomeId of coverage.uncoveredOutcomeIds) {
    const outcome = outcomesById.get(outcomeId);
    issues.push(
      issue(
        'coverage.uncovered-outcome',
        'warning',
        'outcome',
        outcomeId,
        `${outcome?.code ?? outcomeId} is not assessed anywhere in this vault.`
      )
    );
  }

  return issues;
}

interface ItemContext {
  collection: Collection;
  context: ScoringContext;
  outcomeIds: ReadonlySet<string>;
  rubricsById: ReadonlyMap<string, Rubric>;
  statusKeys: ReadonlySet<string>;
  sectionIds: ReadonlySet<string>;
  stimulusIds: ReadonlySet<string>;
}

function validateItem(item: Item, ctx: ItemContext): Issue[] {
  const issues: Issue[] = [];
  const correct = item.options.filter((option) => option.correct);

  /*
    Shape rules, one per kind. These are the only place in the codebase that branches
    on a vocabulary-looking value, and it is legitimate because ItemKind is a closed
    structural discriminant rather than a user vocabulary — see schema.ts.
  */
  switch (item.kind) {
    case 'choice':
      if (item.options.length === 0) {
        issues.push(issue('item.no-options', 'warning', 'item', item.id, `No answer options yet.`));
      } else if (correct.length !== 1) {
        issues.push(
          issue(
            'item.choice-key',
            'error',
            'item',
            item.id,
            correct.length === 0
              ? `No option is marked correct.`
              : `${correct.length} options are marked correct, but a single-answer item needs exactly one.`
          )
        );
      }
      break;

    case 'multi':
      if (item.options.length === 0) {
        issues.push(issue('item.no-options', 'warning', 'item', item.id, `No answer options yet.`));
      } else if (correct.length < 2) {
        issues.push(
          issue(
            'item.multi-key',
            'error',
            'item',
            item.id,
            `A multiple-response item needs at least two correct options; this has ${correct.length}.`
          )
        );
      }
      break;

    case 'trueFalse':
      if (item.options.length !== 2) {
        issues.push(
          issue(
            'item.true-false-options',
            'error',
            'item',
            item.id,
            `A true/false item needs exactly two options; this has ${item.options.length}.`
          )
        );
      } else if (correct.length !== 1) {
        issues.push(
          issue('item.true-false-key', 'error', 'item', item.id, `Neither option is marked correct.`)
        );
      }
      break;

    case 'shortAnswer':
      if ((item.expected ?? '').trim() === '') {
        issues.push(
          issue('item.no-expected', 'warning', 'item', item.id, `No expected answer recorded.`)
        );
      }
      break;

    case 'essay':
      if ((item.expected ?? '').trim() === '' && item.rubricId === undefined) {
        issues.push(
          issue(
            'item.essay-unscored',
            'info',
            'item',
            item.id,
            `No model answer and no rubric, so there is nothing to mark against.`
          )
        );
      }
      break;

    case 'discussion':
      if (item.discussion === undefined) {
        issues.push(
          issue(
            'item.no-discussion-spec',
            'info',
            'item',
            item.id,
            `No posting requirements set for this discussion.`
          )
        );
      }
      break;

    case 'group':
      if (item.parts.length === 0) {
        issues.push(
          issue('item.empty-group', 'warning', 'item', item.id, `This group has no parts.`)
        );
      }
      break;

    case 'stimulus':
      if (item.points !== undefined) {
        issues.push(
          issue(
            'item.stimulus-points',
            'warning',
            'item',
            item.id,
            `A stimulus is not answered, so its ${item.points} points are not counted in any total.`
          )
        );
      }
      break;
  }

  // Options on a kind that has none are dead weight the editor will not show.
  const usesOptions =
    item.kind === 'choice' || item.kind === 'multi' || item.kind === 'trueFalse';
  if (!usesOptions && item.options.length > 0) {
    issues.push(
      issue(
        'item.stray-options',
        'info',
        'item',
        item.id,
        `This ${item.kind} item carries ${item.options.length} answer options, which are not used.`
      )
    );
  }

  if (item.stem.trim() === '') {
    issues.push(issue('item.empty-stem', 'warning', 'item', item.id, `This item has no text.`));
  }

  // References
  for (const outcomeId of item.outcomeIds) {
    if (!ctx.outcomeIds.has(outcomeId)) {
      issues.push(
        issue(
          'item.dangling-outcome',
          'error',
          'item',
          item.id,
          `Aligned to an outcome that no longer exists.`
        )
      );
    }
  }
  if (item.rubricId !== undefined && !ctx.rubricsById.has(item.rubricId)) {
    issues.push(
      issue('item.dangling-rubric', 'error', 'item', item.id, `Points at a rubric that no longer exists.`)
    );
  }
  if (item.stimulusId !== undefined && !ctx.stimulusIds.has(item.stimulusId)) {
    issues.push(
      issue(
        'item.dangling-stimulus',
        'error',
        'item',
        item.id,
        `Reads from a stimulus that is not in this collection.`
      )
    );
  }
  if (item.sectionId !== undefined && !ctx.sectionIds.has(item.sectionId)) {
    issues.push(
      issue(
        'item.dangling-section',
        'warning',
        'item',
        item.id,
        `Assigned to a section that no longer exists.`
      )
    );
  }
  if (item.status !== '' && !ctx.statusKeys.has(item.status)) {
    issues.push(
      issue(
        'item.unknown-status',
        'warning',
        'item',
        item.id,
        `Status "${item.status}" is not one of this vault's statuses.`
      )
    );
  }

  // Alignment and scoring gaps. Containers and stimuli are exempt from both: a group
  // is scored and aligned through its parts, and a stimulus is neither.
  const isScorable = item.kind !== 'stimulus' && item.kind !== 'group';
  if (isScorable) {
    if (item.outcomeIds.length === 0 && item.rubricId === undefined) {
      issues.push(
        issue('item.no-outcome', 'info', 'item', item.id, `Not aligned to any outcome.`)
      );
    }
    if (itemPoints(item, ctx.context).source === 'undeclared') {
      issues.push(
        issue('item.no-points', 'info', 'item', item.id, `Worth no points — none have been set.`)
      );
    }
  }

  return issues;
}

/** Groups issues by the entity they belong to, for panel rendering. */
export function issuesByEntity(issues: readonly Issue[]): Map<string, Issue[]> {
  const grouped = new Map<string, Issue[]>();
  for (const item of issues) {
    const existing = grouped.get(item.entityId);
    if (existing) existing.push(item);
    else grouped.set(item.entityId, [item]);
  }
  return grouped;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Most serious first. Stable within a severity so the panel does not jump around. */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId)
  );
}

export function countBySeverity(issues: readonly Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const item of issues) counts[item.severity] += 1;
  return counts;
}
