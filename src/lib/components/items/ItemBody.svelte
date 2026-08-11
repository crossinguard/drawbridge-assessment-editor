<script lang="ts">
  import type { Item, Outcome, Rubric } from '$lib/domain/schema';
  import { describePoints, itemPoints, type ScoringContext } from '$lib/domain/points';
  import { usesExpected, usesOptions } from '$lib/domain/items';
  import MarkdownField from '$lib/components/ui/MarkdownField.svelte';
  import OptionsEditor from './OptionsEditor.svelte';
  import OutcomePicker from './OutcomePicker.svelte';
  import DiscussionSpecEditor from './DiscussionSpecEditor.svelte';
  import { CONTROL, LABEL } from '$lib/components/ui/styles';

  interface Props {
    item: Item;
    outcomes: readonly Outcome[];
    rubrics: readonly Rubric[];
    /** Stimulus items in the same collection, for the "reads from" picker. */
    stimuli: readonly Item[];
    scoring: ScoringContext;
    onedit: () => void;
  }

  let { item, outcomes, rubrics, stimuli, scoring, onedit }: Props = $props();

  const points = $derived(itemPoints(item, scoring));

  /*
    A stimulus is a passage, not a question: it is never answered, so the answer
    machinery is hidden rather than shown empty. Everything else stays visible even
    where it is unusual — a rubric-scored short answer is odd but not wrong, and
    hiding a field the model accepts would make the editor and the model disagree.
  */
  const isStimulus = $derived(item.kind === 'stimulus');
  const isGroup = $derived(item.kind === 'group');

  let stemField = $state<ReturnType<typeof MarkdownField> | null>(null);

  /** Lets ItemCard put the caret in the stem without knowing what the stem is made of. */
  export function focusStem(): void {
    stemField?.focus();
  }
</script>

<MarkdownField
  bind:this={stemField}
  bind:value={item.stem}
  label={isStimulus ? 'Passage' : isGroup ? 'Shared instructions' : 'Stem'}
  hideLabel={!isStimulus && !isGroup}
  rows={isStimulus ? 6 : 3}
  placeholder={isStimulus
    ? 'The passage, data table or figure the questions refer to. Markdown works.'
    : isGroup
      ? 'What applies to every part below'
      : 'The question. Markdown works — tables, lists, code.'}
  oninput={onedit}
/>

{#if isStimulus}
  <p class="text-xs text-text-muted">
    A stimulus is not answered, so it carries no points. Point other items at it with
    their “Reads from” picker.
  </p>
{/if}

{#if usesOptions(item.kind)}
  <OptionsEditor {item} onedit={onedit} />
{/if}

{#if usesExpected(item.kind)}
  <MarkdownField
    bind:value={item.expected}
    label={item.kind === 'essay' ? 'Model answer' : 'Expected answer'}
    rows={item.kind === 'essay' ? 4 : 2}
    placeholder={item.kind === 'essay' ? 'What a strong response covers' : '25'}
    oninput={onedit}
  />

  {#if item.kind === 'shortAnswer'}
    <label class="flex flex-col gap-1">
      <span class={LABEL}>Also accept</span>
      <input
        class="rounded border border-border-subtle bg-surface px-2 py-1 text-sm
               focus:border-border-strong focus:outline-2 focus:outline-accent"
        value={item.accepted.join(', ')}
        oninput={(event) => {
          item.accepted = event.currentTarget.value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
          onedit();
        }}
        placeholder="25.0, twenty-five"
      />
    </label>
  {/if}
{/if}

{#if item.kind === 'discussion'}
  <DiscussionSpecEditor {item} {onedit} />
{/if}

{#if !isStimulus}
  <div class="grid gap-3 sm:grid-cols-2">
    <MarkdownField
      bind:value={item.rationale}
      label="Rationale"
      rows={2}
      placeholder={isGroup ? 'Notes for yourself about this set' : 'Why the key is the key'}
      oninput={onedit}
    />
    <MarkdownField
      bind:value={item.feedback}
      label="Feedback"
      rows={2}
      placeholder="Shown whatever they answered"
      oninput={onedit}
    />
  </div>

  <div class="flex flex-wrap items-center gap-4">
    <!--
      Offered on every scorable kind. points.ts resolves a rubric on anything that
      carries one, so hiding the field would make the model and the editor disagree.
    -->
    <label class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <span class="font-medium tracking-wide uppercase">Rubric</span>
      <select
        class={CONTROL}
        value={item.rubricId ?? ''}
        onchange={(event) => {
          const next = event.currentTarget.value;
          if (next) item.rubricId = next;
          else delete item.rubricId;
          onedit();
        }}
        aria-label="Rubric"
      >
        <option value="">None</option>
        {#each rubrics as rubric (rubric.id)}
          <option value={rubric.id}>{rubric.title || 'Untitled'}</option>
        {/each}
      </select>
      {#if item.rubricId && item.points === undefined}
        <span>Scored by the rubric — {describePoints(points)}.</span>
      {:else if item.rubricId}
        <span class="text-warning">The points above override the rubric total.</span>
      {/if}
    </label>

    {#if stimuli.length > 0}
      <label class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span class="font-medium tracking-wide uppercase">Reads from</span>
        <select
          class={CONTROL}
          value={item.stimulusId ?? ''}
          onchange={(event) => {
            const next = event.currentTarget.value;
            if (next) item.stimulusId = next;
            else delete item.stimulusId;
            onedit();
          }}
          aria-label="Stimulus"
        >
          <option value="">Nothing</option>
          {#each stimuli as stimulus (stimulus.id)}
            <option value={stimulus.id}>
              {stimulus.stem.slice(0, 50) || 'Untitled passage'}
            </option>
          {/each}
        </select>
      </label>
    {/if}
  </div>
{/if}

<OutcomePicker
  selected={item.outcomeIds}
  {outcomes}
  onchange={(next) => {
    item.outcomeIds = next;
    onedit();
  }}
/>
