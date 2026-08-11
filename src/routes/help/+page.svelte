<script lang="ts">
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { APP_VERSION } from '$lib/export/download';

  /*
    The guide, written last and against the shipped screens rather than against the
    plan — which is the only reason it can name a button and be right.

    Two rules for editing it. Say what the app does, not what it ought to do: the
    things deliberately missing (undo, a command palette, moving an item between
    collections) are listed as missing, because a guide that implies otherwise is
    worse than no guide when somebody is deciding whether it is safe to click delete.
    And keep the reasoning: most of what confuses people here — a criterion worth its
    best level, a blank points field meaning "not stated" — are decisions, not
    accidents, and the explanation is the useful part.

    Static markup on purpose. It prerenders with the rest of the shell, so it is in
    the precache and readable offline, which is where it is most likely to be needed.
  */

  interface Entry {
    id: string;
    title: string;
  }

  const sections: Entry[] = [
    { id: 'quickstart', title: 'Quickstart' },
    { id: 'saving', title: 'Saving, and where your work lives' },
    { id: 'outcomes', title: 'Outcomes' },
    { id: 'collections', title: 'Collections and sections' },
    { id: 'kinds', title: 'The eight item kinds' },
    { id: 'points', title: 'How points are worked out' },
    { id: 'rubrics', title: 'Rubrics' },
    { id: 'review', title: 'Coverage and the notes panel' },
    { id: 'settings', title: 'Setting a course up' },
    { id: 'bundle', title: 'Export, import and backup' },
    { id: 'offline', title: 'Installing and working offline' },
    { id: 'missing', title: 'What is deliberately not here' }
  ];

  const kinds: { kind: string; blurb: string; detail: string }[] = [
    {
      kind: 'choice',
      blurb: 'Options, exactly one correct.',
      detail:
        'Ticking one option unticks the others. The notes panel flags an item with no options at all, and one where the number marked correct is not exactly one.'
    },
    {
      kind: 'multi',
      blurb: 'Options, two or more correct.',
      detail:
        'Every option is independently tickable. Fewer than two marked correct is flagged — that is a choice item wearing the wrong kind.'
    },
    {
      kind: 'trueFalse',
      blurb: 'Two fixed options.',
      detail:
        'True and False are filled in for you and their text is not editable — mark one correct. Everything else behaves like a choice item.'
    },
    {
      kind: 'shortAnswer',
      blurb: 'An expected answer, plus other answers you would accept.',
      detail:
        '“Also accept” is a comma-separated list. Nothing here is ever matched against a student response — Drawbridge does not grade — it is there so the key travels with the question.'
    },
    {
      kind: 'essay',
      blurb: 'A model answer, usually with a rubric attached.',
      detail:
        'The model answer is what a strong response covers, for whoever marks it. Attach a rubric and the item is worth the rubric total unless you type a points value.'
    },
    {
      kind: 'discussion',
      blurb: 'A prompt, plus what the posting requires.',
      detail:
        'The stem is the prompt. Underneath, set the initial post and the replies separately: minimum words, how many replies, a due note in your own words, and free-text requirements. Leave any of them blank and it is simply not stated.'
    },
    {
      kind: 'group',
      blurb: 'A container whose parts are its own items.',
      detail:
        'The stem becomes shared instructions that apply to every part. Parts are added inside the card and can be any kind except another stimulus or discussion. A group is worth the sum of its parts.'
    },
    {
      kind: 'stimulus',
      blurb: 'A shared passage, data table or figure.',
      detail:
        'Not answered, so it has no points field and no answer fields at all. Other items in the same collection point at it with their “Reads from” picker.'
    }
  ];
</script>

