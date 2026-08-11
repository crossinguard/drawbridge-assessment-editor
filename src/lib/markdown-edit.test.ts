import { describe, expect, it } from 'vitest';
import {
  LINK_PLACEHOLDER,
  insertLink,
  insertTable,
  toggleLinePrefix,
  toggleWrap
} from './markdown-edit';

/*
  Every case asserts the SELECTION as well as the text. The characters are the easy half
  and the half a glance at the screen would catch; the offsets are what silently rot,
  and a caret two characters off is only discovered by the next thing typed.

  `at()` writes the expectation the way it reads on screen — `a **|bold|** word` — so a
  wrong offset shows up as text in the diff rather than as two numbers to count out by
  hand.
*/
function at(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}|${text.slice(start, end)}|${text.slice(end)}`;
}

const show = (result: { text: string; selectionStart: number; selectionEnd: number }) =>
  at(result.text, result.selectionStart, result.selectionEnd);

describe('toggleWrap', () => {
  it('wraps the selection and keeps the inner text selected', () => {
    // Selecting the markers instead would mean typing next replaces the syntax.
    expect(show(toggleWrap('a bold word', { start: 2, end: 6 }, '**'))).toBe(
      'a **|bold|** word'
    );
  });

  it('puts the caret between the markers when nothing is selected', () => {
    expect(show(toggleWrap('a  word', { start: 2, end: 2 }, '**'))).toBe('a **||** word');
  });

  it('unwraps when the markers sit outside the selection', () => {
    // Double-clicking a word inside **bold** selects the word, not the markers.
    expect(show(toggleWrap('a **bold** word', { start: 4, end: 8 }, '**'))).toBe(
      'a |bold| word'
    );
  });

  it('unwraps when the markers are inside the selection', () => {
    // Which is the state the previous press left behind, if the user selected wider.
    expect(show(toggleWrap('a **bold** word', { start: 2, end: 10 }, '**'))).toBe(
      'a |bold| word'
    );
  });

  it('is a true no-op when pressed twice', () => {
    const once = toggleWrap('a bold word', { start: 2, end: 6 }, '**');
    const twice = toggleWrap(
      once.text,
      { start: once.selectionStart, end: once.selectionEnd },
      '**'
    );
    expect(twice.text).toBe('a bold word');
    expect(show(twice)).toBe('a |bold| word');
  });

  it('handles a one-character marker without mistaking it for half of a two', () => {
    expect(show(toggleWrap('a word', { start: 2, end: 6 }, '`'))).toBe('a `|word|`');
    expect(show(toggleWrap('a `word`', { start: 3, end: 7 }, '`'))).toBe('a |word|');
  });

  it('does not read a bare pair of markers as something to unwrap', () => {
    // `**` selected on its own is two characters, not an empty wrapped string — the
    // guard is the length check, and without it this eats the marker instead of
    // wrapping it.
    expect(show(toggleWrap('****', { start: 0, end: 2 }, '**'))).toBe('**|**|****');
  });

  it('wraps a selection that spans lines', () => {
    expect(show(toggleWrap('one\ntwo', { start: 0, end: 7 }, '*'))).toBe('*|one\ntwo|*');
  });
});

