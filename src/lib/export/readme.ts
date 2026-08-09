import { count } from '$lib/text';
import { SCHEMA_VERSION } from './format';

/*
  The README that ships inside every bundle.

  This is the file that makes the zip stand on its own. The promise is that somebody
  who finds it in five years — a colleague, a successor, the author with no memory of
  this app — can open it and understand what they have without Drawbridge existing any
  more. So it explains the layout, says which files are authoritative, and is honest
  about what is not here.
*/

export function bundleReadme(input: {
  vaultName: string;
  vaultCode: string;
  exportedAt: string;
  appVersion: string;
  counts: { outcomes: number; collections: number; items: number; rubrics: number };
  partial: boolean;
}): string {
  const { vaultName, vaultCode, exportedAt, appVersion, counts, partial } = input;

  return `# ${vaultName} (${vaultCode})

A Drawbridge bundle: course assessments, the outcomes they are aligned to, and the
settings that give both meaning.

- Exported: ${exportedAt}
- Written by: Drawbridge ${appVersion}, bundle schema version ${SCHEMA_VERSION}
- Contains: ${count(counts.outcomes, 'outcome')}, ${count(counts.collections, 'collection')}, ${count(counts.items, 'item')}, ${count(counts.rubrics, 'rubric')}${
    partial ? '\n- **This is a partial export** — part of a course, not the whole thing.' : ''
  }

## What is in here

| File | What it holds |
| --- | --- |
| \`manifest.json\` | What this bundle is, when it was written, and how much is in it. |
| \`vault.json\` | The course record, including every vocabulary it defines — statuses, collection kinds, rubric level sets, tag dimensions, custom field definitions. Read this first: it is what the codes and keys elsewhere refer to. |
| \`outcomes.json\` | Every outcome, flat, each carrying its own \`parentId\`. Assemble the tree by following those. \`order\` sorts siblings. |
| \`collections/*.json\` | One file per collection — an item bank, quiz, exam, task or discussion set — with its items inside it. |
| \`rubrics/*.json\` | One file per rubric: its levels and its criteria. |

## How to read it

Everything is plain JSON with no compression beyond the zip itself. Open any file in a
text editor.

A few things worth knowing before you interpret the numbers:

- **A rubric criterion is worth its best level, not the sum of its levels.** The levels
  are alternatives — a response is Exemplary *or* Proficient. A rubric's total is the
  sum of its criteria maxima.
- **A multi-part item is the sum of its parts.** That is the opposite of a rubric, and
  it is the usual source of confusion.
- **An item's own \`points\`, if set, wins over anything derived.**
- **A \`stimulus\` item carries no points.** It is a shared passage or data table that
  other items refer to through \`stimulusId\`.
- \`declaredPoints\` on a collection is what the author *said* it was worth. It is
  cross-checked against the computed total and never used to override it.

Fields the app did not recognise were preserved exactly as they were found, so nothing
is lost by a round trip through a version that predates them.

## Putting it back

Drawbridge imports this bundle as-is: open it, choose **new course** or **merge into an
existing one**. JSON is the authoritative form and the only thing the importer reads.

If a single file in here is damaged, the importer reports that file and still loads the
rest — it does not refuse the whole bundle.

## What is not in here

Nothing about students. Drawbridge never administers an assessment and never grades
one, so there are no submissions, scores, rosters or results anywhere in this file.
`;
}
