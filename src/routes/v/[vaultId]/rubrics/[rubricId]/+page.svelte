<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { criterionMax, pointsAt, rubricTotal } from '$lib/domain/points';
  import {
    descriptorCoverage,
    effectiveCriteria,
    levelsFromSet,
    matchingLevelSet,
    rubricsAppending
  } from '$lib/domain/rubrics';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { rubrics } from '$lib/stores/rubrics.svelte';
  import { outcomes } from '$lib/stores/outcomes.svelte';
  import { count } from '$lib/text';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import SaveIndicator from '$lib/components/SaveIndicator.svelte';
  import OutcomePicker from '$lib/components/items/OutcomePicker.svelte';

  const vaultId = $derived(page.params.vaultId ?? '');
  const rubricId = $derived(page.params.rubricId ?? '');
  const vault = $derived(activeVault.draft);
  const rubric = $derived(rubrics.open);

  $effect(() => {
    void rubrics.load(vaultId);
    void rubrics.openRubric(rubricId);
  });
  $effect(() => {
    void outcomes.load(vaultId);
  });

  onMount(() => {
    const flush = () => void rubrics.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  });

  const orderedCriteria = $derived([...(rubric?.criteria ?? [])].sort((a, b) => a.order - b.order));
  const rubricsById = $derived(rubrics.byId);
  const total = $derived(rubric ? rubricTotal(rubric, { rubricsById }) : 0);
  const coverage = $derived(rubric ? descriptorCoverage(rubric) : { written: 0, total: 0 });
  const levelSets = $derived(vault?.config.levelSets ?? []);
  const currentSet = $derived(rubric ? matchingLevelSet(rubric, levelSets) : undefined);

  /*
    The tails, grouped by the rubric that owns them, each drawn as its own sub-table.

    Not merged into the grid above, because a tail is scored against ITS OWN levels — a
    2-point complete/incomplete tail on this 6-point rubric adds 2, not 6 — so one set
    of column headings could not honestly cover both. Read-only here for the same
    reason the domain refuses it: these rows belong to another record, and every other
    rubric appending it would change too.
  */
  const tails = $derived.by(() => {
    if (!rubric) return [];
    const grouped: { source: (typeof rubrics.items)[number]; criteria: typeof orderedCriteria }[] = [];
    for (const entry of effectiveCriteria(rubric, rubricsById)) {
      if (!entry.inherited) continue;
      const existing = grouped.find((tail) => tail.source.id === entry.source.id);
      if (existing) existing.criteria.push(entry.criterion);
      else grouped.push({ source: entry.source, criteria: [entry.criterion] });
    }
    return grouped;
  });

  const inheritedCount = $derived(tails.reduce((n, tail) => n + tail.criteria.length, 0));

  /** Rubrics this one could append: anything but itself and what it already appends. */
  const available = $derived(
    rubrics.items.filter(
      (entry) => entry.id !== rubric?.id && !(rubric?.appends ?? []).includes(entry.id)
    )
  );

  /** Missing appends still have to be visible, or a dangling one is unremovable. */
  const appended = $derived(
    (rubric?.appends ?? []).map((id) => ({ id, source: rubricsById.get(id) }))
  );

  function switchLevelSet(setId: string) {
    const set = levelSets.find((entry) => entry.id === setId);
    if (!set || !rubric) return;

    const levels = levelsFromSet(set);
    const dropped = rubrics.wouldDrop(levels);

    /*
      Asked BEFORE anything changes, not reported afterwards. Descriptors and points
      overrides are both keyed by level id, so shrinking a scale genuinely discards
      work — and this is the one action in the app that can lose a lot of it at once.

      The two are named separately because they read differently: losing a descriptor
      is losing writing you can see is gone, whereas losing an override just makes the
      total quietly smaller.
    */
    const losses = [
      dropped.descriptors > 0 ? count(dropped.descriptors, 'descriptor') : '',
      dropped.points === 0
        ? ''
        : dropped.points === 1
          ? 'a points override'
          : `${dropped.points} points overrides`
    ].filter((part) => part !== '');

    if (losses.length > 0) {
      const ok = confirm(
        `Switching to "${set.name}" leaves nowhere for ${losses.join(' and ')} to go, ` +
          `and they will be discarded. Continue?`
      );
      if (!ok) return;
    }
    rubrics.replaceLevels(levels);
  }

  async function removeRubric() {
    if (!rubric) return;

    // Deleting a rubric that others append quietly shortens their grids and lowers
    // their totals, and nothing on those screens would say why. So it goes in the
    // question, not in a note afterwards.
    const usedBy = rubricsAppending(rubric.id, rubrics.items);
    const tailWarning =
      usedBy.length === 0
        ? ''
        : ` ${count(usedBy.length, 'rubric')} appends it as a tail (${usedBy
            .map((entry) => `"${entry.title || 'untitled'}"`)
            .join(', ')}), and will lose those criteria and their points.`;

    if (
      !confirm(
        `Delete "${rubric.title || 'this rubric'}"? Anything scored by it will be left ` +
          `pointing at a rubric that no longer exists.${tailWarning}`
      )
    )
      return;
    await rubrics.remove(rubric.id);
    await goto(`/v/${vaultId}/rubrics`);
  }

  const cell =
    'w-full resize-y rounded border border-border-subtle bg-surface px-2 py-1 text-xs ' +
    'text-text placeholder:text-text-muted focus:border-border-strong focus:outline-2 ' +
    'focus:outline-accent';
