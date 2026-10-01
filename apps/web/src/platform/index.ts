/**
 * The platform's public surface: the only module under platform/ the
 * interface may import (checked by apps/web/src/boundary.test.ts). The
 * interface gets an AirportHost, the install prompt and types; it never sees
 * the sim, the Worker or storage.
 */
import { proxy, wrap } from 'comlink';
import type { AirportEngine } from './engine.ts';
import { createInstallPrompt, type InstallPrompt } from './install.ts';
import { LocalHost, type AirportHost } from './localHost.ts';
import { IndexedDbSaveStore } from './saves.ts';

export type { AirportUpdate, AwayRecap } from './engine.ts';
export type { InstallPrompt, InstallState } from './install.ts';
export { createFeedback, type Cue, type Feedback, type Prefs } from './feedback.ts';
export { AUTOSAVE_SLOT, FILE_FORMAT, type AirportHost } from './localHost.ts';

/** Starts the sim in a Web Worker and returns the Host for the interface. */
export function createHost(): AirportHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const host = new LocalHost({
    engine: wrap<AirportEngine>(worker),
    store: new IndexedDbSaveStore(),
    wrapListener: (listener) => proxy(listener),
  });
  // Closing from the app switcher gives no other warning: save on hide, catch up on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void host.away();
    else void host.back();
  });
  return host;
}

let install: InstallPrompt | null = null;
/** The install prompt, listening from the first call (call it at app start). */
export function installPrompt(): InstallPrompt {
  install ??= createInstallPrompt();
  return install;
}
