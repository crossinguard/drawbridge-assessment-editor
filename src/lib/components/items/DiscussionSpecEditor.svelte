<script lang="ts">
  import type { Item } from '$lib/domain/schema';

  interface Props {
    item: Item;
    onedit: () => void;
  }

  let { item, onedit }: Props = $props();

  /*
    The spec is optional on the schema, so it is created on first edit rather than
    written into every discussion item that has not been configured yet. That keeps an
    untouched item's record honestly empty — and keeps `item.discussion === undefined`
    meaningful, which is what validate.ts checks to say "no posting requirements set".
  */
  function ensure() {
    item.discussion ??= { initialPost: {}, replies: {} };
    return item.discussion;
  }

  function setInitial(field: 'dueNote' | 'requirements', value: string) {
    const spec = ensure();
    if (value) spec.initialPost[field] = value;
    else delete spec.initialPost[field];
    onedit();
  }

  function setReplies(field: 'dueNote' | 'requirements', value: string) {
    const spec = ensure();
    if (value) spec.replies[field] = value;
    else delete spec.replies[field];
    onedit();
  }

  /** Blank means "not stated", which is different from zero. */
  function setNumber(where: 'initialPost' | 'replies', field: 'minWords' | 'count', raw: string) {
    const spec = ensure();
    const target = spec[where] as Record<string, unknown>;
    if (raw === '') delete target[field];
    else target[field] = Number(raw);
    onedit();
  }

  const spec = $derived(item.discussion);

  const text =
    'w-full rounded border border-border-subtle bg-surface px-2 py-1 text-sm text-text ' +
    'placeholder:text-text-muted focus:border-border-strong focus:outline-2 focus:outline-accent';
  const num = 'w-20 ' + text;
  const legend = 'text-xs font-medium tracking-wide text-text-muted uppercase';
</script>

<div class="grid gap-3 rounded-md border border-border-subtle bg-surface-raised p-3 sm:grid-cols-2">
  <fieldset class="flex flex-col gap-2">
    <legend class={legend}>Initial post</legend>

    <label class="flex items-center gap-2 text-xs text-text-muted">
      Minimum words
      <input
        type="number"
        min="0"
        class={num}
        value={spec?.initialPost.minWords ?? ''}
        oninput={(event) => setNumber('initialPost', 'minWords', event.currentTarget.value)}
        placeholder="—"
        aria-label="Initial post minimum words"
      />
    </label>

    <input
      class={text}
      value={spec?.initialPost.dueNote ?? ''}
      oninput={(event) => setInitial('dueNote', event.currentTarget.value)}
      placeholder="Due by Wednesday 23:59"
      aria-label="Initial post due note"
    />

    <textarea
      class={text}
      rows="2"
      value={spec?.initialPost.requirements ?? ''}
      oninput={(event) => setInitial('requirements', event.currentTarget.value)}
      placeholder="What the post must do — cite the reading, give an example…"
      aria-label="Initial post requirements"
    ></textarea>
  </fieldset>

  <fieldset class="flex flex-col gap-2">
    <legend class={legend}>Replies</legend>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-xs text-text-muted">
        How many
        <input
          type="number"
          min="0"
          class={num}
          value={spec?.replies.count ?? ''}
          oninput={(event) => setNumber('replies', 'count', event.currentTarget.value)}
          placeholder="—"
          aria-label="Reply count"
        />
      </label>
      <label class="flex items-center gap-2 text-xs text-text-muted">
        Minimum words
        <input
          type="number"
          min="0"
          class={num}
          value={spec?.replies.minWords ?? ''}
          oninput={(event) => setNumber('replies', 'minWords', event.currentTarget.value)}
          placeholder="—"
          aria-label="Reply minimum words"
        />
      </label>
    </div>

    <input
      class={text}
      value={spec?.replies.dueNote ?? ''}
      oninput={(event) => setReplies('dueNote', event.currentTarget.value)}
      placeholder="Due by Sunday 23:59"
      aria-label="Reply due note"
    />

    <textarea
      class={text}
      rows="2"
      value={spec?.replies.requirements ?? ''}
      oninput={(event) => setReplies('requirements', event.currentTarget.value)}
      placeholder="What a reply must do — extend, question, or offer a counter-example"
      aria-label="Reply requirements"
    ></textarea>
  </fieldset>
</div>
