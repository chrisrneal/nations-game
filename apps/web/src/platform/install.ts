/**
 * The install prompt (prompt 11). Android and desktop Chrome fire
 * `beforeinstallprompt`, which the app keeps and replays when the player taps
 * "Install"; iOS Safari has no such event, so the interface shows the
 * Share -> Add to Home Screen steps instead. Nothing shows once the app runs
 * installed (standalone).
 */
export type InstallState = 'prompt' | 'ios' | 'installed' | 'none';

export interface InstallPrompt {
  state(): InstallState;
  /** Called whenever the state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: InstallState) => void): () => void;
  /** Shows the browser's install dialog, where it has one. */
  prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

interface DeferredPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function standalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Listens from app start: the browser fires the event once, early, and only a kept event can be replayed. */
export function createInstallPrompt(): InstallPrompt {
  let deferred: DeferredPrompt | null = null;
  let installed = standalone();
  const listeners = new Set<(state: InstallState) => void>();
  const state = (): InstallState => (installed ? 'installed' : deferred !== null ? 'prompt' : iosSafari() ? 'ios' : 'none');
  const notify = (): void => {
    for (const listener of listeners) listener(state());
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as DeferredPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async prompt() {
      const event = deferred;
      if (event === null) return 'unavailable';
      deferred = null;
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') installed = true;
      notify();
      return outcome;
    },
  };
}
