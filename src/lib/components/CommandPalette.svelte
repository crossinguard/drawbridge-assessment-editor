<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { flattenItems } from '$lib/domain/points';
  import { rank, segments, type Candidate } from '$lib/search';
  import { backup } from '$lib/stores/backup.svelte';
  import { review } from '$lib/stores/review.svelte';
  import { undo } from '$lib/stores/undo.svelte';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { FOCUS_RING } from './ui/styles';

  /*
    Everything in the course, reachable by typing.

    The accessibility here is not decoration, and it is why this was the last stage
    built rather than the first: a palette done casually is a div that steals the
    keyboard and tells a screen reader nothing. This one is the combobox pattern —
    focus never leaves the input, the active row is named by `aria-activedescendant`,
    Escape closes, and focus goes back where it came from.

    The list is gathered from `review.snapshot`, which is one whole-vault read that
    already exists for coverage and the notes panel. Refreshed each time the palette
    opens: a snapshot that held still would offer a collection deleted a minute ago.
  */

  interface Props {
    vaultId: string;
  }

  let { vaultId }: Props = $props();

  type Action = { href: string } | { run: () => void | Promise<void> };

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let dialog = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  /* Where focus was before the palette took it. Restored on close, always. */
  let returnTo: HTMLElement | null = null;

  const snapshot = $derived(review.snapshot);

  /* A plain function, not a `$derived`: it is called from inside one, so the config it
     reads is tracked there, where the result is actually used. */
  function kindLabel(key: string): string {
    const kinds = activeVault.draft?.config.collectionKinds ?? [];
    return kinds.find((entry) => entry.key === key)?.label ?? key;
  }

  /** The one line of a stem worth showing in a list. */
  function firstLine(stem: string, fallback: string): string {
    const line = (stem.trim().split('\n')[0] ?? '').replace(/[#*_`>]/g, '').trim();
    return line === '' ? fallback : line;
  }

  const navigation: Candidate<Action>[] = $derived(
    [
      ['', 'Dashboard'],
      ['/outcomes', 'Outcomes'],
      ['/collections', 'Collections'],
      ['/rubrics', 'Rubrics'],
      ['/coverage', 'Coverage'],
      ['/changes', 'Changes'],
      ['/settings', 'Settings']
    ].map(([suffix, label]) => ({
      id: `nav:${suffix}`,
      label: label ?? '',
      group: 'Go to',
      value: { href: `/v/${vaultId}${suffix}` }
    }))
  );

  /*
    Commands are the things that are NOT a destination. Deliberately few: everything
    else in this app is a screen, and a palette entry that duplicates a button is one
    more place for the two to disagree. The undo pair name what they would undo,
    because "Undo" on its own is a question rather than an offer.
  */
  const commands: Candidate<Action>[] = $derived.by(() => {
    const out: Candidate<Action>[] = [
      {
        id: 'cmd:export',
        label: 'Export this course as a bundle',
        detail: 'Downloads a zip you can import anywhere',
        group: 'Do',
        value: { run: () => backup.exportVault(vaultId) }
      },
      {
        id: 'cmd:guide',
        label: 'Open the guide',
        group: 'Do',
        value: { href: '/help' }
      }
    ];

    const undoable = undo.nextUndo(vaultId);
    if (undoable) {
      out.unshift({
        id: 'cmd:undo',
        label: `Undo “${undoable.label}”`,
        group: 'Do',
        value: { run: async () => void (await undo.undoLast(vaultId)) }
      });
    }

    const redoable = undo.nextRedo(vaultId);
    if (redoable) {
      out.push({
        id: 'cmd:redo',
        label: `Redo “${redoable.label}”`,
        group: 'Do',
        value: { run: async () => void (await undo.redoLast(vaultId)) }
      });
    }
    return out;
  });

  const content: Candidate<Action>[] = $derived.by(() => {
    if (!snapshot) return [];
    const titles = new Map(snapshot.collections.map((entry) => [entry.id, entry.title]));

    return [
      ...snapshot.collections.map((collection) => ({
        id: `collection:${collection.id}`,
        label: collection.title || 'Untitled collection',
        detail: kindLabel(collection.kind),
        group: 'Collection',
        value: { href: `/v/${vaultId}/c/${collection.id}` }
      })),
      /*
        Flattened, so a part inside a group is reachable on its own terms. It lands on
        the collection screen rather than on the part — there is no deep link to a
        single question, and inventing one for the palette would be a second way of
        addressing an item for the rest of the app to keep in step with.
      */
      ...flattenItems(snapshot.items).map((item) => ({
        id: `item:${item.id}`,
        label: firstLine(item.stem, `Untitled ${item.kind}`),
        detail: titles.get(item.collectionId) ?? '',
        group: 'Question',
        value: { href: `/v/${vaultId}/c/${item.collectionId}` }
      })),
      ...snapshot.rubrics.map((rubric) => ({
        id: `rubric:${rubric.id}`,
        label: rubric.title || 'Untitled rubric',
        group: 'Rubric',
        value: { href: `/v/${vaultId}/rubrics/${rubric.id}` }
      })),
      /*
        Code AND text in the label, because both are how an outcome gets referred to —
        "EO1.2" when you are aligning an item and "describe spread" when you are not.
      */
      ...snapshot.outcomes.map((outcome) => ({
        id: `outcome:${outcome.id}`,
        label: [outcome.code, outcome.text].filter(Boolean).join(' — ') || 'Untitled outcome',
        group: 'Outcome',
        value: { href: `/v/${vaultId}/outcomes` }
      }))
    ];
  });

  const candidates = $derived([...commands, ...navigation, ...content]);
  const matches = $derived(rank(query, candidates));

  /*
    Clamped rather than reset. Typing narrows the list under an active row that may no
    longer exist, and jumping the selection back to the top on every keystroke makes
    arrowing down and then refining the query impossible.
  */
  $effect(() => {
    const ceiling = Math.max(matches.length - 1, 0);
    // `active` is read untracked, so this runs when the LIST changes and not when the
    // selection does. Tracking it too would have the effect re-run on its own write.
    if (untrack(() => active) > ceiling) active = ceiling;
  });

  /* Keeps the active row on screen. Reads the index and the node, nothing else. */
  $effect(() => {
    const index = active;
    const node = list?.querySelector(`#palette-option-${index}`);
    node?.scrollIntoView({ block: 'nearest' });
  });

  export async function show(): Promise<void> {
    if (open) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open = true;
    query = '';
    active = 0;
    await tick();
    input?.focus();
    // After the paint, not before it: the palette has to be usable while this read
    // finishes, and it is a whole-vault read.
    await review.refresh(vaultId);
  }

  function close(): void {
    if (!open) return;
    open = false;
    // Back where it came from, even if that element has since gone — in which case the
    // browser falls back to the body, which is still better than leaving focus in a
    // dialog that is no longer rendered.
    returnTo?.focus();
    returnTo = null;
  }

  async function choose(index: number): Promise<void> {
    const chosen = matches[index]?.candidate.value;
    if (!chosen) return;
    close();
    if ('href' in chosen) await goto(chosen.href);
    else await chosen.run();
  }

  /**
   * Keeps Tab inside the dialog.
   *
   * There are only ever two tabbable things in here — the input and the close button —
   * so this is a two-element cycle rather than a general trap. Queried each time rather
   * than cached, because the close button is the kind of thing a later edit removes.
   */
  function trap(event: KeyboardEvent): void {
    const focusable = [...(dialog?.querySelectorAll<HTMLElement>('input, button') ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      trap(event);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (matches.length > 0) active = (active + 1) % matches.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (matches.length > 0) active = (active - 1 + matches.length) % matches.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      active = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      active = Math.max(matches.length - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void choose(active);
    }
  }
</script>

{#if open}
  <!--
    The backdrop is a plain element with a click handler, not a button: it has no
    accessible name worth giving and nothing keyboard-reachable belongs behind the
    dialog. Escape is the keyboard equivalent, and it is on the dialog itself.

    NO `onkeydown` here, and that is not an omission. Focus is trapped inside the
    dialog, so every key already bubbles THROUGH it — a handler here as well ran the
    same keystroke twice, and one press of ArrowDown moved the selection two rows.
    It reads as a twitchy trackpad rather than a bug, which is how it survived to a
    browser check.
  -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[10vh]"
    onclick={close}
    role="presentation"
  >
    <div
      bind:this={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Search this course"
      class="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border
             border-border-strong bg-surface shadow-2xl"
      onclick={(event) => event.stopPropagation()}
      onkeydown={onKeydown}
      tabindex="-1"
    >
      <div class="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <!--
          `role="combobox"` with the listbox named by `aria-controls`, and the active row
          named by `aria-activedescendant`. Focus stays here throughout — moving it into
          the list would take the typing with it.

          All three of those attributes go away together when there are no matches: the
          listbox is not rendered then, and an `aria-controls` pointing at an id that is
          not in the document is a dangling reference that assistive technology has no
          way to resolve. Announcing "expanded" over nothing is the same mistake.
        -->
        <input
          bind:this={input}
          bind:value={query}
          type="text"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={matches.length > 0 ? 'palette-list' : undefined}
          aria-activedescendant={matches.length > 0 ? `palette-option-${active}` : undefined}
          aria-label="Search this course"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search collections, questions, rubrics, outcomes…"
          class="min-w-0 grow bg-transparent px-1 py-1 text-sm text-text outline-none
                 placeholder:text-text-muted"
        />
        <button
          type="button"
          onclick={close}
          class="shrink-0 rounded-md px-2 py-1 text-xs text-text-muted transition-colors
                 hover:bg-surface-raised hover:text-text {FOCUS_RING}"
        >
          Esc
        </button>
      </div>

      <!--
        The count, announced. A combobox tells a screen reader which row is active but
        nothing about how many there are, so "no matches" would otherwise be silence.
      -->
      <p class="sr-only" role="status" aria-live="polite">
        {matches.length === 1 ? '1 result' : `${matches.length} results`}
      </p>

      {#if matches.length === 0}
        <p class="px-4 py-6 text-sm text-text-muted">
          {review.status === 'loading' && query === ''
            ? 'Reading the course…'
            : `Nothing matches “${query}”.`}
        </p>
      {:else}
        <ul
          bind:this={list}
          id="palette-list"
          role="listbox"
          aria-label="Results"
          class="min-h-0 grow overflow-y-auto py-1"
        >
          {#each matches as match, index (match.candidate.id)}
            {@const selected = index === active}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id="palette-option-{index}"
              role="option"
              aria-selected={selected}
              class="flex cursor-pointer items-baseline gap-3 px-3 py-2 text-sm
                     {selected ? 'bg-surface-raised' : ''}"
              onclick={() => void choose(index)}
              onmousemove={() => (active = index)}
            >
              <span class="min-w-0 grow truncate text-text">
                {#each segments(match.candidate.label, match.matched) as part}
                  {#if part.hit}<mark
                      class="bg-transparent font-semibold text-accent">{part.text}</mark
                    >{:else}{part.text}{/if}
                {/each}
              </span>
              {#if match.candidate.detail}
                <span class="hidden max-w-[40%] shrink-0 truncate text-xs text-text-muted sm:block">
                  {match.candidate.detail}
                </span>
              {/if}
              <span class="shrink-0 text-xs text-text-muted">{match.candidate.group}</span>
            </li>
          {/each}
        </ul>
      {/if}

      <p
        class="flex flex-wrap gap-x-3 border-t border-border-subtle px-3 py-1.5 text-xs
               text-text-muted"
      >
        <span><span class="font-mono">↑↓</span> move</span>
        <span><span class="font-mono">Enter</span> open</span>
        <span><span class="font-mono">Esc</span> close</span>
      </p>
    </div>
  </div>
{/if}
