<script lang="ts">
  import type { SaveStatus } from '$lib/stores/autosave.svelte';

  /*
    Typed against what it reads rather than against `Autosave<T>`. The class is generic
    in the value it writes, and that type parameter sits in a function argument, so
    `Autosave<Vault>` is not assignable to `Autosave<unknown>` — an indicator that only
    ever reads two fields should not have to care.
  */
  interface Props {
    saver: { status: SaveStatus; error: string | null };
  }

  let { saver }: Props = $props();

  /*
    There is no save button in this app, so this is the only thing telling the user
    whether their work reached disk. It says "Saved" strictly after a write resolved,
    and an error stays put rather than fading — a failure that disappears on its own is
    worse than no indicator at all.
  */
  const label = $derived(
    {
      idle: 'No changes',
      pending: 'Saving…',
      saving: 'Saving…',
      saved: 'Saved',
      error: 'Not saved'
    }[saver.status]
  );

  const tone = $derived(
    saver.status === 'error' ? 'text-danger' : saver.status === 'saved' ? 'text-success' : 'text-text-muted'
  );
</script>

<div class="flex items-center gap-1.5 text-xs {tone}" role="status" aria-live="polite">
  <span
    class="inline-block h-1.5 w-1.5 rounded-full"
    class:bg-success={saver.status === 'saved'}
    class:bg-danger={saver.status === 'error'}
    class:bg-warning={saver.status === 'pending' || saver.status === 'saving'}
    class:bg-border-strong={saver.status === 'idle'}
  ></span>
  <span>{label}</span>
</div>

{#if saver.status === 'error' && saver.error}
  <p class="text-xs text-danger">{saver.error}</p>
{/if}
