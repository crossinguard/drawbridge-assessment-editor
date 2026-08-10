<script lang="ts">
  import { pwa } from '$lib/stores/pwa.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  /*
    The three things the browser can tell us about this app being an app, in the one
    place they can appear without moving anything.

    Fixed to a corner rather than in the flow, because all three arrive at a moment
    nobody chose — mid-sentence, quite possibly — and a banner that pushes the item
    you are editing down the page is worse than the news it carries. Nothing here is
    a modal: an update that blocked the screen until answered would be exactly the
    interruption `registerType: 'prompt'` exists to avoid.
  */
</script>

{#if pwa.updateReady || pwa.installable || pwa.offlineReady || pwa.registrationError}
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4
           sm:inset-x-auto sm:right-0"
  >
    {#if pwa.updateReady}
      <div
        class="pointer-events-auto w-full max-w-sm rounded-md border border-border-strong
               bg-surface-raised p-3 shadow-lg"
        role="status"
      >
        <p class="text-sm font-medium text-text">A new version of Drawbridge is ready.</p>
        <p class="mt-1 text-xs text-text-muted">
          Reloading writes out anything still being saved first. Your courses are not
          touched either way.
        </p>
        <div class="mt-2.5 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={pwa.applying}
            onclick={() => pwa.applyUpdate()}
          >
            {pwa.applying ? 'Saving, then reloading…' : 'Reload now'}
          </Button>
          <Button size="sm" disabled={pwa.applying} onclick={() => pwa.dismissUpdate()}>
            Not yet
          </Button>
        </div>
      </div>
    {/if}

    {#if pwa.installable}
      <div
        class="pointer-events-auto w-full max-w-sm rounded-md border border-border-subtle
               bg-surface-raised p-3 shadow-lg"
      >
        <p class="text-sm font-medium text-text">Install Drawbridge</p>
        <p class="mt-1 text-xs text-text-muted">
          Opens in its own window and works with no network. The data stays exactly where
          it is — in this browser profile.
        </p>
        <div class="mt-2.5 flex items-center gap-2">
          <Button variant="primary" size="sm" onclick={() => pwa.install()}>Install</Button>
          <Button size="sm" onclick={() => pwa.dismissInstall()}>No thanks</Button>
        </div>
      </div>
    {/if}

    {#if pwa.registrationError}
      <div
        class="pointer-events-auto w-full max-w-sm rounded-md border border-border-subtle
               bg-surface-raised p-3 shadow-lg"
        role="status"
      >
        <p class="text-sm text-text">
          <span class="font-medium text-warning">Offline support is not set up.</span>
          Drawbridge needs a network connection to open in this browser until this is
          fixed. Your work is still saved locally.
        </p>
        <p class="mt-1 font-mono text-xs break-words text-text-muted">
          {pwa.registrationError}
        </p>
      </div>
    {/if}

    {#if pwa.offlineReady}
      <div
        class="pointer-events-auto w-full max-w-sm rounded-md border border-border-subtle
               bg-surface-raised p-3 shadow-lg"
        role="status"
      >
        <p class="text-sm text-text">
          <span class="font-medium">Ready to work offline.</span>
          Drawbridge is cached in this browser and will open with no network.
        </p>
        <div class="mt-2.5">
          <Button size="sm" onclick={() => pwa.dismissOfflineReady()}>Good</Button>
        </div>
      </div>
    {/if}
  </div>
{/if}