describe('toggleLinePrefix', () => {
  it('prefixes every line the selection touches, not just the first', () => {
    const result = toggleLinePrefix('one\ntwo\nthree', { start: 1, end: 9 }, '- ');
    expect(result.text).toBe('- one\n- two\n- three');
  });

  it('works from a caret with no selection at all', () => {
    expect(show(toggleLinePrefix('one', { start: 3, end: 3 }, '- '))).toBe('- one||');
  });

  it('removes the prefix when every line already has it', () => {
    const result = toggleLinePrefix('- one\n- two', { start: 0, end: 11 }, '- ');
    expect(result.text).toBe('one\ntwo');
  });

  it('adds rather than removes when only some lines have it', () => {
    // "Make them match" is what someone selecting a bullet and a paragraph means.
    const result = toggleLinePrefix('- one\ntwo', { start: 0, end: 9 }, '- ');
    expect(result.text).toBe('- one\n- two');
  });

  it('skips blank lines, and does not let one stop the toggle', () => {
    const added = toggleLinePrefix('one\n\ntwo', { start: 0, end: 8 }, '> ');
    expect(added.text).toBe('> one\n\n> two');

    const removed = toggleLinePrefix(added.text, { start: 0, end: added.text.length }, '> ');
    expect(removed.text).toBe('one\n\ntwo');
  });

  it('keeps the same text selected after prefixing', () => {
    // Not the whole block: pressing the button must not swallow the surrounding lines,
    // or a second press would toggle more than the first one touched.
    expect(show(toggleLinePrefix('one\ntwo', { start: 0, end: 7 }, '- '))).toBe(
      '|- one\n- two|'
    );
  });

  it('does not drag a caret onto the previous line when the prefix is removed', () => {
    /*
      The caret sits at index 1 — inside the "- " that is about to disappear. Subtracting
      the delta blindly puts it at -1 of the line, which reads as the end of the line
      above and is where the next keystroke would land.
    */
    expect(show(toggleLinePrefix('a\n- one', { start: 3, end: 3 }, '- '))).toBe('a\n||one');
  });

  it('leaves a selection of only blank lines alone', () => {
    const result = toggleLinePrefix('\n\n', { start: 0, end: 2 }, '- ');
    expect(result.text).toBe('\n\n');
  });
});

describe('insertLink', () => {
  it('keeps the selection as the label and selects the URL slot', () => {
    expect(show(insertLink('see the docs', { start: 8, end: 12 }))).toBe(
      `see the [docs](|${LINK_PLACEHOLDER}|)`
    );
  });

  it('still targets the URL when nothing was selected', () => {
    // The address is the part nobody remembers the syntax for, and the part that is
    // useless left as a placeholder. The label is a word about to be typed anyway.
    expect(show(insertLink('', { start: 0, end: 0 }))).toBe(`[](|${LINK_PLACEHOLDER}|)`);
  });

  it('replaces a selection spanning the whole field', () => {
    expect(insertLink('docs', { start: 0, end: 4 }).text).toBe(`[docs](${LINK_PLACEHOLDER})`);
  });
});

describe('insertTable', () => {
  it('starts the table on a line of its own, after a blank line', () => {
    // Pasted onto the end of a paragraph a table renders as literal pipes, which reads
    // as a broken button rather than as fussy syntax.
    const result = insertTable('A paragraph.', { start: 12, end: 12 });
    expect(result.text).toBe('A paragraph.\n\n| Heading | Heading |\n| --- | --- |\n|  |  |\n|  |  |');
  });

  it('does not stack blank lines that are already there', () => {
    expect(insertTable('A paragraph.\n\n', { start: 14, end: 14 }).text).toBe(
      'A paragraph.\n\n| Heading | Heading |\n| --- | --- |\n|  |  |\n|  |  |'
    );
    expect(insertTable('A paragraph.\n', { start: 13, end: 13 }).text).toBe(
      'A paragraph.\n\n| Heading | Heading |\n| --- | --- |\n|  |  |\n|  |  |'
    );
  });

  it('adds nothing in front of an empty field', () => {
    expect(insertTable('', { start: 0, end: 0 }).text.startsWith('| Heading')).toBe(true);
  });

  it('selects the first heading, wherever the table landed', () => {
    expect(show(insertTable('A paragraph.', { start: 12, end: 12 }))).toContain('| |Heading| |');
    expect(show(insertTable('', { start: 0, end: 0 }))).toContain('| |Heading| |');
  });

  it('keeps the text that followed the caret, on its own line', () => {
    const result = insertTable('before after', { start: 7, end: 7 });
    expect(result.text.endsWith('|  |  |\nafter')).toBe(true);
  });
});
