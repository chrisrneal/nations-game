import type { NationId, Tick } from './nation.ts';

/**
 * The only way state ever changes.
 *
 * Multiplayer need: every actor - the local player, an AI nation, a remote
 * player - sends the same validated, tick-stamped object, so a server can
 * re-validate and re-order intent it did not generate, and a replay of the log
 * reproduces the game exactly (seams 2 and 9). A command is intent, not an
 * outcome: the sim decides whether it is legal when the tick is stepped.
 *
 * `nationId` is who is acting, and is authoritative on the server: a client may
 * never submit a command for a nation it does not control.
 */
export interface Command<TType extends string = string, TPayload = unknown> {
  readonly nationId: NationId;
  readonly tick: Tick;
  readonly type: TType;
  readonly payload: TPayload;
}
