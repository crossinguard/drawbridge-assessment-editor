import { z } from 'zod';
import {
  CollectionSchema,
  ItemSchema,
  OutcomeSchema,
  RubricSchema,
  VaultSchema
} from '$lib/domain/schema';

/*
  The bundle format.

  A bundle is an ordinary zip of ordinary JSON. Someone who finds one in five years
  should be able to open it and understand it without this app, which is why it carries
  its own README and why nothing here is compressed, encoded, or clever.

  JSON is the lossless form and the only thing `import` reads. Markdown and CSV join
  the bundle in a later stage purely for humans and other tools; the importer will keep
  ignoring them, and it already ignores any file it does not recognise so that a bundle
  from a newer version — or one a user has dropped their own notes into — still loads.
*/

/**
 * Bumped only when a bundle written by this version would be MISREAD by an older one.
 * Adding a file, or adding a field that older code will simply carry through as an
 * unknown key, is not a reason to bump it.
 */
export const SCHEMA_VERSION = 1;

export const PATHS = {
  readme: 'README.md',
  manifest: 'manifest.json',
  vault: 'vault.json',
  outcomes: 'outcomes.json',
  collections: 'collections/',
  rubrics: 'rubrics/'
} as const;

export const ManifestSchema = z.looseObject({
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  appVersion: z.string(),
  vaultId: z.string(),
  vaultCode: z.string().default(''),
  /** Advisory. The importer counts what it actually reads rather than trusting these. */
  counts: z
    .looseObject({
      outcomes: z.number().int().default(0),
      collections: z.number().int().default(0),
      items: z.number().int().default(0),
      rubrics: z.number().int().default(0)
    })
    // Spelled out rather than `{}`: the inner fields carry defaults, so the object's
    // OUTPUT type has them all required and an empty default does not satisfy it.
    .default({ outcomes: 0, collections: 0, items: 0, rubrics: 0 }),
  /** Set when the bundle holds part of a vault rather than all of it. */
  partial: z.boolean().default(false)
});

/**
 * One collection and the items belonging to it, together in one file.
 *
 * Items live here rather than in a top-level items.json because a collection and its
 * questions are the unit a person actually wants: "send me your Unit 1 test" is one
 * file, and it is readable on its own.
 */
export const CollectionFileSchema = z.looseObject({
  collection: CollectionSchema,
  items: z.array(ItemSchema).default([])
});

export const OutcomesFileSchema = z.array(OutcomeSchema);

export const VaultFileSchema = VaultSchema;

export const RubricFileSchema = RubricSchema;

export type Manifest = z.infer<typeof ManifestSchema>;
export type CollectionFile = z.infer<typeof CollectionFileSchema>;

/**
 * A filename-safe stem for a title.
 *
 * Deliberately conservative — lowercase ASCII, digits and hyphens only. These names
 * have to survive a Windows work machine, a Linux laptop and whatever unzips them,
 * and a colon or a smart quote in an exam title is not worth a broken extraction.
 */
export function slugify(title: string, fallback = 'untitled'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || fallback;
}

/**
 * Makes slugs unique within one bundle by suffixing repeats.
 *
 * Two collections called "Quiz 1" are perfectly reasonable and must not overwrite each
 * other inside the zip — which is the kind of loss that is invisible until the day
 * someone tries to restore.
 */
export function uniqueSlugger(): (title: string, fallback?: string) => string {
  const used = new Map<string, number>();

  return (title: string, fallback?: string) => {
    const base = slugify(title, fallback);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };
}

/** `drawbridge-stat101-2026-08-09.zip` */
export function bundleFilename(vaultCode: string, when: Date = new Date()): string {
  const date = when.toISOString().slice(0, 10);
  const code = slugify(vaultCode, 'vault');
  return `drawbridge-${code}-${date}.zip`;
}
