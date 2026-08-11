<script lang="ts">
  import type { Item, ItemKind } from '$lib/domain/schema';
  import { newId } from '$lib/domain/ids';
  import { expectedKeyCount } from '$lib/domain/items';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { LABEL } from '$lib/components/ui/styles';

  interface Props {
    item: Item;
    onedit: () => void;
  }

  let { item, onedit }: Props = $props();

  let showFeedbackFor = $state<string | null>(null);

  const rule = $derived(expectedKeyCount(item.kind));
  const correctCount = $derived(item.options.filter((option) => option.correct).length);

  /*
    A single-answer item uses radios and a multiple-response one uses checkboxes,
    because that is what the shapes mean — and because it makes the difference between
    the two kinds visible without reading a label.

    Marking a key on a single-answer item therefore has to clear the others. Doing that
    here rather than leaving it to validation means the common case is simply correct;
    validation still catches an item that arrived from an import with two keys.
  */
  function setCorrect(optionId: string, correct: boolean, kind: ItemKind) {
    for (const option of item.options) {
      if (option.id === optionId) option.correct = correct;
      else if (correct && (kind === 'choice' || kind === 'trueFalse')) option.correct = false;
    }
    onedit();
  }

  function addOption() {
    item.options = [...item.options, { id: newId(), text: '', correct: false }];
    onedit();
  }

  function removeOption(optionId: string) {
    item.options = item.options.filter((option) => option.id !== optionId);
    onedit();
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= item.options.length) return;
    const next = [...item.options];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    item.options = next;
    onedit();
  }

  const single = $derived(item.kind === 'choice' || item.kind === 'trueFalse');
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-baseline justify-between gap-2">
    <span class={LABEL}>Options</span>
    {#if rule}
      <span
        class="text-2xs {correctCount < rule.min || (rule.max !== null && correctCount > rule.max)
          ? 'text-warning'
          : 'text-text-muted'}"
      >
        {correctCount} marked correct{rule.max === 1
          ? ' · needs exactly one'
          : rule.max === null
            ? ` · needs ${rule.min} or more`
            : ''}
      </span>
    {/if}
  </div>

  <ul class="flex flex-col gap-1">
    {#each item.options as option, index (option.id)}
      <li class="group/opt flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <input
            type={single ? 'radio' : 'checkbox'}
            class="accent-accent"
            name="key-{item.id}"
            checked={option.correct}
            onchange={(event) => setCorrect(option.id, event.currentTarget.checked, item.kind)}
            aria-label="Mark option {index + 1} correct"
          />
          <input
            class="min-w-0 grow rounded border border-border-subtle bg-surface px-2 py-1 text-sm
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            bind:value={option.text}
            oninput={onedit}
            placeholder="Option {index + 1}"
            aria-label="Option {index + 1} text"
            readonly={item.kind === 'trueFalse'}
          />
          <!--
            Revealed on hover or keyboard focus. `focus-within` is what keeps these
            reachable by tab — they are inside the group, so focusing any of them keeps
            the whole cluster visible.
          -->
          <div
            class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity
                   group-hover/opt:opacity-100 group-focus-within/opt:opacity-100"
          >
            <IconButton
              name={option.feedback ? 'comment' : 'plus'}
              title="Per-option feedback"
              aria-label="Feedback for option {index + 1}"
              onclick={() => (showFeedbackFor = showFeedbackFor === option.id ? null : option.id)}
            />
            {#if item.kind !== 'trueFalse'}
              <IconButton
                name="up"
                title="Move up"
                aria-label="Move option {index + 1} up"
                disabled={index === 0}
                onclick={() => move(index, -1)}
              />
              <IconButton
                name="down"
                title="Move down"
                aria-label="Move option {index + 1} down"
                disabled={index === item.options.length - 1}
                onclick={() => move(index, 1)}
              />
              <IconButton
                name="close"
                tone="danger"
                title="Remove option"
                aria-label="Remove option {index + 1}"
                onclick={() => removeOption(option.id)}
              />
            {/if}
          </div>
        </div>

        {#if showFeedbackFor === option.id || option.feedback}
          <input
            class="ml-6 rounded border border-border-subtle bg-surface-raised px-2 py-1 text-xs
                   focus:border-border-strong focus:outline-2 focus:outline-accent"
            bind:value={option.feedback}
            oninput={onedit}
            placeholder="What to say when someone picks this"
            aria-label="Feedback for option {index + 1}"
          />
        {/if}
      </li>
    {/each}
  </ul>

  {#if item.kind !== 'trueFalse'}
    <div>
      <Button size="sm" onclick={addOption}>+ Option</Button>
    </div>
  {/if}
</div>
