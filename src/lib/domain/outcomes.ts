import type { Outcome } from './schema';

/*
  Outcome tree helpers.

  Outcomes are stored flat, each holding a `parentId`, and assembled into a tree on
  read. Depth is whatever the user builds; `config.outcomeTiers` only supplies a label
  per depth, so nothing here may assume three levels or any other fixed shape.
*/

export interface OutcomeNode {
  outcome: Outcome;
  depth: number;
  children: OutcomeNode[];
}

function byOrder(a: Outcome, b: Outcome): number {
  if (a.order !== b.order) return a.order - b.order;
  // Codes are the user's own sequencing, so they are the natural tie-break when two
  // siblings share an order — which they will, since `order` starts at 0 for everyone.
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

/** Direct children of `parentId`, in display order. Pass `null` for the roots. */
export function childrenOf(
  outcomes: readonly Outcome[],
  parentId: string | null
): Outcome[] {
  return outcomes.filter((outcome) => outcome.parentId === parentId).sort(byOrder);
}

export function isLeaf(outcomes: readonly Outcome[], outcomeId: string): boolean {
  return !outcomes.some((outcome) => outcome.parentId === outcomeId);
}

export function leavesOf(outcomes: readonly Outcome[]): Outcome[] {
  return outcomes.filter((outcome) => isLeaf(outcomes, outcome.id));
}

/**
 * The flat list as a tree.
 *
 * Orphans — an outcome whose `parentId` names something that is not here — are
 * promoted to roots rather than dropped. Losing a subtree because one parent went
 * missing would be far worse than showing it in the wrong place, and `validate.ts`
 * reports the dangling reference.
 */
export function buildTree(outcomes: readonly Outcome[]): OutcomeNode[] {
  const present = new Set(outcomes.map((outcome) => outcome.id));
  const effectiveParent = (outcome: Outcome): string | null =>
    outcome.parentId !== null && present.has(outcome.parentId) ? outcome.parentId : null;

  const childrenByParent = new Map<string | null, Outcome[]>();
  for (const outcome of outcomes) {
    const key = effectiveParent(outcome);
    const siblings = childrenByParent.get(key);
    if (siblings) siblings.push(outcome);
    else childrenByParent.set(key, [outcome]);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(byOrder);

  // `seen` guards against a parentId cycle, which a bad merge on import could produce.
  // Without it this recursion would not terminate.
  const seen = new Set<string>();
  const build = (parentId: string | null, depth: number): OutcomeNode[] =>
    (childrenByParent.get(parentId) ?? [])
      .filter((outcome) => !seen.has(outcome.id))
      .map((outcome) => {
        seen.add(outcome.id);
        return { outcome, depth, children: build(outcome.id, depth + 1) };
      });

  return build(null, 0);
}

/** Depth-first walk of a built tree, in display order. */
export function walkTree(nodes: readonly OutcomeNode[]): OutcomeNode[] {
  return nodes.flatMap((node) => [node, ...walkTree(node.children)]);
}

/** An outcome's ancestors, nearest first. Used for breadcrumbs and code suggestions. */
export function ancestorsOf(outcomes: readonly Outcome[], outcomeId: string): Outcome[] {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const chain: Outcome[] = [];
  const seen = new Set<string>([outcomeId]);

  let current = byId.get(outcomeId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    const parent = byId.get(current);
    if (!parent) break;
    chain.push(parent);
    seen.add(current);
    current = parent.parentId;
  }
  return chain;
}
