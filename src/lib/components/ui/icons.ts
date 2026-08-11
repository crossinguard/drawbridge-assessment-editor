/*
  The app's icon set, as path data on a fixed 16×16 grid.

  This exists because the glyphs it replaces could not be centred. They came from four
  different Unicode blocks — arrows (↑↓←→), a dingbat (✕), a technical symbol (⧉), a
  fullwidth plus and an emoji (＋💬) — and each carries its own ink offset inside its em
  box, so a row of them sits at four different heights no matter what padding is applied.
  Two of them also fell outside the core coverage of the UI font, which meant their
  advance width, and therefore the button's width, changed per platform.

  A fixed viewBox removes the problem rather than compensating for it: every icon is
  drawn on the same grid, with the same stroke weight, and occupies the same box.

  Hand-written rather than pulled from an icon library: thirteen paths is less code than
  a dependency's tree-shaking config, and it carries no licence question into an app the
  user may one day ship as a desktop binary.

  Data lives here rather than inside Icon.svelte so `icons.test.ts` can assert every name
  resolves — a typo'd name would otherwise render an empty box and nothing else.
*/

export type IconName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'plus'
  | 'close'
  | 'duplicate'
  | 'chevron-down'
  | 'chevron-right'
  | 'notes'
  | 'comment'
  | 'sun'
  | 'moon'
  | 'bold'
  | 'italic'
  | 'code'
  | 'list'
  | 'quote'
  | 'link'
  | 'table';

/** One or more `d` attributes per icon, stroked — never filled. */
export const ICONS: Record<IconName, readonly string[]> = {
  up: ['M8 13V3', 'M4.5 6.5 8 3l3.5 3.5'],
  down: ['M8 3v10', 'M4.5 9.5 8 13l3.5-3.5'],
  left: ['M13 8H3', 'M6.5 4.5 3 8l3.5 3.5'],
  right: ['M3 8h10', 'M9.5 4.5 13 8l-3.5 3.5'],
  plus: ['M8 3.5v9', 'M3.5 8h9'],
  close: ['M4 4l8 8', 'M12 4l-8 8'],
  duplicate: [
    'M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5',
    'M6.5 5h6A1.5 1.5 0 0 1 14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 12.5v-6A1.5 1.5 0 0 1 6.5 5z'
  ],
  'chevron-down': ['M4 6.5 8 10.5l4-4'],
  'chevron-right': ['M6.5 4 10.5 8l-4 4'],
  notes: ['M3 4.5h10', 'M3 8h10', 'M3 11.5h6'],
  comment: [
    'M13.5 9.5A1.5 1.5 0 0 1 12 11H6l-3 2.5V4.5A1.5 1.5 0 0 1 4.5 3H12a1.5 1.5 0 0 1 1.5 1.5z'
  ],
  sun: [
    'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M8 1.5V3',
    'M8 13v1.5',
    'M14.5 8H13',
    'M3 8H1.5',
    'M12.6 3.4l-1 1',
    'M4.4 11.6l-1 1',
    'M12.6 12.6l-1-1',
    'M4.4 4.4l-1-1'
  ],
  moon: ['M13 10.3A5.5 5.5 0 0 1 5.7 3 5.5 5.5 0 1 0 13 10.3z'],

  /*
    The formatting toolbar. `bold` and `italic` are letterforms drawn as strokes rather
    than the characters B and I, for the same reason as everything above: a glyph brings
    its own ink offset inside its em box, so it would sit at a different height from the
    six icons beside it.
  */
  bold: ['M5 3h3.75a2.5 2.5 0 0 1 0 5H5z', 'M5 8h4.25a2.5 2.5 0 0 1 0 5H5z'],
  italic: ['M6.5 3h4', 'M5.5 13h4', 'M9.5 3 6.5 13'],
  code: ['M5.5 5 2.5 8l3 3', 'M10.5 5l3 3-3 3', 'M9.5 3.5 6.5 12.5'],
  // A zero-length segment with a round cap renders as a dot; see Icon.svelte.
  list: ['M3 4.5h.01', 'M3 8h.01', 'M3 11.5h.01', 'M6 4.5h7', 'M6 8h7', 'M6 11.5h7'],
  quote: ['M3 4v8', 'M6.5 5.5h6.5', 'M6.5 8h6.5', 'M6.5 10.5h4'],
  link: [
    'M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2-2a2.5 2.5 0 0 0-3.54-3.54l-.6.6',
    'M9.25 6.75a2.5 2.5 0 0 0-3.54 0l-2 2a2.5 2.5 0 0 0 3.54 3.54l.6-.6'
  ],
  table: ['M2.5 3.5h11v9h-11z', 'M2.5 7h11', 'M6.5 3.5v9']
};
