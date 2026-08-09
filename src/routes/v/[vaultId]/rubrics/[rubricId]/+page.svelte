<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { criterionMax, rubricTotal } from '$lib/domain/points';
  import { descriptorCoverage, levelsFromSet, matchingLevelSet } from '$lib/domain/rubrics';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { rubrics } from '$lib/stores/rubrics.svelte';
  import { outcomes } from '$lib/stores/outcomes.svelte';
  import { count } from '$lib/text';
  import Button from '$lib/components/ui/Button.svelte';
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
  const total = $derived(rubric ? rubricTotal(rubric) : 0);
  const coverage = $derived(rubric ? descriptorCoverage(rubric) : { written: 0, total: 0 });
  const levelSets = $derived(vault?.config.levelSets ?? []);
  const currentSet = $derived(rubric ? matchingLevelSet(rubric, levelSets) : undefined);

  function switchLevelSet(setId: string) {
    const set = levelSets.find((entry) => entry.id === setId);
    if (!set || !rubric) return;

    const levels = levelsFromSet(set);
    const dropped = rubrics.wouldDrop(levels);

    /*
      Asked BEFORE anything changes, not reported afterwards. Descriptors are keyed by
      level id, so shrinking a scale genuinely discards writing — and this is the one
      action in the app that can lose a lot of it at once.
    */
    if (dropped > 0) {
      const ok = confirm(
        `Switching to "${set.name}" leaves nowhere for ${count(dropped, 'descriptor')} to go, ` +
          `and they will be discarded. Continue?`
      );
      if (!ok) return;
    }
    rubrics.replaceLevels(levels);
  }

  async function removeRubric() {
    if (!rubric) return;
    if (
      !confirm(
        `Delete "${rubric.title || 'this rubric'}"? Anything scored by it will be left ` +
          `pointing at a rubric that no longer exists.`
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
        </span>
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
                      aria-label="Level points"
                    />
                    <span class="text-[10px] text-text-muted">pt</span>
                    <button
                      type="button"
                      class="ml-auto cursor-pointer rounded px-1 text-[11px] text-text-muted
                             hover:text-text disabled:opacity-30"
                      title="Move left"
                      aria-label="Move level left"
                      disabled={rubric.levels[0]?.id === level.id}
                      onclick={() => rubrics.moveLevel(level.id, -1)}>←</button
                    >
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-[11px] text-text-muted
                             hover:text-text disabled:opacity-30"
                      title="Move right"
                      aria-label="Move level right"
                      disabled={rubric.levels[rubric.levels.length - 1]?.id === level.id}
                      onclick={() => rubrics.moveLevel(level.id, 1)}>→</button
                    >
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-[11px] text-text-muted hover:text-danger"
                      title="Remove level"
                      aria-label="Remove level"
                      onclick={() => {
                        if (confirm('Remove this level and everything written in its column?'))
                          rubrics.removeLevel(level.id);
                      }}>✕</button
                    >
                  </div>
                </div>
              </th>
            {/each}
            <th class="w-10 border-l border-border-subtle p-2 align-bottom">
              <button
                type="button"
                class="cursor-pointer rounded border border-dashed border-border-subtle px-1.5
                       py-1 text-xs text-text-muted hover:border-border-strong hover:text-text"
                title="Add level"
                aria-label="Add level"
                onclick={() => rubrics.addLevel()}>+</button
              >
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
                  <p class="text-[11px] text-text-muted">
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

                  <div class="flex items-center gap-0.5">
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-[11px] text-text-muted
                             hover:text-text disabled:opacity-30"
                      aria-label="Move criterion up"
                      disabled={index === 0}
                      onclick={() => rubrics.moveCriterion(criterion.id, -1)}>↑</button
                    >
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-[11px] text-text-muted
                             hover:text-text disabled:opacity-30"
                      aria-label="Move criterion down"
                      disabled={index === orderedCriteria.length - 1}
                      onclick={() => rubrics.moveCriterion(criterion.id, 1)}>↓</button
                    >
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-[11px] text-text-muted hover:text-danger"
                      aria-label="Remove criterion"
                      onclick={() => {
                        if (confirm('Remove this criterion and its row?'))
                          rubrics.removeCriterion(criterion.id);
                      }}>✕</button
                    >
                  </div>
                </div>
              </td>

              {#each rubric.levels as level (level.id)}
                <td class="border-l border-border-subtle p-2">
                  <textarea
                    class={cell}
                    rows="4"
                    value={criterion.descriptors[level.id] ?? ''}
                    oninput={(event) =>
                      rubrics.setDescriptor(criterion.id, level.id, event.currentTarget.value)}
                    placeholder="What this looks like"
                    aria-label="{criterion.title || 'Criterion'} at {level.name || 'level'}"
                  ></textarea>
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

    <div class="flex flex-wrap items-center gap-3">
      <Button size="sm" onclick={() => rubrics.addCriterion()}>+ Criterion</Button>
      <Button size="sm" variant="danger" onclick={removeRubric}>Delete rubric</Button>
    </div>
  </div>
{:else}
  <p class="text-sm text-text-muted">Opening…</p>
{/if}
