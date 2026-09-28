import type { ControllerSlot, NationId, Tick } from './nation.ts';

/**
 * The seeded random number generator, stored inside State.
 *
 * Multiplayer need: determinism. Two machines stepping the same state with the
 * same commands must produce identical results, so randomness cannot come from
 * Math.random - it is state that is saved, restored and hashed like everything
 * else (seam 5). Integer fields only, so there is no float drift between a
 * phone, a laptop and a server.
 */
export interface RngState {
  readonly seed: number;
  readonly counter: number;
}

/**
 * The whole world, authoritative and server-side only.
 *
 * Multiplayer need: State is the thing no client may ever see in full. Clients
 * get a View (seam 6). Everything needed to continue a game lives here and
 * nowhere else - no timers, no DOM, no module-level variables - so a snapshot
 * plus later commands is always enough to resume or to reproduce a bug.
 *
 * Phase 0 shape: the fields every later phase depends on. Economy, trade,
 * crises, interactions and score are added by the lane that owns them.
 */
export interface State {
  readonly schemaVersion: number;
  readonly tick: Tick;
  readonly rng: RngState;
  /** Controller slot per nation; iteration order over nations must be stable. */
  readonly controllers: Readonly<Record<NationId, ControllerSlot>>;
}