<svelte:head>
  <title>Guide — Drawbridge</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <a
        href="/"
        class="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
      >
        ← Courses
      </a>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight">Guide</h1>
      <p class="mt-1 max-w-prose text-sm text-text-muted">
        What each screen does, and why the numbers say what they say. Drawbridge
        {APP_VERSION}.
      </p>
    </div>
    <ThemeToggle />
  </header>

  <div class="flex flex-col gap-8 lg:flex-row lg:gap-10">
    <nav
      class="shrink-0 rounded-lg border border-border-subtle bg-surface p-3 text-sm
             lg:sticky lg:top-6 lg:h-fit lg:w-60"
      aria-label="Sections"
    >
      <ol class="flex flex-col gap-0.5">
        {#each sections as section (section.id)}
          <li>
            <a
              href="#{section.id}"
              class="block rounded px-2 py-1 text-text-muted transition-colors
                     hover:bg-surface-raised hover:text-text focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {section.title}
            </a>
          </li>
        {/each}
      </ol>
    </nav>

    <div class="flex min-w-0 flex-col gap-10">
      <!-- ------------------------------------------------------------------ -->
      <section id="quickstart" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Quickstart</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Seven steps, in the order the app expects. None of them has to be finished
          before you move on — an assessment can sit half-written for as long as you
          like.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          If you would rather see one already built,
          <strong class="font-medium text-text">Load a sample course</strong> on the home
          screen makes a worked statistics course — outcomes, a quiz, an exam, a discussion
          and a rubric-scored task. It is an ordinary course: edit it, export it, delete it.
          It also opens with a couple of deliberate loose ends, so the notes panel and the
          coverage gap have something real in them.
        </p>
        <ol class="flex max-w-prose list-decimal flex-col gap-2 ps-5 text-sm marker:text-text-muted">
          <li>
            <strong class="font-medium">Create a course.</strong> Name, code and an optional
            term. The code is what shows up in export filenames, so keep it short.
          </li>
          <li>
            <strong class="font-medium">Build the outcome tree.</strong> Everything else
            aligns to it, and coverage is measured against it. You can start with three
            outcomes and grow it.
          </li>
          <li>
            <strong class="font-medium">Add a collection.</strong> A quiz, an exam, an item
            bank, a discussion set — they are all the same thing with a different kind.
          </li>
          <li>
            <strong class="font-medium">Write items.</strong> Pick a kind, type the question,
            set the key. Everything accepts Markdown.
          </li>
          <li>
            <strong class="font-medium">Align each item</strong> to the outcomes it actually
            assesses, with the <span class="font-mono text-xs">+ Align</span> button at the
            bottom of the card.
          </li>
          <li>
            <strong class="font-medium">Check Coverage</strong> to see which outcomes nothing
            reaches yet.
          </li>
          <li>
            <strong class="font-medium">Export.</strong> Do this on day one and keep doing it.
            See <a class="text-accent underline" href="#bundle">Export, import and backup</a>.
          </li>
        </ol>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="saving" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Saving, and where your work lives</h2>
        <p class="max-w-prose text-sm text-text-muted">
          There is no save button. Typing saves itself about half a second after you
          stop, and the small dot in the sidebar is the only thing that tells you it
          worked — so it is worth knowing what it says.
        </p>
        <dl class="flex max-w-prose flex-col gap-1.5 text-sm">
          <div class="flex gap-3">
            <dt class="w-28 shrink-0 font-mono text-xs text-text-muted">No changes</dt>
            <dd class="text-text-muted">Nothing is waiting to be written.</dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-28 shrink-0 font-mono text-xs text-text-muted">Saving…</dt>
            <dd class="text-text-muted">An edit is queued or in flight.</dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-28 shrink-0 font-mono text-xs text-text-muted">Saved</dt>
            <dd class="text-text-muted">
              The write finished. This appears after storage confirms it, never before.
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-28 shrink-0 font-mono text-xs text-danger">Not saved</dt>
            <dd class="text-text-muted">
              A write failed, and the reason is printed underneath. It stays put rather
              than fading. Export immediately and reload.
            </dd>
          </div>
        </dl>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">The data is in this browser and nowhere
          else.</strong> There is no server and no account. On first run Drawbridge asks the
          browser to mark its storage permanent; if the browser refuses, the banner on
          the home screen says so plainly, and that means a browser short of disk space
          is entitled to clear a term's work without warning. Exporting is the whole
          defence.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="outcomes" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Outcomes</h2>
        <p class="max-w-prose text-sm text-text-muted">
          A tree of whatever depth you build. Each outcome has a code — the thing items
          align to, like <span class="font-mono text-xs">EO1.1</span> — the text of the
          outcome itself, and optional notes.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          The tier labels down the left (<em>Course Outcome</em>, <em>Evidence Outcome</em>
          and so on) come from Settings and are names for each depth. They are labels
          only: nothing stops you nesting five levels deep, and the tree does not have to
          be the same depth everywhere.
        </p>
        <p class="max-w-prose text-sm text-text-muted">The tree is keyboard-driven:</p>
        <ul class="flex max-w-prose list-disc flex-col gap-1 ps-5 text-sm text-text-muted">
          <li><span class="font-mono text-xs text-text">Enter</span> adds a sibling below.</li>
          <li>
            <span class="font-mono text-xs text-text">Alt</span> +
            <span class="font-mono text-xs text-text">↑</span> /
            <span class="font-mono text-xs text-text">↓</span> moves an outcome among its siblings.
          </li>
          <li>
            <span class="font-mono text-xs text-text">Alt</span> +
            <span class="font-mono text-xs text-text">←</span> /
            <span class="font-mono text-xs text-text">→</span> changes its level. Indenting makes
            it a child of the outcome above; outdenting promotes it, and its own children come
            with it.
          </li>
        </ul>
        <p class="max-w-prose text-sm text-text-muted">
          Deleting an outcome deletes everything beneath it, and the confirmation says how
          many. Items aligned to a deleted outcome keep the reference; the notes panel
          reports it as pointing at something that is gone.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="collections" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Collections and sections</h2>
        <p class="max-w-prose text-sm text-text-muted">
          There is one container in Drawbridge, and its <em>kind</em> is the only thing that
          makes an item bank different from an exam. Kinds come from Settings, so you can add
          your own.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">An item belongs to exactly one collection.</strong>
          There is no shared pool, and there is no way to move an item to another collection —
          the <strong class="font-medium text-text">Duplicate</strong> button in an item's
          header copies it where it is. That is the intended shape rather than a gap: two
          copies are meant to diverge.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">Sections</strong> are optional headings —
          “Part I — Descriptive statistics”. Items outside every section come first, then each
          section in order. Removing a section keeps its items and moves them back to the top.
          Every item card has a section picker once at least one section exists.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">Declared points</strong> is what you say the
          collection is worth. It is never used to change anything — it is cross-checked
          against the computed total, and a mismatch shows up in the notes panel.
          <strong class="font-medium text-text">Instructions</strong> are what a student is
          told before starting, and they travel into the Markdown export;
          <strong class="font-medium text-text">Description</strong> is for you.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="kinds" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">The eight item kinds</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Changing an item's kind with the dropdown in its header never deletes anything you
          wrote. Turn a choice item into an essay and its options stay on the record, out of
          sight; the notes panel mentions them rather than throwing them away. Turn it back
          and they are still there.
        </p>
        <dl class="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
          {#each kinds as entry (entry.kind)}
            <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
              <dt class="w-32 shrink-0 font-mono text-xs text-accent">{entry.kind}</dt>
              <dd class="min-w-0 text-sm">
                <span class="font-medium text-text">{entry.blurb}</span>
                <span class="text-text-muted"> {entry.detail}</span>
              </dd>
            </div>
          {/each}
        </dl>
        <p class="max-w-prose text-sm text-text-muted">
          Every kind except <span class="font-mono text-xs">stimulus</span> also has a
          rationale (why the key is the key), feedback shown whatever the answer, a status, a
          points field and outcome alignment. Every text field takes Markdown — tables, lists,
          code — and has a Preview toggle.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="points" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">How points are worked out</h2>
        <p class="max-w-prose text-sm text-text-muted">
          In order. The first rule that applies wins.
        </p>
        <ol class="flex max-w-prose list-decimal flex-col gap-2 ps-5 text-sm text-text-muted">
          <li>
            <strong class="font-medium text-text">A stimulus is worth nothing</strong>, always.
            It is a passage, not a question.
          </li>
          <li>
            <strong class="font-medium text-text">A number you typed wins</strong> over
            anything Drawbridge could work out, including an attached rubric's total. The card
            says so when the two disagree.
          </li>
          <li>
            <strong class="font-medium text-text">A rubric-scored item is worth the rubric
            total</strong>, shown as “up to N pt” because a rubric is a ceiling.
          </li>
          <li>
            <strong class="font-medium text-text">A group is worth the sum of its parts.</strong>
          </li>
          <li>
            Otherwise it is <strong class="font-medium text-text">not stated</strong> — which
            is not the same as zero. Clearing the points field means you have not said yet;
            typing <span class="font-mono text-xs">0</span> means it is worth nothing. The
            collection total treats them the same way, but the notes panel does not.
          </li>
        </ol>
        <p class="max-w-prose text-sm text-text-muted">
          A collection is worth the sum of its top-level items — parts are already counted
          inside their group — unless the collection itself has a rubric, in which case the
          rubric scores the whole thing and the items are structure rather than score.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Anywhere you see <strong class="font-medium text-text">“up to”</strong>, the number
          is a ceiling rather than a fixed value: something in there is rubric-scored.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="rubrics" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Rubrics</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Unlike items, <strong class="font-medium text-text">rubrics are shared</strong>. A
          discussion participation rubric gets attached to every week's prompt, and editing it
          changes all of them at once. Worth remembering before tweaking a level's points.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">A criterion is worth its best level, never the
          sum of its levels.</strong> The levels are alternatives — a response is Exemplary
          <em>or</em> Proficient. A rubric's total is the sum of its criteria maxima. This is
          the single thing people most often read as a bug.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Levels are ordered best-first. Descriptors go in the grid, one cell per criterion ×
          level, and can be left blank — the list screen tells you how many cells are written.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">A criterion can be worth more than the one
          below it.</strong> The number in a column heading is that level's default. Under
          each descriptor is a points box for that one cell: leave it empty and the cell is
          worth what the column says — the box shows that number greyed out, labelled
          <em>pt (column)</em> — or type a number and the cell is worth that instead, labelled
          <em>pt (set here)</em>. So Thesis can run 10 / 7 / 4 / 0 on the same grid where
          Mechanics still runs 4 / 3 / 2 / 1. The line under each criterion's title says what
          that row is worth, and the total at the top adds those up.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Clearing that box is not the same as typing <code class="text-text">0</code>. Empty
          means “worth what the column says”; 0 means “worth nothing at this level”, which is
          usually what you want in a <em>Not evident</em> column.
        </p>
        <p
          class="max-w-prose rounded-md border border-border-subtle bg-surface-raised px-3 py-2
                 text-sm text-text-muted"
        >
          <strong class="font-medium text-warning">Changing a rubric's levels is the most
          destructive thing in the app.</strong> Descriptors and per-cell points both belong to
          the level they were written under, so swapping a four-point scale for a two-point one
          leaves two columns of work with nowhere to go. Drawbridge counts both — “nowhere for
          4 descriptors and 2 points overrides to go” — and asks <em>before</em> anything
          changes, then carries them across by position, so swapping one four-point scale for a
          differently-named four-point scale keeps what you wrote for “best”, “second best” and
          so on, and what each of those was worth.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Level sets in Settings are starting points. A rubric always owns its own copy of its
          levels, so editing a rubric never reaches back into the set, and editing the set
          never reaches into rubrics already built from it.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          A criterion can be aligned to outcomes of its own. Those count towards coverage,
          which is how a task assessed entirely by one rubric shows up as covering anything at
          all.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="review" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Coverage and the notes panel</h2>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">Coverage</strong> is outcome × collection. Each
          cell shows how many items reach that outcome and how many points they carry.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          An item aligned to three outcomes contributes its <em>full</em> points to each of
          them, not a third each. The question the table answers is how much assessment touches
          an outcome, not how to divide a mark — so row totals can add up to more than the
          course is worth. That is expected.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Only a <strong class="font-medium text-text">leaf</strong> outcome with no coverage
          counts as a gap. A parent is reached through its children and reads “via children”
          rather than being flagged. The dashboard's “N of M assessed” counts leaves for the
          same reason.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          The numbers hold still while you read them: the screen takes one reading when you
          arrive rather than updating under you. Come back after an edit, or press
          <span class="font-mono text-xs">Refresh</span>, to re-read.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">The notes panel never blocks anything.</strong>
          It appears on the dashboard, on each collection and on the outcome tree, and it
          reports things to fix, things to check and suggestions. Nothing in it prevents a
          save, closes a view or rewrites what you wrote — an item with no key yet is normal
          for weeks. On the dashboard, where the panel covers the whole course, each note is a
          link to the screen that can fix it.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="settings" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Setting a course up</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Almost every list of words in Drawbridge is yours to edit, per course, in Settings. A
          new course starts with sensible defaults and none of them are special to the code —
          rename, reorder or delete any of them.
        </p>
        <dl class="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Outcome tiers</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              A name per depth of the tree, outermost first. Labels only. There is also an
              optional code pattern — a regular expression that flags codes drifting from your
              house style, and only flags them.
            </dd>
          </div>
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Statuses</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              The workflow an item or collection moves through — drafted, reviewed, ready,
              retired by default. Ordered, and each can have a colour.
            </dd>
          </div>
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Collection kinds</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              The only thing distinguishing a bank from an exam. Add your own freely.
            </dd>
          </div>
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Rubric level sets</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              Reusable scales, best-first, used as a starting point when building a grid.
            </dd>
          </div>
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Tag dimensions</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              Free axes for classifying items — difficulty, Bloom's level, where it came from.
              Each has its own list of values.
            </dd>
          </div>
          <div class="flex flex-col gap-1 bg-surface px-4 py-3 sm:flex-row sm:gap-4">
            <dt class="w-40 shrink-0 text-sm font-medium">Custom fields</dt>
            <dd class="min-w-0 text-sm text-text-muted">
              Extra fields on items, collections, outcomes or rubrics: text, long text, a
              number, a date, a yes/no, or a choice of one or several from a list you write.
              This is the extension seam — anything Drawbridge does not recognise is carried
              through export and import untouched.
            </dd>
          </div>
        </dl>
        <p class="max-w-prose text-sm text-text-muted">
          Deleting a course deletes everything in it and asks you to type the course code
          first. There is no undo and no trash. Export before you do it.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="bundle" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Export, import and backup</h2>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">Export</strong> — on the dashboard — writes a
          <span class="font-mono text-xs">drawbridge-&lt;code&gt;-&lt;date&gt;.zip</span> to
          your downloads. It is an ordinary zip of ordinary text, with a README inside
          explaining its own layout. There is no lock-in and nothing to install to read it.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          The bundle holds the course twice over. The <strong class="font-medium text-text">JSON
          is the real thing</strong> and the only part import reads. Beside it are readable
          views for humans and spreadsheets: each collection as a Markdown document with its
          questions, key and rationale; each rubric as a criteria × levels table; the outcome
          tree as a nested list; and <span class="font-mono text-xs">items.csv</span> and
          <span class="font-mono text-xs">coverage.csv</span>. Questions are numbered the same
          way throughout, so question 4 in the document is row
          <span class="font-mono text-xs">4.</span> in the CSV.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          A collection can also be exported on its own, from the bottom of its screen. That one
          is marked partial and does <em>not</em> count as a backup — sending a colleague one
          quiz has not protected the rest of the term.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          <strong class="font-medium text-text">Import</strong> — on the home screen — takes a
          bundle either way round:
        </p>
        <ul class="flex max-w-prose list-disc flex-col gap-1.5 ps-5 text-sm text-text-muted">
          <li>
            <strong class="font-medium text-text">A new course</strong> rewrites every id, so
            the import can sit alongside the course it came from.
          </li>
          <li>
            <strong class="font-medium text-text">Merged into the matching course</strong>
            matches on id and then on code, and writes over what it finds. This is how you
            restore a backup or move work between machines.
          </li>
        </ul>
        <p class="max-w-prose text-sm text-text-muted">
          A damaged file costs you that file and nothing else — import reports the problem
          per-file and loads everything it could read. The only fatal case is a bundle with no
          course record in it, and it says so.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          The dashboard says how long it has been since you last exported, and treats a course
          that has never been exported as the urgent case. That timer lives in this browser, so
          restoring a backup does not make it think you have just exported.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="offline" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">Installing and working offline</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Drawbridge is a web page that installs like an app. When your browser offers, an
          <span class="font-mono text-xs">Install</span> card appears in the corner; taking it
          gives you a window of its own and an entry in the launcher. Declining is remembered,
          and it is only ever an offer — everything works the same in a tab.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Once it has been opened on a machine, it works with <strong
            class="font-medium text-text">no network at all</strong
          >: open it, author, save, export, all offline. Your data was never travelling over
          the network anyway — it has always been in this browser.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          When a new version has been published, a card says so and waits.
          <strong class="font-medium text-text">Nothing reloads until you say so</strong>, and
          accepting writes out anything still being saved before it does. “Not yet” keeps the
          version you are on; the offer comes back next time you open the app.
        </p>
        <p class="max-w-prose text-sm text-text-muted">
          Installing does not copy anything anywhere. Each browser profile — work laptop, home
          machine — holds its own separate courses. Moving work between them means exporting a
          bundle and importing it.
        </p>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <section id="missing" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold tracking-tight">What is deliberately not here</h2>
        <p class="max-w-prose text-sm text-text-muted">
          Worth knowing before you go looking, and worth knowing before you click delete.
        </p>
        <ul class="flex max-w-prose list-disc flex-col gap-1.5 ps-5 text-sm text-text-muted">
          <li>
            <strong class="font-medium text-text">No undo.</strong> Deleting an item, an
            outcome, a criterion or a course is final, and each one asks first. Text fields have
            their own undo while the cursor is in them; nothing else does.
          </li>
          <li>
            <strong class="font-medium text-text">No command palette</strong>, and no shortcuts
            outside the outcome tree.
          </li>
          <li>
            <strong class="font-medium text-text">No way to move an item between
            collections.</strong> Duplicate makes an independent copy in the same collection.
          </li>
          <li>
            <strong class="font-medium text-text">No grading, no students, no delivery.</strong>
            Drawbridge never administers an assessment and never marks one. There are no
            submissions, scores or rosters anywhere in it, including in an export.
          </li>
          <li>
            <strong class="font-medium text-text">No Word export, no LMS formats.</strong> What
            leaves is zip, JSON, Markdown and CSV.
          </li>
          <li>
            <strong class="font-medium text-text">No sync and no cloud.</strong> Two machines
            means two sets of courses and a bundle carried between them.
          </li>
        </ul>
      </section>
    </div>
  </div>
</main>
