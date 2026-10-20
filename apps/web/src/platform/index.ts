/**
 * The platform's public surface: the only module under platform/ the
 * interface may import (checked by apps/web/src/boundary.test.ts). The
 * interface gets a GameHost, the install prompt, feedback and types; it never
 * sees the sim, the Worker or storage.
 */
import { wrap } from 'comlink';
import type { GameEngine } from './engine.ts';
import { createInstallPrompt, type InstallPrompt } from './install.ts';
import { LocalHost, type ActiveSlot, type GameHost } from './localHost.ts';
import { IndexedDbSaveStore } from './saves.ts';

export type { GameUpdate } from './engine.ts';
export type { InstallPrompt, InstallState } from './install.ts';
export { createFeedback, type Cue, type Feedback, type Prefs } from './feedback.ts';
export type { GameHost } from './localHost.ts';

const ACTIVE_KEY = 'snacks-active-slot';

/** The slot being played, in localStorage; private mode just forgets it. */
const activeSlot: ActiveSlot = {
  get: () => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  },
  set: (slot) => {
    try {
      localStorage.setItem(ACTIVE_KEY, slot);
    } catch {
      // Private mode or full storage: the app reopens on today's daily.
    }
  },
};

/** Starts the sim in a Web Worker and returns the Host for the interface. */
export function createHost(): GameHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return new LocalHost({ engine: wrap<GameEngine>(worker), store: new IndexedDbSaveStore(), active: activeSlot });
}

let install: InstallPrompt | null = null;
/** The install prompt, listening from the first call (call it at app start). */
export function installPrompt(): InstallPrompt {
  install ??= createInstallPrompt();
  return install;
}
