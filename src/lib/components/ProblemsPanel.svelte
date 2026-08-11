<script lang="ts">
  import { untrack } from 'svelte';
  import { countBySeverity, sortIssues, type Issue } from '$lib/domain/validate';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { FOCUS_RING } from '$lib/components/ui/styles';

  interface Props {
    issues: Issue[];
    /** What the panel is reporting on, e.g. "this tree", "this collection". */
    subject?: string;
    /** Optional resolver so a row can be named rather than shown as a bare id. */
    labelFor?: (issue: Issue) => string | undefined;
    /** Where to go to fix it. Rows become links when this returns a path. */
    hrefFor?: (issue: Issue) => string | null;
    /** Open on first render, for a screen whose whole purpose is the list. */
    startOpen?: boolean;
  }

  let { issues, subject = 'this vault', labelFor, hrefFor, startOpen = false }: Props = $props();

  const counts = $derived(countBySeverity(issues));
  const sorted = $derived(sortIssues(issues));

  /*
    Nothing here blocks anything. These are notes on work in progress — an outcome with
    no text yet is the normal state of an outcome five seconds after it is created —
    so the panel reports a count rather than shouting a list, and defaults to closed.

    `startOpen` seeds the state and then stops mattering: once the panel is on screen
    the user owns whether it is open. `untrack` is what says that on purpose — without
    it Svelte rightly warns that a prop is being captured once, since that is usually a
    mistake rather than the intent.
  */
  let open = $state(untrack(() => startOpen));
</script>

{#if issues.length > 0}
  <div class="rounded-lg border border-border-subtle bg-surface">
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left
             {FOCUS_RING}"
      onclick={() => (open = !open)}
      aria-expanded={open}
    >
      <span class="flex items-center gap-3 text-sm">
        <span class="font-medium text-text">Notes on {subject}</span>
        <span class="flex items-center gap-2 text-xs text-text-muted">
          {#if counts.error}<span class="text-danger">{counts.error} to fix</span>{/if}
          {#if counts.warning}<span class="text-warning">{counts.warning} to check</span>{/if}
          {#if counts.info}<span>{counts.info} suggestion{counts.info === 1 ? '' : 's'}</span>{/if}
        </span>
      </span>
      <Icon name={open ? 'chevron-down' : 'chevron-right'} class="text-text-muted" />
    </button>

    {#if open}
      <ul class="flex flex-col gap-1 border-t border-border-subtle px-4 py-3">
        {#each sorted as issue (issue.id)}
          {@const href = hrefFor?.(issue) ?? null}
          <li class="flex items-start gap-2 text-xs">
            <span
              class="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              class:bg-danger={issue.severity === 'error'}
              class:bg-warning={issue.severity === 'warning'}
              class:bg-border-strong={issue.severity === 'info'}
            ></span>
            <!--
              A problem you cannot get to is only half reported, so a row links to the
              screen that can fix it wherever one can be resolved.
            -->
            <svelte:element
              this={href ? 'a' : 'span'}
              {href}
              class="text-text-muted {href
                ? 'rounded underline-offset-2 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent'
                : ''}"
            >
              {#if labelFor?.(issue)}
                <span class="font-mono text-text">{labelFor(issue)}</span>
              {/if}
              {issue.message}
            </svelte:element>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
