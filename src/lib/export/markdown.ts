import { inOrder } from '$lib/domain/items';
import { buildTree, walkTree } from '$lib/domain/outcomes';
import {
  collectionPoints,
  criterionMax,
  describePoints,
  itemPoints,
  rubricTotal,
  type PointsResult
} from '$lib/domain/points';
import { count } from '$lib/text';
import type {
  Collection,
  Criterion,
  DiscussionSpec,
  Item,
  Outcome,
  Rubric
} from '$lib/domain/schema';
import {
  documentGroups,
  fieldPairs,
  labelOf,
  oneLine,
  outcomeCode,
  partNumber,
  round,
  type ReadableContext
} from './readable';

/*
  The Markdown dialect a bundle carries alongside its JSON.

  NOT to be confused with `$lib/markdown.ts`, which sanitises Markdown for display
  inside the app. This file only ever WRITES Markdown, never renders it, and so has no
  DOM and no DOMPurify.

  Readable first, faithful second. What a person opens this for is the assessment
  itself — the questions, the key, the rubric grid — so the layout is the one an
  instructor would have typed in Word, with the machine detail demoted to inline code
  tags on the heading. Where readability and fidelity conflict, JSON is right there in
  the same zip and wins by default; that is why an option's feedback gets collapsed to
  one line here without apology.

  Headings are strictly levelled — `#` collection, `##` section, `###` item, `####`
  and beyond for a group's parts — so the document outline in any viewer matches the
  structure of the assessment, and so a future reader (or importer) never has to guess
  whether a `##` is a section or a question.
*/

// ---------------------------------------------------------------------------
// Formatting primitives
// ---------------------------------------------------------------------------

/** Blocks joined by a blank line. Empty blocks drop out, so callers can push freely. */
function document(blocks: readonly string[]): string {
  return `${blocks.filter((block) => block !== '').join('\n\n')}\n`;
}

/**
 * Always-quoted YAML scalars.
 *
 * A course called "Statistics: an introduction" is entirely ordinary and would break
 * an unquoted value, so nothing here is ever emitted bare.
 */
function frontmatter(entries: readonly [string, string | number | undefined][]): string {
  const lines = entries.flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (typeof value === 'number') return [`${key}: ${round(value)}`];
    return [`${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ')}"`];
  });
  return ['---', ...lines, '---'].join('\n');
}

