/**
 * The platform's public surface: the only module under platform/ the
 * interface may import (checked by apps/web/src/boundary.test.ts). The
 * interface gets a GameHost, the install prompt, feedback and types; it never
 * sees the sim, the Worker or storage.
 */
import { wrap } from 'comlink';
import type { GameEngine } from './engine.ts';
import { createInstallPrompt, type InstallPrompt } from './install.ts';
import { LocalHost, type GameHost, type LegacySlot } from './localHost.ts';
import { IndexedDbSaveStore } from './saves.ts';

export type { GameUpdate } from './localHost.ts';
export type { InstallPrompt, InstallState } from './install.ts';
export { createFeedback, type Cue, type Feedback, type Prefs } from './feedback.ts';
export type { GameHost } from './localHost.ts';

const ACTIVE_KEY = 'snacks-active-slot';

/**
 * Where the slot being played was kept before profiles (K7). The migration
 * reads it once into the first profile and clears it; each profile now keeps
 * its own in the profile book.
 */
const legacyActive: LegacySlot = {
  get: () => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Private mode: there was nothing to clear.
    }
  },
};

/** Starts the sim in a Web Worker and returns the Host for the interface. */
export function createHost(): GameHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return new LocalHost({ engine: wrap<GameEngine>(worker), store: new IndexedDbSaveStore(), legacyActive });
}

let install: InstallPrompt | null = null;
/** The install prompt, listening from the first call (call it at app start). */
export function installPrompt(): InstallPrompt {
  install ??= createInstallPrompt();
  return install;
}
