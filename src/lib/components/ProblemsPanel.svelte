<script lang="ts">
  import { countBySeverity, sortIssues, type Issue } from '$lib/domain/validate';

  interface Props {
    issues: Issue[];
    /** Optional resolver so a row can be named rather than shown as a bare id. */
    labelFor?: (issue: Issue) => string | undefined;
  }

  let { issues, labelFor }: Props = $props();

  const counts = $derived(countBySeverity(issues));
  const sorted = $derived(sortIssues(issues));
  let open = $state(false);

  /*
    Nothing here blocks anything. These are notes on work in progress — an outcome with
    no text yet is the normal state of an outcome five seconds after it is created —
    so the panel starts collapsed and reports a count rather than shouting a list.
  */
</script>

{#if issues.length > 0}
  <div class="rounded-lg border border-border-subtle bg-surface">
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onclick={() => (open = !open)}
      aria-expanded={open}
    >
      <span class="flex items-center gap-3 text-sm">
        <span class="font-medium text-text">Notes on this tree</span>
        <span class="flex items-center gap-2 text-xs text-text-muted">
          {#if counts.error}<span class="text-danger">{counts.error} to fix</span>{/if}
          {#if counts.warning}<span class="text-warning">{counts.warning} to check</span>{/if}
          {#if counts.info}<span>{counts.info} suggestion{counts.info === 1 ? '' : 's'}</span>{/if}
        </span>
      </span>
      <span aria-hidden="true" class="text-text-muted">{open ? '▾' : '▸'}</span>
    </button>

    {#if open}
      <ul class="flex flex-col gap-1 border-t border-border-subtle px-4 py-3">
        {#each sorted as issue (issue.id)}
          <li class="flex items-start gap-2 text-xs">
            <span
              class="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              class:bg-danger={issue.severity === 'error'}
              class:bg-warning={issue.severity === 'warning'}
              class:bg-border-strong={issue.severity === 'info'}
            ></span>
            <span class="text-text-muted">
              {#if labelFor?.(issue)}
                <span class="font-mono text-text">{labelFor(issue)}</span>
              {/if}
              {issue.message}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
