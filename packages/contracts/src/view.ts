import type { ControllerSlot, NationId, Tick } from './nation.ts';

/**
 * One nation's filtered picture of the world: what that nation is allowed to know.
 *
 * Multiplayer need: this is the anti-cheat boundary (seam 6). In multiplayer only
 * the View crosses the network, so hidden information cannot leak into a client
 * that could be inspected or modified. The same boundary applies to AI nations,
 * which is what makes "the AI never cheats" checkable rather than a promise.
 *
 * Phase 0 shape: identity and clock only. Each later system adds its own
 * already-filtered slice.
 */
export interface View {
  readonly schemaVersion: number;
  readonly selfId: NationId;
  readonly tick: Tick;
  readonly selfController: ControllerSlot;
  /** Nations this nation knows exist. Never the full State roster in the future. */
  readonly knownNations: readonly NationId[];
}
