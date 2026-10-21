/**
 * "A new version is ready" (decision record K13). The service worker is set to
 * wait, not to take over: a new deploy installs quietly in the background and
 * this module says so, and the interface offers a button at a calm moment
 * (between waves, the done screen, the menu, the picker). Nothing reloads the
 * page by itself, so an update can never cut a wave short. If nobody taps,
 * the new version simply opens the next time the app is closed and launched.
 */
export type UpdateState = 'none' | 'ready';

export interface Updates {
  state(): UpdateState;
  /** Called whenever the state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: UpdateState) => void): () => void;
  /** Switches to the waiting version: the page reloads on it. Does nothing when none is waiting. */
  apply(): void;
}

export interface RegisterOptions {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
}

/** vite-plugin-pwa's `registerSW`: returns the function that switches versions (reloading when asked to). */
export type Register = (options: RegisterOptions & { immediate: boolean }) => (reload?: boolean) => Promise<void>;

export interface UpdatesEnv {
  /** Where "the app came back to the front" is heard (the window). */
  target?: EventTarget;
  hidden?: () => boolean;
  everyMs?: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function createUpdates(register: Register, env: UpdatesEnv = {}): Updates {
  let state: UpdateState = 'none';
  const listeners = new Set<(state: UpdateState) => void>();
  let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  const target: EventTarget | undefined = env.target ?? (typeof window === 'undefined' ? undefined : window);
  const hidden = env.hidden ?? (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');

  /** Ask the server whether there is a new version. Offline or failing: nothing happens. */
  const look = (): void => {
    if (hidden()) return;
    try {
      void registration?.update().catch(() => undefined);
    } catch {
      // No registration, or the browser refused: try again next time.
    }
  };

  try {
    applyUpdate = register({
      immediate: true,
      onNeedRefresh: () => {
        if (state === 'ready') return;
        state = 'ready';
        for (const listener of listeners) listener(state);
      },
      onRegisteredSW: (_url, r) => {
        registration = r;
      },
    });
  } catch {
    // No service worker here (an old browser, or a private window): the app just runs.
  }
  // A phone app is left open for days: look when it comes back to the front, and once an hour.
  target?.addEventListener('visibilitychange', look);
  setInterval(look, env.everyMs ?? HOUR_MS);

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply() {
      if (state !== 'ready' || applyUpdate === null) return;
      void applyUpdate(true).catch(() => undefined);
    },
  };
}
