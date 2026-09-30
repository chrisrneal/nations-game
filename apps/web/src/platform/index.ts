/**
 * The platform's public surface: the only module under platform/ the
 * interface may import (checked by apps/web/src/boundary.test.ts). The
 * interface gets a GameHost, the install prompt and types; it never sees the
 * sim, the AI, the Worker or storage.
 */
import { proxy, wrap } from 'comlink';
import type { GameEngine } from './engine.ts';
import { createInstallPrompt, type InstallPrompt } from './install.ts';
import { LocalHost, type GameHost } from './localHost.ts';
import { IndexedDbSaveStore } from './saves.ts';

export type { GameUpdate, LiveClock, PlayerView, Standing } from './engine.ts';
export type { ExplanationNote, JournalSnapshot, TradeLine, TrustCauses } from './journal.ts';
export type { PendingPrediction, PredictionKind, PredictionsView, ResolvedPrediction } from './predictions.ts';
export type { AwayRecap, RankedLine } from './recap.ts';
export type { PlaytestAgain, PlaytestAnswers, PlaytestWho } from './playtest.ts';
export type { InstallPrompt, InstallState } from './install.ts';
export type { SlotSummary } from './saves.ts';
export { AUTOSAVE_SLOT, FILE_FORMAT, MANUAL_SLOTS, type GameHost } from './localHost.ts';
export { LIVE_POLL_MS, PACE_INTERVAL_MS } from './pace.ts';

/** Starts the sim in a Web Worker and returns the Host for the interface. */
export function createHost(): GameHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const host = new LocalHost({
    engine: wrap<GameEngine>(worker),
    store: new IndexedDbSaveStore(),
    wrapListener: (listener) => proxy(listener),
  });
  // Closing from the app switcher gives no other warning: save and remember what the player saw.
  // On return, a live game catches up by wall time and writes the away recap.
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