</script>

<svelte:head><title>{rubric?.title ?? 'Rubric'} — Drawbridge</title></svelte:head>

{#if rubric}
  <div class="mx-auto flex max-w-5xl flex-col gap-4">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/v/{vaultId}/rubrics"
          class="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          ← Rubrics
        </a>
        <SaveIndicator saver={rubrics.saver} />
      </div>

      <input
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xl
               font-semibold tracking-tight hover:border-border-subtle focus:border-border-strong
               focus:bg-surface focus:outline-2 focus:outline-accent"
        bind:value={rubric.title}
        oninput={() => rubrics.queueSave()}
        aria-label="Rubric title"
      />

      <textarea
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm
               text-text-muted hover:border-border-subtle focus:border-border-strong
               focus:bg-surface focus:outline-2 focus:outline-accent"
        rows="1"
        bind:value={rubric.description}
        oninput={() => rubrics.queueSave()}
        placeholder="What this rubric is for"
        aria-label="Rubric description"
      ></textarea>

      <div class="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <!--
          "Worth up to" and the arithmetic spelled out, because this is the number
          people get wrong: a criterion is worth its BEST level, and the total is the
          sum of those maxima — not the sum of every level in the grid.
        -->
        <span class="text-text">Worth up to {total} pt</span>
        <span>·</span>
        <span>
          {count(orderedCriteria.length, 'criterion', 'criteria')}, each worth its best level
          {#if inheritedCount > 0}
            · plus {count(inheritedCount, 'inherited criterion', 'inherited criteria')}
          {/if}
        </span>
        <span>·</span>
        <span>A column's points are its default; any cell can set its own</span>
        {#if coverage.total > 0}
          <span>·</span>
          <span class={coverage.written < coverage.total ? 'text-warning' : ''}>
            {coverage.written} of {coverage.total} cells written
          </span>
        {/if}
      </div>

      {#if levelSets.length > 0}
        <label class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          Level set
          <select
            class="rounded border border-border-subtle bg-surface px-2 py-1 text-xs
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            value={currentSet?.id ?? ''}
            onchange={(event) => switchLevelSet(event.currentTarget.value)}
          >
            <option value="">{currentSet ? '' : 'Custom levels'}</option>
            {#each levelSets as set (set.id)}
              <option value={set.id}>{set.name}</option>
            {/each}
          </select>
          <span>Changing this rewrites the columns below.</span>
        </label>
      {/if}
    </header>

    <!-- The grid scrolls on its own; the page never scrolls sideways. -->
    <div class="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
      <table class="w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr class="border-b border-border-subtle">
            <th class="w-56 p-2 align-bottom text-xs font-medium tracking-wide text-text-muted uppercase">
              Criterion
            </th>
            {#each rubric.levels as level (level.id)}
              <th class="min-w-40 border-l border-border-subtle p-2 align-bottom">
                <div class="flex flex-col gap-1">
                  <input
                    class="w-full rounded border border-border-subtle bg-surface px-1.5 py-0.5
                           text-xs font-semibold focus:border-border-strong focus:outline-2
                           focus:outline-accent"
                    bind:value={level.name}
                    oninput={() => rubrics.queueSave()}
                    placeholder="Exemplary"
                    aria-label="Level name"
                  />
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      class="w-14 rounded border border-border-subtle bg-surface px-1.5 py-0.5
                             text-xs focus:border-border-strong focus:outline-2 focus:outline-accent"
                      bind:value={level.points}
                      oninput={() => rubrics.queueSave()}
                      aria-label="Default points for this level"
                    />
                    <span class="text-3xs text-text-muted">pt</span>
                    <IconButton
                      name="left"
                      class="ml-auto"
                      title="Move left"
                      aria-label="Move level left"
                      disabled={rubric.levels[0]?.id === level.id}
                      onclick={() => rubrics.moveLevel(level.id, -1)}
                    />
                    <IconButton
                      name="right"
                      title="Move right"
                      aria-label="Move level right"
                      disabled={rubric.levels[rubric.levels.length - 1]?.id === level.id}
                      onclick={() => rubrics.moveLevel(level.id, 1)}
                    />
                    <IconButton
                      name="close"
                      tone="danger"
                      title="Remove level"
                      aria-label="Remove level"
                      onclick={() => {
                        if (confirm('Remove this level and everything written in its column?'))
                          rubrics.removeLevel(level.id);
                      }}
                    />
                  </div>
                </div>
              </th>
            {/each}
            <th class="w-10 border-l border-border-subtle p-2 align-bottom">
              <IconButton
                name="plus"
                title="Add level"
                aria-label="Add level"
                onclick={() => rubrics.addLevel()}
              />
            </th>
          </tr>
        </thead>

        <tbody>
          {#each orderedCriteria as criterion, index (criterion.id)}
            <tr class="border-b border-border-subtle align-top last:border-b-0">
              <td class="p-2">
                <div class="flex flex-col gap-1.5">
                  <input
                    class="w-full rounded border border-border-subtle bg-surface px-1.5 py-1
                           text-sm font-medium focus:border-border-strong focus:outline-2
                           focus:outline-accent"
                    bind:value={criterion.title}
                    oninput={() => rubrics.queueSave()}
                    placeholder="Clarity"
                    aria-label="Criterion title"
                  />
                  <p class="text-2xs text-text-muted">
                    worth up to {criterionMax(criterion, rubric.levels)} pt
                  </p>

                  <OutcomePicker
                    selected={criterion.outcomeIds}
                    outcomes={outcomes.items}
                    onchange={(next) => {
                      criterion.outcomeIds = next;
                      rubrics.queueSave();
                    }}
                  />

                  <div class="flex items-center gap-1">
                    <IconButton
                      name="up"
                      title="Move up"
                      aria-label="Move criterion up"
                      disabled={index === 0}
                      onclick={() => rubrics.moveCriterion(criterion.id, -1)}
                    />
                    <IconButton
                      name="down"
                      title="Move down"
                      aria-label="Move criterion down"
                      disabled={index === orderedCriteria.length - 1}
                      onclick={() => rubrics.moveCriterion(criterion.id, 1)}
                    />
                    <IconButton
                      name="close"
                      tone="danger"
                      title="Remove criterion"
                      aria-label="Remove criterion"
                      onclick={() => {
                        if (confirm('Remove this criterion and its row?'))
                          rubrics.removeCriterion(criterion.id);
                      }}
                    />
                  </div>
                </div>
              </td>

              {#each rubric.levels as level (level.id)}
                <td class="border-l border-border-subtle p-2">
                  <div class="flex flex-col gap-1">
                    <textarea
                      class={cell}
                      rows="4"
                      value={criterion.descriptors[level.id] ?? ''}
                      oninput={(event) =>
                        rubrics.setDescriptor(criterion.id, level.id, event.currentTarget.value)}
                      placeholder="What this looks like"
                      aria-label="{criterion.title || 'Criterion'} at {level.name || 'level'}"
                    ></textarea>

                    <div class="flex items-center gap-1">
                      <!--
                        Empty means "worth what the column says", which is why the
                        placeholder shows that number rather than 0. Clearing the field
                        DELETES the override; typing 0 pins the cell to nothing. Those
                        are different, and a "Not evident" column wants the second.
                      -->
                      <input
                        type="number"
                        step="any"
                        class="w-14 rounded border border-border-subtle bg-surface px-1.5 py-0.5
                               text-xs focus:border-border-strong focus:outline-2
                               focus:outline-accent"
                        value={criterion.levelPoints[level.id] ?? ''}
                        placeholder={String(level.points)}
                        oninput={(event) => {
                          const raw = event.currentTarget.value.trim();
                          const parsed = Number(raw);
                          rubrics.setLevelPoints(
                            criterion.id,
                            level.id,
                            raw === '' || Number.isNaN(parsed) ? undefined : parsed
                          );
                        }}
                        aria-label="Points for {criterion.title || 'this criterion'} at {level.name ||
                          'this level'}"
                      />
                      <span class="text-3xs text-text-muted">
                        {criterion.levelPoints[level.id] === undefined ? 'pt (column)' : 'pt (set here)'}
                      </span>
                    </div>
                  </div>
                </td>
              {/each}
              <td class="border-l border-border-subtle"></td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if orderedCriteria.length === 0}
        <p class="px-4 py-6 text-sm text-text-muted">
          No criteria yet. Add one to start the grid.
        </p>
      {/if}
    </div>

    <!--
      Each tail as its own table, with its own headings and read-only cells. The grid
      above and the ones below are scored against different levels, so drawing them as
      one table would put two sets of points under one set of column headings. Showing
      the seam is also the honest report: half these rows are somebody else's.
    -->
    {#each tails as tail (tail.source.id)}
      <section class="flex flex-col gap-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-sm font-medium">
            Appended from
            <a
              href="/v/{vaultId}/rubrics/{tail.source.id}"
              class="underline underline-offset-2 hover:text-accent"
            >
              {tail.source.title || 'Untitled'}
            </a>
          </h2>
          <p class="text-xs text-text-muted">
            Shared — edited on its own screen, and scored against its levels, not this
            rubric's. Changing it changes every rubric that appends it.
          </p>
        </div>

        <div class="overflow-x-auto rounded-lg border border-dashed border-border-subtle bg-surface-raised">
          <table class="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr class="border-b border-border-subtle">
                <th class="w-56 p-2 align-bottom text-xs font-medium tracking-wide text-text-muted uppercase">
                  Criterion
                </th>
                {#each tail.source.levels as level (level.id)}
                  <th class="min-w-40 border-l border-border-subtle p-2 align-bottom">
                    <span class="block text-xs font-semibold">{level.name || 'Level'}</span>
                    <span class="text-3xs text-text-muted">{level.points} pt default</span>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each tail.criteria as criterion (criterion.id)}
                <tr class="border-b border-border-subtle align-top last:border-b-0">
                  <td class="p-2">
                    <p class="text-sm font-medium">{criterion.title || 'Untitled'}</p>
                    <p class="text-2xs text-text-muted">
                      worth up to {criterionMax(criterion, tail.source.levels)} pt
                    </p>
                  </td>
                  {#each tail.source.levels as level (level.id)}
                    <td class="border-l border-border-subtle p-2">
                      <p class="text-xs whitespace-pre-line text-text-muted">
                        {criterion.descriptors[level.id] ?? '—'}
                      </p>
                      {#if criterion.levelPoints[level.id] !== undefined}
                        <p class="mt-1 text-3xs text-text-muted">
                          {pointsAt(criterion, level)} pt
                        </p>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {:else}
                <tr>
                  <td class="px-4 py-3 text-sm text-text-muted" colspan={tail.source.levels.length + 1}>
                    That rubric has no criteria yet, so it adds nothing.
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/each}

    <section class="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-4">
      <h2 class="text-sm font-medium">Shared tails</h2>
      <p class="max-w-prose text-xs text-text-muted">
        Criteria from another rubric, appended after this one's own. Write the
        professionalism boilerplate once, append it everywhere, and edit it in one place.
      </p>

      {#if appended.length > 0}
        <ul class="flex flex-col gap-1">
          {#each appended as entry (entry.id)}
            <li class="flex items-center gap-2 text-sm">
              {#if entry.source}
                <a
                  href="/v/{vaultId}/rubrics/{entry.source.id}"
                  class="underline underline-offset-2 hover:text-accent"
                >
                  {entry.source.title || 'Untitled'}
                </a>
                <span class="text-xs text-text-muted">
                  {count(entry.source.criteria.length, 'criterion', 'criteria')} ·
                  worth up to {rubricTotal(entry.source, { rubricsById })} pt
                </span>
              {:else}
                <!-- Still listed, or a dangling append could never be removed. -->
                <span class="text-sm text-danger">A rubric that no longer exists</span>
              {/if}
              <IconButton
                name="close"
                tone="danger"
                class="ml-auto"
                title="Remove tail"
                aria-label="Stop appending {entry.source?.title || 'this rubric'}"
                onclick={() => rubrics.removeAppend(entry.id)}
              />
            </li>
          {/each}
        </ul>
      {/if}

      {#if available.length > 0}
        <label class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          Append a rubric
          <select
            class="rounded border border-border-subtle bg-surface px-2 py-1 text-xs
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            value=""
            onchange={(event) => {
              const id = event.currentTarget.value;
              event.currentTarget.value = '';
              if (id) rubrics.appendRubric(id);
            }}
          >
            <option value="">Choose a rubric…</option>
            {#each available as entry (entry.id)}
              <option value={entry.id}>{entry.title || 'Untitled'}</option>
            {/each}
          </select>
        </label>
      {:else if appended.length === 0}
        <p class="text-xs text-text-muted">
          Nothing to append yet — a tail is just another rubric, so make one first.
        </p>
      {/if}
    </section>

    <div class="flex flex-wrap items-center gap-3">
      <Button size="sm" onclick={() => rubrics.addCriterion()}>+ Criterion</Button>
      <Button size="sm" variant="danger" onclick={removeRubric}>Delete rubric</Button>
    </div>
  </div>
{:else}
  <p class="text-sm text-text-muted">Opening…</p>
{/if}
