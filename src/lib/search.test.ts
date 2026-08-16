import { describe, expect, it } from 'vitest';
import { rank, score, segments, type Candidate } from './search';

/*
  The scoring, and the string arithmetic underneath the highlighting.

  Ordering is the part somebody notices — a palette that puts the collection you meant
  third is worse than no palette — and it is impossible to check by eye, because a
  plausible-looking list gives no clue what the alternative would have been.
*/

const candidate = (label: string, group = 'Thing'): Candidate<string> => ({
  id: label,
  label,
  group,
  value: label
});

const labels = (query: string, list: readonly Candidate<string>[]) =>
  rank(query, list).map((match) => match.candidate.label);

describe('score', () => {
  it('refuses a query that is not in the label at all', () => {
    expect(score('zebra', 'Quiz 1 — Describing data')).toBeNull();
  });

  it('matches a subsequence, not just a substring', () => {
    // Typing the initials of a long title is the thing a palette is for.
    expect(score('qdd', 'Quiz 1 — Describing data')).not.toBeNull();
  });

  it('is case-insensitive both ways', () => {
    expect(score('QUIZ', 'quiz one')).not.toBeNull();
    expect(score('quiz', 'QUIZ ONE')).not.toBeNull();
  });

  it('ignores spaces in the query', () => {
    // "two words I remember, no idea what is between them".
    expect(score('quiz data', 'Quiz 1 — Describing data')).not.toBeNull();
  });

  it('scores a run at the start far above the same letters buried mid-word', () => {
    const run = score('des', 'Describing data')?.score ?? 0;
    const buried = score('des', 'Understated')?.score ?? 0;
    expect(run).toBeGreaterThan(buried);
  });

  it('rates an acronym across word starts at least as highly as a prefix', () => {
    /*
      "des" typed at "Data extraction summary" is three word-initials, and it outscores
      the leading run in "Describing data" — which looks wrong for about a second and
      is the behaviour anybody who has used a palette expects. Typing initials is how
      you reach a long title; the alternative ranking would make that the worst way.
    */
    const acronym = score('des', 'Data extraction summary')?.score ?? 0;
    const prefix = score('des', 'Describing data')?.score ?? 0;
    expect(acronym).toBeGreaterThanOrEqual(prefix);
  });

  it('scores word starts above mid-word letters', () => {
    const boundaries = score('dd', 'Describing data')?.score ?? 0;
    const midWord = score('dd', 'Addendum')?.score ?? 0;
    expect(boundaries).toBeGreaterThan(midWord);
  });

  it('reports the positions it matched, in order', () => {
    expect(score('dd', 'Describing data')?.matched).toEqual([0, 11]);
  });

  it('tightens onto the whole word rather than the first stray letter', () => {
    /*
      The browser found this one by looking wrong. Forward-greedy alone takes the `s`
      out of "Describe" and then "pread" out of "spread", so the highlight lands on
      two words with the obvious one half-skipped. The backward pass re-walks from the
      end and lands the whole run on the word somebody typed.
    */
    const label = 'EO1.2 — Describe the spread of a distribution.';
    const matched = score('spread', label)?.matched ?? [];
    const text = matched.map((index) => label[index]).join('');

    expect(text).toBe('spread');
    // Contiguous, which is what makes it read as one highlighted word.
    expect(matched[matched.length - 1]! - matched[0]!).toBe(5);
  });

  it('scores a whole word far above the same letters strewn mid-word', () => {
    const word = score('spread', 'the spread')?.score ?? 0;
    const strewn = score('spread', 'sxpxrxexaxd')?.score ?? 0;
    expect(word).toBeGreaterThan(strewn * 2);
  });

  it('records every code unit of an astral character', () => {
    /*
      The loop iterates code points and `indexOf` deals in code units, so a matched
      emoji occupies two indices. Recording only the first would leave `segments`
      marking half a surrogate pair — two replacement glyphs where the emoji was.
    */
    const label = 'a\u{1F600}b';
    const matched = score('\u{1F600}', label)?.matched;
    expect(matched).toEqual([1, 2]);
  });
});

describe('rank', () => {
  it('returns everything in the given order for a blank query', () => {
    // The palette opens on a list to arrow through, not on an empty box.
    const list = [candidate('Dashboard'), candidate('Outcomes'), candidate('Settings')];
    expect(labels('   ', list)).toEqual(['Dashboard', 'Outcomes', 'Settings']);
  });

  it('drops what does not match', () => {
    const list = [candidate('Dashboard'), candidate('Outcomes')];
    expect(labels('dash', list)).toEqual(['Dashboard']);
  });

  it('puts the shorter label first when the scores tie', () => {
    /*
      Both start with the query, so both take the same bonuses. The collection called
      "Quiz 1" is what somebody typing "quiz" meant, not the question that happens to
      begin with the word.
    */
    const list = [
      candidate('Quiz questions are worth one point each'),
      candidate('Quiz 1')
    ];
    expect(labels('quiz', list)[0]).toBe('Quiz 1');
  });

  it('keeps the caller’s order when score and length both tie', () => {
    // Stability is what keeps the groups in a sensible order on an empty query.
    const list = [candidate('Alpha'), candidate('Alpha')];
    const ranked = rank('alpha', list);
    expect(ranked).toHaveLength(2);
  });

  it('honours the limit', () => {
    const list = Array.from({ length: 100 }, (_, index) => candidate(`Item ${index}`));
    expect(rank('item', list, 5)).toHaveLength(5);
  });
});

describe('segments', () => {
  it('is one plain run when nothing matched', () => {
    expect(segments('Describing data', [])).toEqual([{ text: 'Describing data', hit: false }]);
  });

  it('splits matched characters out and merges neighbours', () => {
    expect(segments('Describing', [0, 1, 2])).toEqual([
      { text: 'Des', hit: true },
      { text: 'cribing', hit: false }
    ]);
  });

  it('handles a match at the end without a trailing empty run', () => {
    expect(segments('data', [3])).toEqual([
      { text: 'dat', hit: false },
      { text: 'a', hit: true }
    ]);
  });

  it('reassembles into exactly the original label', () => {
    // The one property that must hold whatever the indices are: highlighting must
    // never lose or duplicate a character.
    const label = 'Quiz 1 — Describing data';
    const matched = score('qdd', label)?.matched ?? [];
    expect(segments(label, matched).map((part) => part.text).join('')).toBe(label);
  });
});