/** An inline code span that survives a backtick in the text it wraps. */
function code(text: string): string {
  const flat = oneLine(text);
  const fence = flat.includes('`') ? '``' : '`';
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

/** Link text, with the two characters that would end it early escaped. */
function linkText(text: string): string {
  return oneLine(text).replace(/([[\]])/g, '\\$1');
}

/**
 * A labelled block: `**Answer.** 25`, or the label on its own line when the content
 * runs to more than one, so multi-paragraph Markdown still renders as itself.
 */
function labelled(label: string, text: string | undefined): string {
  const body = (text ?? '').trim();
  if (body === '') return '';
  return body.includes('\n') ? `**${label}.**\n\n${body}` : `**${label}.** ${body}`;
}

/** A blockquote, used for the instructions so they stay out of the heading outline. */
function quote(text: string): string {
  const body = text.trim();
  if (body === '') return '';
  return body
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

/** Whitespace-collapsed cell text with the column separator escaped. */
function cell(text: string): string {
  const flat = text.trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return flat === '' ? '—' : flat;
}

/**
 * A one-line headline for an item, taken from its stem.
 *
 * Items have no title field — the stem is all there is — so the heading has to be
 * derived. `complete` reports whether the headline is the whole stem, which is what
 * lets a one-line question avoid being printed twice.
 */
export function headline(stem: string, limit = 72): { text: string; complete: boolean } {
  const flat = oneLine(stem).replace(/^[#>\s]+/, '');
  if (flat === '') return { text: '(no stem yet)', complete: true };
  if (flat.length <= limit) return { text: flat, complete: flat === stem.trim() };
  // Cut on a word boundary where there is one nearby, so the headline does not end
  // mid-word for the sake of four characters.
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return { text: `${(space > limit - 20 ? cut.slice(0, space) : cut).trimEnd()}…`, complete: false };
}

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/**
 * How a points result reads on a heading.
 *
 * Nothing is shown for a stimulus: it is a passage, it is structurally unscorable,
 * and `0 pt` beside one would read as a mistake somebody should fix. "Points not set"
 * is said out loud, though, because that one IS something to come back to.
 */
function pointsTag(result: PointsResult): string {
  if (result.source === 'unscored') return '';
  if (result.source === 'undeclared') return code('points not set');
  return code(describePoints(result));
}

/**
 * The rubric line, linking to the rubric's own document when there is one in this
 * bundle. A rubric this bundle does not contain is named as missing rather than
 * silently omitted — an item that says nothing about scoring and an item whose rubric
 * has gone astray must not look the same.
 */
function rubricLine(rubricId: string, context: ReadableContext): string {
  const rubric = context.rubricsById.get(rubricId);
  if (!rubric) {
    return `**Rubric.** Not in this bundle — id ${code(rubricId)}.`;
  }

  const slug = context.rubricSlugs.get(rubricId);
  const title = slug ? `[${linkText(rubric.title)}](../rubrics/${slug}.md)` : rubric.title;
  return `**Rubric.** ${title} — up to ${round(rubricTotal(rubric))} pt`;
}

function stimulusLine(stimulusId: string, context: ReadableContext): string {
  const stimulus = context.itemsById.get(stimulusId);
  if (!stimulus) return `**Reads from.** Not in this bundle — id ${code(stimulusId)}.`;
  return `**Reads from.** ${headline(stimulus.stem).text} ${code(`#${stimulusId}`)}`;
}

function discussionLines(spec: DiscussionSpec): string[] {
  const initial: string[] = [];
  if (spec.initialPost.minWords !== undefined) {
    initial.push(`At least ${count(round(spec.initialPost.minWords), 'word')}`);
  }
  if (spec.initialPost.dueNote) initial.push(`due ${oneLine(spec.initialPost.dueNote)}`);
  if (spec.initialPost.requirements) initial.push(oneLine(spec.initialPost.requirements));

  const replies: string[] = [];
  if (spec.replies.count !== undefined) {
    replies.push(count(round(spec.replies.count), 'reply', 'replies'));
  }
  if (spec.replies.minWords !== undefined) {
    replies.push(`at least ${count(round(spec.replies.minWords), 'word')} each`);
  }
  if (spec.replies.dueNote) replies.push(`due ${oneLine(spec.replies.dueNote)}`);
  if (spec.replies.requirements) replies.push(oneLine(spec.replies.requirements));

  return [
    initial.length > 0 ? `**Initial post.** ${initial.join(' · ')}` : '',
    replies.length > 0 ? `**Replies.** ${replies.join(' · ')}` : ''
  ];
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function itemBlocks(
  item: Item,
  number: string,
  depth: number,
  context: ReadableContext
): string[] {
  const config = context.vault.config;
  const points = itemPoints(item, context.scoring);
  const head = headline(item.stem);

  const tags = [
    code(`#${item.id}`),
    ...item.outcomeIds.map((outcomeId) => code(`@${outcomeCode(context, outcomeId)}`)),
    pointsTag(points)
  ].filter((tag) => tag !== '');

  // Capped at six: HTML has no `<h7>`, and a group nested that deep is already past
  // the point where heading level is what is confusing about it.
  const hashes = '#'.repeat(Math.min(depth, 6));

  const meta = [
    item.kind,
    ...(item.status ? [labelOf(config.statuses, item.status)] : []),
    ...Object.entries(item.tags).flatMap(([key, value]) =>
      value ? [`${labelOf(config.tagDimensions, key)}: ${value}`] : []
    ),
    ...fieldPairs(context, item.fields)
  ];

  const options = item.options.flatMap((option) => {
    const text = oneLine(option.text) || '(blank)';
    const line = `- [${option.correct ? 'x' : ' '}] ${text}`;
    return option.feedback ? [line, `  - **Feedback.** ${oneLine(option.feedback)}`] : [line];
  });

  return [
    `${hashes} ${number} ${head.text} ${tags.join(' ')}`,
    `*${meta.join(' · ')}*`,
    // Before the question rather than after it: the passage is what you have to have
    // read to answer, so a reader needs the pointer on the way in, not on the way out.
    item.stimulusId === undefined ? '' : stimulusLine(item.stimulusId, context),
    head.complete ? '' : item.stem.trim(),
    options.join('\n'),
    labelled('Answer', item.expected),
    item.accepted.length > 0 ? `**Also accepted.** ${item.accepted.join('; ')}` : '',
    labelled('Rationale', item.rationale),
    labelled('Feedback', item.feedback),
    item.rubricId === undefined ? '' : rubricLine(item.rubricId, context),
    ...(item.discussion ? discussionLines(item.discussion) : []),
    ...inOrder(item.parts).flatMap((part, index) =>
      itemBlocks(part, partNumber(number, index), depth + 1, context)
    )
  ];
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * One collection as a document: `collections/<slug>.md`.
 *
 * `items` must be the collection's TOP-LEVEL items. A group's parts are reached
 * through their parent, exactly as they are in storage and in the points arithmetic.
 */
export function collectionMarkdown(
  collection: Collection,
  items: readonly Item[],
  context: ReadableContext
): string {
  const config = context.vault.config;
  const total = collectionPoints(collection, items, context.scoring);

  const declared =
    collection.declaredPoints !== undefined && round(collection.declaredPoints) !== round(total.points)
      ? ` (declared ${round(collection.declaredPoints)} pt)`
      : '';

  const summary = [
    labelOf(config.collectionKinds, collection.kind),
    count(items.length, 'item'),
    `worth ${describePoints(total)}${declared}`,
    ...(collection.status ? [labelOf(config.statuses, collection.status)] : []),
    ...fieldPairs(context, collection.fields)
  ];

  const blocks: string[] = [
    frontmatter([
      ['title', collection.title],
      ['kind', collection.kind],
      ['status', collection.status || undefined],
      ['items', items.length],
      ['points', round(total.points)],
      ['declaredPoints', collection.declaredPoints],
      ['course', context.vault.code],
      ['id', collection.id]
    ]),
    `# ${oneLine(collection.title) || '(untitled collection)'}`,
    `*${summary.join(' · ')}*`,
    collection.rubricId === undefined ? '' : rubricLine(collection.rubricId, context),
    (collection.description ?? '').trim(),
    quote(collection.instructions ?? '')
  ];

  let number = 0;
  for (const group of documentGroups(collection, items)) {
    if (group.section) {
      blocks.push(`## ${oneLine(group.section.title) || '(untitled section)'}`);
      blocks.push((group.section.description ?? '').trim());
    }
    for (const item of group.items) {
      number += 1;
      blocks.push(...itemBlocks(item, `${number}.`, 3, context));
    }
  }

  return document(blocks);
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/** The outcome tree as a nested list: `outcomes.md`. */
export function outcomesMarkdown(
  outcomes: readonly Outcome[],
  context: ReadableContext
): string {
  const tiers = context.vault.config.outcomeTiers;

  const lines = walkTree(buildTree(outcomes)).flatMap((node) => {
    const indent = '  '.repeat(node.depth);
    const { code: outcomeCodeText, text, notes, id } = node.outcome;
    const bullet = `${indent}- **${oneLine(outcomeCodeText) || '(no code)'}** ${oneLine(text)} ${code(`#${id}`)}`;
    // A lazy continuation line: indented under the bullet, so it joins that item's
    // paragraph rather than starting a sibling that would be mistaken for a child.
    return notes && notes.trim() !== '' ? [bullet, `${indent}  ${oneLine(notes)}`] : [bullet];
  });

  return document([
    frontmatter([
      ['course', context.vault.name],
      ['code', context.vault.code],
      ['outcomes', outcomes.length]
    ]),
    `# Outcomes — ${oneLine(context.vault.name)} (${oneLine(context.vault.code)})`,
    tiers.length > 0
      ? `Nesting, outermost first: ${tiers.join(' → ')}. Depth is whatever this course made it; the tier names are labels, not structure.`
      : '',
    'Each entry carries its id, which is what `items.csv` and `coverage.csv` join on.',
    lines.length > 0 ? lines.join('\n') : '_No outcomes yet._'
  ]);
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

function criterionCell(
  criterion: Criterion,
  levels: Rubric['levels'],
  context: ReadableContext
): string {
  const bits = [`**${cell(criterion.title) === '—' ? '(untitled)' : cell(criterion.title)}**`];
  if (criterion.description) bits.push(cell(criterion.description));
  // Its own maximum, spelled out per row. With per-criterion points the column
  // headings are only defaults, so this column is what makes the rubric's total
  // addable by eye — which is the one thing a reader checks a rubric document for.
  if (levels.length > 0) bits.push(`worth up to ${round(criterionMax(criterion, levels))} pt`);
  if (criterion.weight !== undefined) bits.push(`weight ${round(criterion.weight)}`);
  const codes = criterion.outcomeIds.map((id) => code(`@${outcomeCode(context, id)}`));
  if (codes.length > 0) bits.push(codes.join(' '));
  return bits.join('<br>');
}

/**
 * One grid cell: the descriptor, prefixed with its points where the criterion overrides
 * the column heading.
 *
 * Only where it differs, deliberately. Repeating the heading's number in every cell
 * would triple the ink in the widest part of the table to say nothing, whereas a number
 * that appears exactly where the row departs from its column is self-explaining.
 */
function descriptorCell(criterion: Criterion, level: Rubric['levels'][number]): string {
  const override = criterion.levelPoints[level.id];
  const text = cell(criterion.descriptors[level.id] ?? '');
  if (override === undefined) return text;
  return text === '—' ? `**${round(override)} pt**` : `**${round(override)} pt**<br>${text}`;
}

/** One rubric as a document: `rubrics/<slug>.md`. */
export function rubricMarkdown(rubric: Rubric, context: ReadableContext): string {
  const total = round(rubricTotal(rubric));
  const criteria = [...rubric.criteria].sort((a, b) => a.order - b.order);
  // The explanatory line only appears where it explains something. A rubric on a plain
  // shared scale reads exactly as it always did.
  const overridden = criteria.some((criterion) =>
    rubric.levels.some((level) => criterion.levelPoints[level.id] !== undefined)
  );

  const blocks: string[] = [
    frontmatter([
      ['title', rubric.title],
      ['levels', rubric.levels.length],
      ['criteria', criteria.length],
      ['total', total],
      ['course', context.vault.code],
      ['id', rubric.id]
    ]),
    `# ${oneLine(rubric.title) || '(untitled rubric)'}`,
    `*Worth up to ${total} pt — the sum of each criterion's best level. The levels are alternatives, not steps to be added up.*`,
    overridden
      ? '*A column heading gives the points for that level by default. Where a cell shows its own points, that criterion is worth what the cell says instead.*'
      : '',
    (rubric.description ?? '').trim(),
    ...fieldPairs(context, rubric.fields).map((pair) => `*${pair}*`)
  ];

  if (criteria.length === 0) {
    blocks.push('_No criteria yet._');
  } else if (rubric.levels.length === 0) {
    // A table with no columns is not a table. Say what is actually wrong.
    blocks.push('_This rubric has no levels, so there is no grid to show._');
    blocks.push(
      criteria.map((criterion) => `- ${criterionCell(criterion, [], context)}`).join('\n')
    );
  } else {
    const header = ['Criterion', ...rubric.levels.map((level) => `${cell(level.name)} (${round(level.points)} pt)`)];
    const rows = criteria.map((criterion) =>
      [
        criterionCell(criterion, rubric.levels, context),
        ...rubric.levels.map((level) => descriptorCell(criterion, level))
      ].join(' | ')
    );

    blocks.push(
      [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row} |`)
      ].join('\n')
    );
  }

  return document(blocks);
}
