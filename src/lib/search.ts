/*
  Ranking a list of things against what somebody typed.

  Pure, dependency-free and DOM-free, which is the whole reason it is a module rather
  than fifty lines inside the palette component: the scoring is the part with judgement
  in it, and judgement is what wants tests. The component is then a list and a keyboard.

  It lives in `src/lib` rather than `src/lib/domain` because it knows nothing about
  assessments — it would rank filenames just as happily — and `domain/` is for the model.
*/

export interface Candidate<T> {
  /** Stable across renders; used for keying and for `aria-activedescendant`. */
  id: string;
  /** What the user reads, and the only text matched against. */
  label: string;
  /** Secondary line: the collection a question is in, say. Shown, never matched. */
  detail?: string;
  /** A word for the kind of thing this is — "Collection", "Question", "Go to". */
  group: string;
  value: T;
}

export interface Match<T> {
  candidate: Candidate<T>;
  score: number;
  /** Indices into `label` that the query matched, ascending. */
  matched: number[];
}

/** Start of the string. Worth much more than anything else. */
const AT_START = 18;
/** First letter of a word — after a space, a dash, a bracket. */
const AT_WORD_START = 12;
/** Directly after the previous match, so the query reads as a run. */
const CONSECUTIVE = 10;
/** Every match at all is worth something, so a long scattered match still ranks. */
const ANY_MATCH = 1;

function isBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1] ?? '';
  return !/[\p{L}\p{N}]/u.test(previous);
}

/**
 * Scores one label, or returns null when the query is not a subsequence of it.
 *
 * Two passes, and the second one is what makes the highlighting legible.
 *
 * Forward greedy answers "does this match at all", and finds the earliest position the
 * match can END at. Taken on its own it aligns each character as far LEFT as possible,
 * which is where it looks silly: "spread" against "Describe the spread" takes the `s`
 * out of "Describe" and then `pread` out of the word you actually meant, and the user
 * sees a highlight scattered across two words with the obvious one skipped.
 *
 * The backward pass fixes that by re-walking the query from that end position, taking
 * the LAST available position for each character. Same characters, same end, tightest
 * possible alignment — so a contiguous run is found whenever one exists, and it scores
 * as the run it is.
 */
export function score(query: string, label: string): { score: number; matched: number[] } | null {
  /*
    Code POINTS, not units: an emoji is one character to match and two to index.
    Spaces are dropped — they are how somebody types two words they remember without
    knowing what sits between them.
  */
  const chars = [...query.toLowerCase()].filter((character) => character !== ' ');
  if (chars.length === 0) return null;

  const hay = label.toLowerCase();

  let cursor = 0;
  for (const character of chars) {
    const found = hay.indexOf(character, cursor);
    if (found === -1) return null;
    cursor = found + character.length;
  }

  // Now tighten, right to left, from the end the forward pass reached.
  const starts: number[] = [];
  let bound = cursor;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const character = chars[index] ?? '';
    const found = hay.lastIndexOf(character, bound - character.length);
    // Cannot be -1: the forward pass proved an alignment ending here exists.
    if (found === -1) return null;
    starts.push(found);
    bound = found;
  }
  starts.reverse();

  const matched: number[] = [];
  let total = 0;
  let previousEnd = -1;

  chars.forEach((character, index) => {
    const at = starts[index] ?? 0;

    total += ANY_MATCH;
    if (at === 0) total += AT_START;
    else if (isBoundary(label, at)) total += AT_WORD_START;
    if (index > 0 && at === previousEnd) total += CONSECUTIVE;

    /*
      Every code UNIT the character occupies. Recording only the leading index would
      have `segments` mark half a surrogate pair as matched and half as not, splitting
      an emoji into two lone surrogates — two replacement glyphs, from a highlighter.
    */
    for (let unit = 0; unit < character.length; unit += 1) matched.push(at + unit);
    previousEnd = at + character.length;
  });

  // A match that starts late is a worse match than the same one starting early, but
  // only mildly — capped so a long stem cannot outweigh the bonuses above.
  total -= Math.min(starts[0] ?? 0, 12);
  return { score: total, matched };
}

/**
 * The best matches, strongest first.
 *
 * A blank query returns the candidates in the order given, which is deliberate: the
 * palette opens on a list somebody can arrow through, not on an empty box that has to
 * be typed into before it does anything.
 */
export function rank<T>(
  query: string,
  candidates: readonly Candidate<T>[],
  limit = 40
): Match<T>[] {
  if (query.trim() === '') {
    return candidates.slice(0, limit).map((candidate) => ({ candidate, score: 0, matched: [] }));
  }

  const matches: Match<T>[] = [];
  candidates.forEach((candidate) => {
    const result = score(query, candidate.label);
    if (result) matches.push({ candidate, score: result.score, matched: result.matched });
  });

  /*
    Shorter labels win a tie. Typing "quiz" with both a collection called "Quiz 1" and
    a question that happens to contain the word should offer the collection first, and
    length is the cheapest signal that says so.

    `sort` is stable in every engine this runs on, so equal scores AND equal lengths
    keep the order the caller built — which is how the groups stay in a sensible order
    on an empty query.
  */
  matches.sort((a, b) => b.score - a.score || a.candidate.label.length - b.candidate.label.length);
  return matches.slice(0, limit);
}

export interface Segment {
  text: string;
  /** True for the characters the query matched, so the UI can mark them. */
  hit: boolean;
}

/**
 * Splits a label into matched and unmatched runs, for highlighting.
 *
 * Here rather than in the component because it is string arithmetic with an
 * off-by-one in it, and this repo has already learned what happens when that kind of
 * thing is only ever checked by looking at the screen.
 */
export function segments(label: string, matched: readonly number[]): Segment[] {
  if (matched.length === 0) return label === '' ? [] : [{ text: label, hit: false }];

  const hits = new Set(matched);
  const out: Segment[] = [];

  for (let index = 0; index < label.length; index += 1) {
    const hit = hits.has(index);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += label[index];
    else out.push({ text: label[index] ?? '', hit });
  }
  return out;
}
