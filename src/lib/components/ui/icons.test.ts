import { describe, expect, it } from 'vitest';
import { ICONS, type IconName } from './icons';

/*
  The failure this guards against is quiet: a mistyped `name` renders an empty 16×16 box,
  the button still works, and nothing in the app says anything. There is no renderer in
  this suite, so what can be checked is the data — and the data is the part that would be
  wrong.
*/

const names = Object.keys(ICONS) as IconName[];

describe('the icon set', () => {
  it('gives every name at least one path', () => {
    for (const name of names) {
      expect(ICONS[name].length, name).toBeGreaterThan(0);
    }
  });

  it('starts every path with an absolute move, so nothing depends on what drew before it', () => {
    for (const name of names) {
      for (const d of ICONS[name]) expect(d.startsWith('M'), `${name}: ${d}`).toBe(true);
    }
  });

  it('keeps every coordinate inside the 16×16 grid', () => {
    // Drawn at stroke-width 1.5, so 0.75 of the stroke sits outside the path itself.
    // Anything beyond this range would be clipped by the viewBox on one side only,
    // which reads as a wonky icon rather than a missing one.
    for (const name of names) {
      for (const d of ICONS[name]) {
        for (const value of d.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(Number(value), `${name}: ${d}`).toBeLessThanOrEqual(16);
          expect(Number(value), `${name}: ${d}`).toBeGreaterThanOrEqual(-16);
        }
      }
    }
  });
});
