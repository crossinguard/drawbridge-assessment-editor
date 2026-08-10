import { Autosave } from './autosave.svelte';

/*
  Installing the app, and taking a new version of it.

  Both are the user's decision here, and deliberately so. This app holds the only copy
  of a term's work in one browser profile, so a service worker that swapped itself in
  mid-edit would be reloading a tab somebody is typing into — which is why
  vite.config.ts sets `registerType: 'prompt'` and why nothing below activates an
  update on its own.
*/

/** Not in lib.dom: Chromium-only, and still not in the standard. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Remembers a dismissed install offer, so it is asked once rather than every load.
 *
 * localStorage rather than anything in the vault: this is a property of this browser,
 * not of the user's courses, and it must not travel inside an export bundle.
 */
const INSTALL_DISMISSED = 'drawbridge:install-dismissed';
/** Whether the "it works offline now" confirmation has already been shown here. */
const OFFLINE_TOLD = 'drawbridge:offline-told';

function remembered(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'yes';
  } catch {
    // A locked-down profile may refuse localStorage. Asking again is the safe failure.
    return false;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, 'yes');
  } catch {
    // Nothing to do. The offer simply reappears next time.
  }
}

class PwaStore {
  /** A new build is downloaded and waiting. It will not activate until asked. */
  updateReady = $state(false);
  /** First install finished: everything needed to run with no network is cached. */
  offlineReady = $state(false);
  /** The browser has offered an install prompt and it has not been used or dismissed. */
  installable = $state(false);
  /** Running as an installed app rather than in a tab. */
  installed = $state(false);
  applying = $state(false);
  /**
   * Set when the service worker could not be registered.
   *
   * Surfaced rather than swallowed. In an app that promises to work with no network,
   * "offline support silently did not happen" is the failure most worth hearing
   * about, and it is exactly the kind that leaves the screen looking completely
   * normal — right up until the day there is no network.
   */
  registrationError = $state<string | null>(null);

  #applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
  #installPrompt: InstallPromptEvent | null = null;

  /**
   * Registers the service worker and starts listening for the two browser events
   * that drive this store. Returns a teardown for the listeners.
   */
  register(): () => void {
    this.installed = isStandalone();

    const onInstallPrompt = (event: Event) => {
      // Without preventDefault the browser shows its own bar, at its own moment,
      // over an editing screen. Holding the event lets the offer sit in a corner
      // until somebody wants it.
      event.preventDefault();
      this.#installPrompt = event as InstallPromptEvent;
      this.installable = !remembered(INSTALL_DISMISSED);
    };

    const onInstalled = () => {
      this.installed = true;
      this.installable = false;
      this.#installPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Imported dynamically because `virtual:pwa-register` only exists once the PWA
    // plugin has run; a static import would put it in every test's module graph too.
    // The catch matters: without it a failed import is an unhandled rejection nobody
    // sees, and the app looks fine while having no offline support at all.
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        this.#applyUpdate = registerSW({
          immediate: true,
          onNeedRefresh: () => {
            this.updateReady = true;
          },
          onOfflineReady: () => {
            this.offlineReady = !remembered(OFFLINE_TOLD);
          },
          onRegisteredSW: (_url, registration) => {
            /*
              `onNeedRefresh` only fires for a worker that reaches `waiting` while
              this page is watching. A build installed during an earlier page load is
              already sitting there when we register, fires nothing, and — because
              nothing here activates an update on its own — would then wait forever:
              the user reloads, sees no prompt, and stays on the old version.

              Asking the registration directly is the whole fix.
            */
            if (registration?.waiting) this.updateReady = true;
          },
          onRegisterError: (cause: unknown) => {
            this.registrationError = describe(cause);
          }
        });
      })
      .catch((cause: unknown) => {
        this.registrationError = describe(cause);
      });

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }

  /**
   * Activates the waiting version and reloads.
   *
   * Everything still sitting in a debounce is written first. The reload would
   * otherwise race the `pagehide` flush, and losing the last sentence somebody typed
   * because they accepted an update is not a trade this app gets to make.
   */
  async applyUpdate(): Promise<void> {
    if (!this.#applyUpdate) return;
    this.applying = true;
    try {
      await Autosave.flushAll();
    } finally {
      // Even if a write failed, the update still has to be able to proceed — the
      // error is on the save indicator, and the new build is not what broke it.
      await this.#applyUpdate(true);
    }
  }

  /** Keeps the current version. The waiting one offers itself again next load. */
  dismissUpdate(): void {
    this.updateReady = false;
  }

  async install(): Promise<void> {
    const prompt = this.#installPrompt;
    if (!prompt) return;
    this.#installPrompt = null;
    this.installable = false;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A declined prompt cannot be re-shown — the event is spent — so treat it as the
    // answer rather than pretending the offer is still open.
    if (outcome === 'dismissed') remember(INSTALL_DISMISSED);
  }

  dismissInstall(): void {
    this.installable = false;
    this.#installPrompt = null;
    remember(INSTALL_DISMISSED);
  }

  dismissOfflineReady(): void {
    this.offlineReady = false;
    remember(OFFLINE_TOLD);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** True when the app was launched from an install rather than opened in a tab. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `navigator.standalone` is the iOS spelling and is not in lib.dom.
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export const pwa = new PwaStore();
