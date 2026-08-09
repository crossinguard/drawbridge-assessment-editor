import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import { VaultSnapshotSchema, type VaultSnapshot } from '$lib/domain/schema';
import {
  CollectionFileSchema,
  ManifestSchema,
  OutcomesFileSchema,
  PATHS,
  RubricFileSchema,
  SCHEMA_VERSION,
  VaultFileSchema,
  uniqueSlugger,
  type Manifest
} from './format';
import { bundleReadme } from './readme';

/*
  Writing and reading a bundle.

  Depends on `domain/` and nothing else — no repository, no stores, no Svelte. That is
  what lets the whole format be tested as pure text, and it is enforced by
  src/lib/architecture.test.ts.
*/

export interface BundleMeta {
  appVersion: string;
  exportedAt?: string;
  /** True when the snapshot is a slice of a vault rather than the whole thing. */
  partial?: boolean;
}

/**
 * The bundle as a map of path → file text.
 *
 * Split out from zipping so tests can assert on the actual contents without a
 * round-trip through a compressor, and so a future "preview what will be exported"
 * costs nothing.
 */
export function buildBundleFiles(
  snapshot: VaultSnapshot,
  meta: BundleMeta
): Record<string, string> {
  const exportedAt = meta.exportedAt ?? new Date().toISOString();
  const partial = meta.partial ?? false;

  const counts = {
    outcomes: snapshot.outcomes.length,
    collections: snapshot.collections.length,
    items: snapshot.items.length,
    rubrics: snapshot.rubrics.length
  };

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    appVersion: meta.appVersion,
    vaultId: snapshot.vault.id,
    vaultCode: snapshot.vault.code,
    counts,
    partial
  };

  const files: Record<string, string> = {
    [PATHS.readme]: bundleReadme({
      vaultName: snapshot.vault.name,
      vaultCode: snapshot.vault.code,
      exportedAt,
      appVersion: meta.appVersion,
      counts,
      partial
    }),
    [PATHS.manifest]: json(manifest),
    [PATHS.vault]: json(snapshot.vault),
    [PATHS.outcomes]: json(snapshot.outcomes)
  };

  // One slugger per bundle, so two collections with the same title get distinct
  // filenames instead of one silently overwriting the other inside the zip.
  const collectionSlug = uniqueSlugger();
  for (const collection of snapshot.collections) {
    const slug = collectionSlug(collection.title, 'collection');
    files[`${PATHS.collections}${slug}.json`] = json({
      collection,
      items: snapshot.items.filter((item) => item.collectionId === collection.id)
    });
  }

  const rubricSlug = uniqueSlugger();
  for (const rubric of snapshot.rubrics) {
    files[`${PATHS.rubrics}${rubricSlug(rubric.title, 'rubric')}.json`] = json(rubric);
  }

  return files;
}

export function writeBundle(snapshot: VaultSnapshot, meta: BundleMeta): Uint8Array {
  const files = buildBundleFiles(snapshot, meta);
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(files)) entries[path] = strToU8(text);

  // level 6 is the usual default; these are small text files and the difference
  // between settings is milliseconds either way.
  return zipSync(entries, { level: 6 });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface FileProblem {
  file: string;
  message: string;
}

export interface BundleReadResult {
  /** Null when the bundle has no usable vault record — the one fatal case. */
  snapshot: VaultSnapshot | null;
  manifest: Manifest | null;
  /** Per-file, so one bad collection does not cost the user the other nineteen. */
  problems: FileProblem[];
}

/**
 * Reads a bundle, salvaging everything readable.
 *
 * The rule is that a damaged file costs you that file and nothing else. Refusing the
 * whole bundle because one collection will not parse would be the worst possible
 * behaviour for the one feature whose entire job is getting a term's work back.
 *
 * Only `vault.json` is load-bearing: without it there is no course to attach anything
 * to, and the result is a null snapshot with the reason reported.
 */
export function readBundle(bytes: Uint8Array): BundleReadResult {
  const problems: FileProblem[] = [];

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (cause) {
    return {
      snapshot: null,
      manifest: null,
      problems: [{ file: '(archive)', message: `Not a readable zip: ${describe(cause)}` }]
    };
  }

  const textOf = (path: string): string | null => {
    const raw = entries[path];
    return raw ? strFromU8(raw) : null;
  };

  const parseFile = <T>(path: string, schema: z.ZodType<T>): T | null => {
    const text = textOf(path);
    if (text === null) return null;

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (cause) {
      problems.push({ file: path, message: `Not valid JSON: ${describe(cause)}` });
      return null;
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      problems.push({ file: path, message: summariseIssues(result.error) });
      return null;
    }
    return result.data;
  };

  const manifest = parseFile(PATHS.manifest, ManifestSchema);
  if (manifest && manifest.schemaVersion > SCHEMA_VERSION) {
    // Not refused: unknown fields are preserved rather than stripped, so a newer
    // bundle usually loads fine. Say so rather than pretending nothing is odd.
    problems.push({
      file: PATHS.manifest,
      message: `Written by a newer version of Drawbridge (bundle schema ${manifest.schemaVersion}, this app reads ${SCHEMA_VERSION}). Anything it does not recognise will be preserved but not shown.`
    });
  }

  const vault = parseFile(PATHS.vault, VaultFileSchema);
  if (!vault) {
    if (textOf(PATHS.vault) === null) {
      problems.push({ file: PATHS.vault, message: 'Missing. A bundle needs this file.' });
    }
    return { snapshot: null, manifest, problems };
  }

  const outcomes = parseFile(PATHS.outcomes, OutcomesFileSchema) ?? [];

  const collections: VaultSnapshot['collections'] = [];
  const items: VaultSnapshot['items'] = [];
  const rubrics: VaultSnapshot['rubrics'] = [];

  for (const path of Object.keys(entries).sort()) {
    if (path.endsWith('/')) continue; // directory entry
    if (!path.endsWith('.json')) continue; // README, and the Markdown and CSV to come

    if (path.startsWith(PATHS.collections)) {
      const file = parseFile(path, CollectionFileSchema);
      if (file) {
        collections.push(file.collection);
        items.push(...file.items);
      }
    } else if (path.startsWith(PATHS.rubrics)) {
      const rubric = parseFile(path, RubricFileSchema);
      if (rubric) rubrics.push(rubric);
    }
    // Anything else is ignored on purpose: a file this version does not know about is
    // not an error, and neither is one the user dropped in themselves.
  }

  const snapshot = VaultSnapshotSchema.parse({ vault, outcomes, collections, items, rubrics });
  return { snapshot, manifest, problems };
}

// ---------------------------------------------------------------------------

function json(value: unknown): string {
  // Indented, because these files are meant to be opened and read.
  return `${JSON.stringify(value, null, 2)}\n`;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function summariseIssues(error: z.ZodError): string {
  const issues = error.issues;
  const shown = issues.slice(0, 3).map((issue) => {
    const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${where}: ${issue.message}`;
  });
  const rest = issues.length - shown.length;
  return `Does not match the expected shape — ${shown.join('; ')}${
    rest > 0 ? ` (and ${rest} more)` : ''
  }`;
}
