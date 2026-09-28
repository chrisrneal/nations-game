/**
 * The platform's public surface: the only module under platform/ the
 * interface may import (checked by apps/web/src/boundary.test.ts). The
 * interface gets a GameHost and types; it never sees the sim, the AI, the
 * Worker or storage.
 */
import { proxy, wrap } from 'comlink';
import type { GameEngine } from './engine.ts';
import { LocalHost, type GameHost } from './localHost.ts';
import { IndexedDbSaveStore } from './saves.ts';

export type { GameUpdate, PlayerView, Standing } from './engine.ts';
export type { SlotSummary } from './saves.ts';
export { AUTOSAVE_SLOT, FILE_FORMAT, MANUAL_SLOTS, type GameHost } from './localHost.ts';
export { PACE_INTERVAL_MS } from './pace.ts';

/** Starts the sim in a Web Worker and returns the Host for the interface. */
export function createHost(): GameHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const host = new LocalHost({
    engine: wrap<GameEngine>(worker),
    store: new IndexedDbSaveStore(),
    wrapListener: (listener) => proxy(listener),
  });
  // Save when the phone hides the app: closing from the app switcher gives no other warning.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void host.autosave();
  });
  return host;
}
