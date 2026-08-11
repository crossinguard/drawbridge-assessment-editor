/*
  Markdown editing as string arithmetic.

  Pure, DOM-free and beside `text.ts` rather than inside a component, because the part
  that actually breaks is the OFFSETS. A toolbar that inserts the right characters and
  puts the caret in the wrong place is worse than no toolbar: the next keystroke lands
  somewhere unexpected, and the author is fighting the field instead of writing.

  Every function takes the whole text plus a selection and returns the whole text plus a
  new selection. Nothing here knows what a textarea is, which is what lets the awkward
  cases — a multi-line selection, a caret inside the marker that just got removed — be
  tested exhaustively without a renderer.

  NOT to be confused with `markdown.ts`, which renders and sanitises for display, or
  with `export/markdown.ts`, which writes the bundle's documents. This one only edits.
*/

export interface EditResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface Selection {
  start: number;
  end: number;
}

/** The line boundaries containing a selection, as [start of first line, end of last]. */
function lineSpan(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const next = text.indexOf('\n', end);
  return [from, next === -1 ? text.length : next];
}

/**
 * Wraps or unwraps the selection in a marker — `**`, `*`, `` ` ``.
 *
 * Unwrapping recognises the marker both OUTSIDE the selection and inside it, because
 * both arise naturally. Double-clicking a word inside `**bold**` selects the word and
 * leaves the markers outside it; pressing the button twice in a row leaves them inside,
 * since the first press selects what it wrapped. A toggle that only handled one of the
 * two would refuse to undo itself half the time.
 *
 * The result always selects the INNER text, never the markers. That way pressing bold
 * then typing replaces the word rather than the syntax, and pressing bold twice is a
 * true no-op.
 */
export function toggleWrap(
  text: string,
  { start, end }: Selection,
  marker: string
): EditResult {
  const selected = text.slice(start, end);
  const width = marker.length;

  // Markers sitting outside the selection.
  if (text.slice(start - width, start) === marker && text.slice(end, end + width) === marker) {
    return {
      text: text.slice(0, start - width) + selected + text.slice(end + width),
      selectionStart: start - width,
      selectionEnd: end - width
    };
  }

  // Markers included in the selection.
  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(width, -width);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length
    };
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selectionStart: start + width,
    selectionEnd: start + width + selected.length
  };
}

/**
 * Adds or removes a line prefix — `- `, `> ` — across every line the selection touches.
 *
 * Removes only when EVERY non-blank line already has it. Partly-prefixed is treated as
 * "make them all match", which is what someone selecting a paragraph and a bullet and
 * pressing the list button means.
 *
 * Blank lines are skipped rather than prefixed, and they do not count towards the
 * all-prefixed test either. A `- ` on an empty line is a stray bullet in the rendered
 * output, and one blank line in a selection should not stop the button toggling off.
 */
export function toggleLinePrefix(
  text: string,
  { start, end }: Selection,
  prefix: string
): EditResult {
  const [from, to] = lineSpan(text, start, end);
  const lines = text.slice(from, to).split('\n');

  const meaningful = lines.filter((line) => line.trim() !== '');
  const allPrefixed =
    meaningful.length > 0 && meaningful.every((line) => line.startsWith(prefix));

  const next = lines.map((line) => {
    if (line.trim() === '') return line;
    if (allPrefixed) return line.slice(prefix.length);
    return line.startsWith(prefix) ? line : prefix + line;
  });

  const firstDelta = (next[0]?.length ?? 0) - (lines[0]?.length ?? 0);
  const block = next.join('\n');
  const totalDelta = block.length - (to - from);

  return {
    text: text.slice(0, from) + block + text.slice(to),
    /*
      A selection that began at the start of a line still begins there — otherwise
      selecting a paragraph whole and pressing the button leaves the first bullet
      outside the selection, and it looks like the line was missed.

      Anywhere else the offset moves with the text, clamped to the start of the line:
      a caret sitting inside the prefix that just disappeared would otherwise land on
      the line above, which is where the next keystroke would go.
    */
    selectionStart: start === from ? from : Math.max(from, start + firstDelta),
    selectionEnd: Math.max(from, end + totalDelta)
  };
}

/** The stand-in a fresh link carries, and what gets selected so typing replaces it. */
export const LINK_PLACEHOLDER = 'url';

/**
 * Turns the selection into a link, and selects the URL slot.
 *
 * The URL rather than the label, even when nothing was selected: the label is either
 * already there — it is what was highlighted — or it is a word the author is about to
 * type anyway, whereas the address is the part nobody remembers the syntax for and the
 * part that is useless if left as a placeholder.
 */
export function insertLink(text: string, { start, end }: Selection): EditResult {
  const label = text.slice(start, end);
  const inserted = `[${label}](${LINK_PLACEHOLDER})`;
  const urlAt = start + label.length + 3;

  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selectionStart: urlAt,
    selectionEnd: urlAt + LINK_PLACEHOLDER.length
  };
}

/** The first cell of a fresh table, selected so typing replaces it. */
const TABLE_FIRST_CELL = 'Heading';

const TABLE = [
  `| ${TABLE_FIRST_CELL} | Heading |`,
  '| --- | --- |',
  '|  |  |',
  '|  |  |'
].join('\n');

/**
 * Drops a table skeleton in, on lines of its own.
 *
 * A table has to start a block, so this forces the blank line before it that Markdown
 * requires — pasted onto the end of a paragraph it would render as literal pipes, which
 * looks like the button is broken rather than like the syntax is fussy. The selection
 * lands on the first heading, because that is what gets typed first.
 */
export function insertTable(text: string, { start, end }: Selection): EditResult {
  const before = text.slice(0, start);
  const after = text.slice(end);

  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after === '' || after.startsWith('\n') ? '' : '\n';

  const cellAt = before.length + lead.length + 2;

  return {
    text: before + lead + TABLE + trail + after,
    selectionStart: cellAt,
    selectionEnd: cellAt + TABLE_FIRST_CELL.length
  };
}
