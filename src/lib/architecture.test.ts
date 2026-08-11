import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  The dependency direction in src/lib is the one rule that keeps this codebase
  testable, and it is the kind of rule that erodes one convenient import at a time.
  A reviewer will not notice `import { db } from '../repo/dexie'` inside a domain
  file; this test will.

  It reads source text rather than building a module graph on purpose — no build
  step, no cycles to resolve, and it still runs in the `node` environment alongside
  the domain tests.
*/

const libDir = fileURLToPath(new URL('.', import.meta.url));

function sourceFilesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // The directory does not exist yet — the rule holds vacuously.
    return [];
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFilesUnder(full);
    return full.endsWith('.ts') || full.endsWith('.svelte') ? [full] : [];
  });
}

/** Every module specifier in a file, from static imports, re-exports and dynamic import(). */
function importsIn(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

  for (const match of text.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

function check(dir: string, forbidden: (specifier: string) => boolean): string[] {
  return sourceFilesUnder(join(libDir, dir)).flatMap((file) =>
    importsIn(file)
      .filter(forbidden)
      .map((specifier) => `${relative(libDir, file)} imports "${specifier}"`)
  );
}

describe('src/lib dependency direction', () => {
  it('domain/ imports nothing from repo/, stores/, components/ or Svelte', () => {
    const violations = check(
      'domain',
      (specifier) =>
        /(^|\/)(repo|stores|components)(\/|$)/.test(specifier) ||
        specifier === 'svelte' ||
        specifier.startsWith('svelte/') ||
        specifier.startsWith('$app/') ||
        specifier.startsWith('$lib/repo') ||
        specifier.startsWith('$lib/stores')
    );

    // domain/ is the model. It must stay pure and DOM-free so it can be tested
    // headlessly, and so a Tauri build can reuse it untouched.
    expect(violations).toEqual([]);
  });

  it('only repo/ knows that IndexedDB exists', () => {
    const offenders = ['domain', 'export', 'stores', 'components'].flatMap((dir) =>
      check(dir, (specifier) => specifier === 'dexie' || specifier.startsWith('dexie/'))
    );

    // Swapping DexieRepository for a filesystem adapter on the desktop build must
    // not touch anything above repo/.
    expect(offenders).toEqual([]);
  });

  it('no source file contains a raw control character', () => {
    /*
      A stray NUL or other control byte makes `file` report the source as binary and
      makes grep skip it entirely — the file still compiles and every other test still
      passes, so nothing surfaces it. This has already happened once, in a template
      literal that was meant to hold a separator.

      Tab, newline and carriage return are the legitimate ones.
    */
    const offenders = sourceFilesUnder(libDir)
      .concat(sourceFilesUnder(join(libDir, '..', 'routes')))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        // Written as escapes, necessarily — a literal class here would be the bug.
        const match = new RegExp(String.raw`[\u0000-\u0008\u000b\u000c\u000e-\u001f]`).exec(text);
        if (!match) return [];
        const line = text.slice(0, match.index).split('\n').length;
        const code = match[0].codePointAt(0)?.toString(16).padStart(4, '0');
        return [`${relative(libDir, file)}:${line} contains U+${code}`];
      });

    expect(offenders).toEqual([]);
  });

  it('no source file contains an isolated combining mark', () => {
    /*
      A combining mark attaches to the character before it, so one written after a
      bracket or a quote is invisible in an editor and in a diff. This has happened
      here too, in a regex meant to say `[\u0300-\u036f]` and actually containing the
      marks themselves — correct at runtime, unreadable in source.

      A mark following a letter is legitimate (decomposed accented prose). One that is
      not is always a mistake.
    */
    const isolated = new RegExp(String.raw`(?<![A-Za-z])[\u0300-\u036f]`, 'u');

    const offenders = sourceFilesUnder(libDir)
      .concat(sourceFilesUnder(join(libDir, '..', 'routes')))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        const match = isolated.exec(text);
        if (!match) return [];
        const line = text.slice(0, match.index).split('\n').length;
        return [`${relative(libDir, file)}:${line}`];
      });

    expect(offenders).toEqual([]);
  });

  it('export/ depends on domain only, never on storage', () => {
    const violations = check(
      'export',
      (specifier) =>
        /(^|\/)(repo|stores|components)(\/|$)/.test(specifier) ||
        specifier.startsWith('$lib/repo') ||
        specifier.startsWith('$lib/stores')
    );

    expect(violations).toEqual([]);
  });
});

describe('control conventions', () => {
  it('gives every button an explicit type', () => {
    /*
      A bare <button> defaults to `type="submit"`. Every one of these sits outside a
      form today, so nothing is broken — but the day one lands inside a form it submits
      it, and the symptom is a page that reloads instead of doing what was asked.

      `ui/IconButton.svelte` sets the type itself and does not let a caller override it,
      which is why call sites do not have to repeat it.
    */
    /*
      Comments are blanked rather than removed, so the offsets that produce the line
      number still line up with the original file. Several of these files explain the
      rule in prose that names the element, and a check that flagged its own
      documentation would be worse than no check.
    */
    const withoutComments = (text: string) =>
      text
        .replace(/<!--[\s\S]*?-->/g, (found) => found.replace(/[^\n]/g, ' '))
        .replace(/\/\*[\s\S]*?\*\//g, (found) => found.replace(/[^\n]/g, ' '));

    const offenders = sourceFilesUnder(join(libDir, 'components'))
      .concat(sourceFilesUnder(join(libDir, '..', 'routes')))
      .flatMap((file) => {
        const text = withoutComments(readFileSync(file, 'utf8'));
        return [...text.matchAll(/<button\b[^>]*>/gs)]
          // `type="button"` or Svelte's `{type}` shorthand, which Button.svelte uses to
          // default the attribute while still letting a form say `type="submit"`.
          .filter((match) => !/\stype=|\{type\}/.test(match[0]))
          .map(
            (match) => `${relative(libDir, file)}:${text.slice(0, match.index).split('\n').length}`
          );
      });

    expect(offenders).toEqual([]);
  });
});
