import type { Command } from './command.ts';
import type { Event } from './event.ts';
import type { View } from './view.ts';

/**
 * How fast the world runs.
 *
 * Multiplayer need: pace is the host's business, not the sim's (seam 4).
 * Single-player may pause or fast-forward; a shared game runs a fixed cadence
 * and ignores one player's wish to speed up. `live` advances from elapsed real
 * time, including time the app was closed.
 */
export type Pace = 'paused' | 'x1' | 'x4' | 'live';

/** One push from the host: the caller's refreshed View plus events for it. */
export interface HostUpdate {
  readonly view: View;
  readonly events: readonly Event[];
}

/**
 * The only door between the interface and the simulation.
 *
 * Multiplayer need: the UI must not be able to tell whether the sim is in a Web
 * Worker on this phone or on a server three timezones away (seam 3). Everything
 * is async and everything returns a View, so swapping LocalHost for RemoteHost
 * later needs no UI change - and a UI that can only submit commands and read a
 * View cannot accidentally write state.
 */
export interface Host {
  /** Queue intent. Resolves when accepted for a tick, not when it succeeds. */
  submit(command: Command): Promise<void>;
  /** Listen for updates. Returns an unsubscribe function. */
  subscribe(listener: (update: HostUpdate) => void): () => void;
  /** Ask for a pace. The host may refuse, e.g. a fixed-cadence shared game. */
  setPace(pace: Pace): Promise<void>;
}
