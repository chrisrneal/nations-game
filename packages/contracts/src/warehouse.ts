import type { WmsAction, WmsActionName, WmsState, WmsView } from './wms.ts';

/**
 * The warehouse game's shared vocabulary (docs/RULES.md, decision records W8
 * and P3-P7). Since W8 the game is the warehouse management system: the idle
 * flow (backlog, trucks, upgrades, boosts, stars) is gone.
 *
 * Units (P3): money is integer cents, stock whole units, time ticks of
 * `tickMs` wall-clock milliseconds. Nothing here is a float; State is hashed
 * and must match on every machine.
 */

/** The whole warehouse. Authoritative, hashed, saved; the interface never sees it (S6). */
export interface WarehouseState {
  readonly schemaVersion: number;
  readonly tick: number;
  /** Cents. Never negative. */
  readonly cash: number;
  /** The warehouse management system: orders, stock, the crew and their tasks, POs and the log. */
  readonly wms: WmsState;
}

/** Intent from the player (S2, P5): a WMS action. `tick` is the tick it applies to. */
export type WarehouseCommand = { readonly tick: number; readonly type: 'wms'; readonly payload: WmsAction };

export type WarehouseCommandType = WarehouseCommand['type'];

/** A command before the host stamps it with the tick it applies to: what the interface sends. */
export type WarehouseIntent = Omit<WarehouseCommand, 'tick'>;

export interface WarehouseEventPayloads {
  /** An order shipped: what it paid, and whether it was on time and in full. */
  readonly wmsShipped: { order: number; iso: string; priority: number; cents: number; onTime: boolean; inFull: boolean; goodwill: number };
  /** An order's cutoff passed before it shipped. */
  readonly wmsMissed: { order: number; iso: string; priority: number };
  /** A WMS action succeeded; `cents` is what it cost. */
  readonly wms: { action: WmsActionName; order: number; cents: number };
  /** A new warehouse day began (W8). */
  readonly newDay: { day: number };
  readonly rejected: { command: WarehouseCommandType; reason: string };
}
export type WarehouseEventType = keyof WarehouseEventPayloads;

/** Something the step decided, for animation and logs. Derived; never saved. */
export type WarehouseEvent = {
  [K in WarehouseEventType]: { readonly tick: number; readonly type: K; readonly payload: WarehouseEventPayloads[K] };
}[WarehouseEventType];

/** The warehouse clock (W8): a minute of the warehouse day passes every `ticksPerMinute` ticks. */
export interface ClockView {
  /** 1 on the opening day. */
  readonly day: number;
  /** Minute of the day, 0-1439. */
  readonly minute: number;
  /** For turning any tick into a time of day on screen: ticks a minute, and the minute of day tick 0 fell on. */
  readonly ticksPerMinute: number;
  readonly startMinute: number;
}

/** What the interface reads (S6, P5): the warehouse plus derived numbers and names. */
export interface WarehouseView {
  readonly tick: number;
  readonly tickMs: number;
  readonly cash: number;
  readonly clock: ClockView;
  readonly offlineCapMinutes: number;
  readonly wms: WmsView;
}

/** A warehouse save (S9): snapshot, commands since, where to stop, and a hash to prove it. */
export interface WarehouseSaveFile {
  readonly schemaVersion: number;
  readonly snapshot: WarehouseState;
  readonly commandLog: readonly WarehouseCommand[];
  readonly savedAtTick: number;
  readonly stateHash: string;
}
