import { describe, expect, it } from 'vitest';
import { ancestorsOf, buildTree, childrenOf, isLeaf, leavesOf, walkTree } from './outcomes';
import { anOutcome } from './fixtures';

const co1 = anOutcome({ id: 'co1', code: 'CO1', parentId: null, order: 0 });
const eo11 = anOutcome({ id: 'eo11', code: 'EO1.1', parentId: 'co1', order: 0 });
const eo12 = anOutcome({ id: 'eo12', code: 'EO1.2', parentId: 'co1', order: 1 });
const lo111 = anOutcome({ id: 'lo111', code: 'LO1.1.1', parentId: 'eo11', order: 0 });
const tree = [co1, eo11, eo12, lo111];

describe('buildTree', () => {
  it('nests to whatever depth the user built', () => {
    const roots = buildTree(tree);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.outcome.code).toBe('CO1');
    expect(roots[0]?.children.map((n) => n.outcome.code)).toEqual(['EO1.1', 'EO1.2']);
    expect(roots[0]?.children[0]?.children[0]?.outcome.code).toBe('LO1.1.1');
  });

  it('records depth for tier labelling', () => {
    expect(walkTree(buildTree(tree)).map((n) => [n.outcome.code, n.depth])).toEqual([
      ['CO1', 0],
      ['EO1.1', 1],
      ['LO1.1.1', 2],
      ['EO1.2', 1]
    ]);
  });

  it('promotes an orphan to the top rather than dropping its subtree', () => {
    // Losing a whole branch because one parent went missing is far worse than showing
    // it in the wrong place. validate.ts reports the dangling parent separately.
    const orphan = anOutcome({ id: 'x', code: 'EO9.9', parentId: 'deleted-parent' });
    const roots = buildTree([co1, orphan]);
    expect(roots.map((n) => n.outcome.code).sort()).toEqual(['CO1', 'EO9.9']);
  });

  it('terminates on a parentId cycle instead of hanging', () => {
    // A bad merge on import can produce this, and an infinite recursion would take
    // the whole tab down with no error to report.
    const a = anOutcome({ id: 'a', code: 'A', parentId: 'b' });
    const b = anOutcome({ id: 'b', code: 'B', parentId: 'a' });
    expect(() => buildTree([a, b])).not.toThrow();
    expect(walkTree(buildTree([a, b])).length).toBeLessThanOrEqual(2);
  });

  it('breaks an order tie on code, numerically', () => {
    const mk = (code: string) => anOutcome({ id: code, code, parentId: null, order: 0 });
    const roots = buildTree([mk('EO10'), mk('EO2'), mk('EO1')]);
    expect(roots.map((n) => n.outcome.code)).toEqual(['EO1', 'EO2', 'EO10']);
  });
});

describe('tree queries', () => {
  it('finds direct children, and roots via null', () => {
    expect(childrenOf(tree, 'co1').map((o) => o.code)).toEqual(['EO1.1', 'EO1.2']);
    expect(childrenOf(tree, null).map((o) => o.code)).toEqual(['CO1']);
  });

  it('identifies leaves', () => {
    expect(isLeaf(tree, 'co1')).toBe(false);
    expect(isLeaf(tree, 'lo111')).toBe(true);
    expect(leavesOf(tree).map((o) => o.code).sort()).toEqual(['EO1.2', 'LO1.1.1']);
  });

  it('walks ancestors nearest first', () => {
    expect(ancestorsOf(tree, 'lo111').map((o) => o.code)).toEqual(['EO1.1', 'CO1']);
    expect(ancestorsOf(tree, 'co1')).toEqual([]);
  });

  it('does not loop forever on a cyclic ancestor chain', () => {
    const a = anOutcome({ id: 'a', code: 'A', parentId: 'b' });
    const b = anOutcome({ id: 'b', code: 'B', parentId: 'a' });
    expect(() => ancestorsOf([a, b], 'a')).not.toThrow();
  });
});
