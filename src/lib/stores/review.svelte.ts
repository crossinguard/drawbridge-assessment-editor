import { repository } from '$lib/repo';
import { computeCoverage, type CoverageReport } from '$lib/domain/coverage';
import { buildTree, walkTree, type OutcomeNode } from '$lib/domain/outcomes';
import { flattenItems, type ScoringContext } from '$lib/domain/points';
import { validateVault, type Issue } from '$lib/domain/validate';
import type { Collection, Item, VaultSnapshot } from '$lib/domain/schema';
import { describe, type LoadStatus } from './vaults.svelte';

/*
  A whole-vault read, for the two screens that need to see everything at once:
  coverage and the problems panel.

  It gathers through `repository.exportVault` rather than a bespoke query. That method
  already assembles exactly this shape and is covered by the round-trip tests, so using
  it here means one gather path instead of two that could drift. It is a read; nothing
  about it is export-specific.

  Deliberately NOT live. This is a review view — you come to it, read it, and go fix
  something. Keeping it a snapshot taken on entry means the numbers hold still while
  you read them, and `reload()` is there for after you have changed something.
*/

export interface RecentEntry {
  kind: 'collection' | 'item';
  id: string;
  label: string;
  collectionId: string;
  updatedAt: string;
}

class ReviewStore {
  snapshot = $state<VaultSnapshot | null>(null);
  status = $state<LoadStatus>('idle');
  error = $state<string | null>(null);
  vaultId = $state('');

  async load(vaultId: string): Promise<void> {
    if (this.vaultId === vaultId && this.status === 'ready') return;
    this.vaultId = vaultId;
    await this.reload();
  }

  async reload(): Promise<void> {
    if (this.status !== 'ready') this.status = 'loading';
    try {
      this.snapshot = await repository.exportVault(this.vaultId);
      this.error = null;
      this.status = 'ready';
    } catch (cause) {
      this.error = describe(cause);
      this.status = 'error';
    }
  }

  get itemsByCollection(): Map<string, Item[]> {
    const grouped = new Map<string, Item[]>();
    for (const collection of this.snapshot?.collections ?? []) grouped.set(collection.id, []);
    for (const item of this.snapshot?.items ?? []) {
      const list = grouped.get(item.collectionId);
      if (list) list.push(item);
    }
    return grouped;
  }

  get scoring(): ScoringContext {
    return {
      rubricsById: new Map((this.snapshot?.rubrics ?? []).map((rubric) => [rubric.id, rubric]))
    };
  }

  get coverage(): CoverageReport | null {
    if (!this.snapshot) return null;
    return computeCoverage({
      outcomes: this.snapshot.outcomes,
      collections: this.snapshot.collections,
      itemsByCollection: this.itemsByCollection,
      context: this.scoring
    });
  }

  get issues(): Issue[] {
    if (!this.snapshot) return [];
    return validateVault({
      vault: this.snapshot.vault,
      outcomes: this.snapshot.outcomes,
      collections: this.snapshot.collections,
      itemsByCollection: this.itemsByCollection,
      rubrics: this.snapshot.rubrics
    });
  }

  /** Outcomes in tree order, with depth, so the matrix rows read as a hierarchy. */
  get outcomeRows(): OutcomeNode[] {
    return walkTree(buildTree(this.snapshot?.outcomes ?? []));
  }

  get collections(): Collection[] {
    return [...(this.snapshot?.collections ?? [])].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.order - b.order
    );
  }

  /** Leaf outcomes nothing assesses, resolved to records for display. */
  get uncovered() {
    const ids = new Set(this.coverage?.uncoveredOutcomeIds ?? []);
    return (this.snapshot?.outcomes ?? []).filter((outcome) => ids.has(outcome.id));
  }

  /**
   * Most recently touched work.
   *
   * Items are flattened so a group part that was edited counts as recent activity —
   * "I was last working on part b" is exactly what someone returning to a course
   * after a week wants to be told.
   */
  recent(limit = 8): RecentEntry[] {
    const snapshot = this.snapshot;
    if (!snapshot) return [];

    const collectionTitles = new Map(snapshot.collections.map((c) => [c.id, c.title]));

    const entries: RecentEntry[] = [
      ...snapshot.collections.map((collection) => ({
        kind: 'collection' as const,
        id: collection.id,
        label: collection.title || 'Untitled collection',
        collectionId: collection.id,
        updatedAt: collection.updatedAt
      })),
      ...flattenItems(snapshot.items).map((item) => ({
        kind: 'item' as const,
        id: item.id,
        label:
          (item.stem.trim().split('\n')[0] ?? '').slice(0, 60) ||
          `Untitled ${item.kind}`,
        collectionId: item.collectionId,
        updatedAt: item.updatedAt
      }))
    ];

    return entries
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((entry) => ({
        ...entry,
        label:
          entry.kind === 'item'
            ? `${entry.label} — ${collectionTitles.get(entry.collectionId) ?? ''}`
            : entry.label
      }));
  }

  /**
   * Where to go to fix an issue.
   *
   * Issue ids for a nested thing are `${parentId}:${childId}` (a rubric criterion, for
   * instance), so only the first segment is resolvable as an entity.
   */
  linkFor(issue: Issue): string | null {
    const vaultId = this.vaultId;
    const id = issue.entityId.split(':')[0] ?? issue.entityId;

    if (issue.entityType === 'vault') return `/v/${vaultId}/settings`;
    if (issue.entityType === 'outcome') return `/v/${vaultId}/outcomes`;
    if (issue.entityType === 'rubric') return `/v/${vaultId}/rubrics/${id}`;
    if (issue.entityType === 'collection') return `/v/${vaultId}/c/${id}`;

    if (issue.entityType === 'item') {
      const owner = flattenItems(this.snapshot?.items ?? []).find((item) => item.id === id);
      return owner ? `/v/${vaultId}/c/${owner.collectionId}` : null;
    }
    return null;
  }

  reset(): void {
    this.snapshot = null;
    this.vaultId = '';
    this.status = 'idle';
  }
}

export const review = new ReviewStore();
