import type { RngState } from './state.ts';

/**
 * The warehouse game's shared vocabulary (docs/RULES.md, decision records P1-P5).
 *
 * Units (P3): money is integer cents, passengers are integer milli-passengers
 * (1 passenger = 1000), time is ticks of `tickMs` wall-clock milliseconds.
 * Nothing here is a float; State is hashed and must match on every machine.
 */

/** The eight upgrades, in the order the upgrade sheet lists them. */
export type UpgradeId = 'docks' | 'truck' | 'loading' | 'sales' | 'picking' | 'contract' | 'crew' | 'night';

export type Levels = Readonly<Record<UpgradeId, number>>;

/** The three boosts (RULES 15), in the order the boost bar shows them. */
export type BoostId = 'flashSale' | 'allHands' | 'surge';

/** One boost's clock, in ticks. Both 0: ready (or locked, if its unlock is not reached). */
export interface BoostState {
  /** Ticks of effect left; > 0 while the boost is running. */
  readonly left: number;
  /** Ticks until it can be used again, counted from when it was used. */
  readonly recharge: number;
}

export type Boosts = Readonly<Record<BoostId, BoostState>>;

/**
 * One dock. `turn > 0` means the dock is in turnaround and has no truck;
 * otherwise a truck is loading. A truck keeps the parcels it arrived with.
 */
export interface DockState {
  /** Id of the truck at (or next arriving at) this dock; new for every arrival. */
  readonly truck: number;
  readonly parcels: number;
  /** Milli-passengers on board. */
  readonly loaded: number;
  /** Ticks left on the departure timer (0: leaves with its first passenger). */
  readonly timer: number;
  readonly timerMax: number;
  /** Ticks of turnaround left; 0 while a truck is loading. */
  readonly turn: number;
  readonly turnMax: number;
  /** Ticks of rush banked by taps (RULES 6). */
  readonly rush: number;
  readonly express: boolean;
}

/** Counters for the recap and the harness. `earned` is in cents. */
export interface Stats {
  readonly earned: number;
  readonly shipments: number;
  readonly fullShipments: number;
  readonly orders: number;
  readonly missed: number;
  readonly expresses: number;
  readonly taps: number;
}

/** The whole warehouse. Authoritative, hashed, saved; the interface never sees it (S6). */
export interface WarehouseState {
  readonly schemaVersion: number;
  readonly tick: number;
  readonly rng: RngState;
  /** Cents. Never negative. */
  readonly cash: number;
  /** Milli-passengers in the picking line, not yet in the staging (RULES 3). */
  readonly backlog: number;
  /** Ticks of rush banked at picking by taps (an extra lane open, RULES 6). */
  readonly pickRush: number;
  /** Milli-passengers staged in the staging, past picking. */
  readonly staged: number;
  readonly levels: Levels;
  readonly docks: readonly DockState[];
  readonly nextTruck: number;
  /** How many warehouses have been sold: the site is SITES[site mod count]. */
  readonly site: number;
  readonly stars: number;
  /** Boost clocks (RULES 15); reset to ready when a new warehouse opens. */
  readonly boosts: Boosts;
  /** This warehouse since it opened. */
  readonly run: Stats;
  /** Every warehouse, ever. */
  readonly life: Stats;
}

export interface TapPayload {
  readonly dock: number;
}
export interface BuyPayload {
  readonly upgrade: UpgradeId;
}
export interface BoostPayload {
  readonly boost: BoostId;
}

/** Intent from the player (S2, P5). `tick` is the tick it applies to. `tapPick` opens an extra lane at picking for a moment. */
export type WarehouseCommand =
  | { readonly tick: number; readonly type: 'tap'; readonly payload: TapPayload }
  | { readonly tick: number; readonly type: 'tapPick'; readonly payload: Record<string, never> }
  | { readonly tick: number; readonly type: 'buy'; readonly payload: BuyPayload }
  | { readonly tick: number; readonly type: 'boost'; readonly payload: BoostPayload }
  | { readonly tick: number; readonly type: 'sell'; readonly payload: Record<string, never> };

export type WarehouseCommandType = WarehouseCommand['type'];

/** A command before the host stamps it with the tick it applies to: what the interface sends. */
export type WarehouseIntent =
  | { readonly type: 'tap'; readonly payload: TapPayload }
  | { readonly type: 'tapPick'; readonly payload: Record<string, never> }
  | { readonly type: 'buy'; readonly payload: BuyPayload }
  | { readonly type: 'boost'; readonly payload: BoostPayload }
  | { readonly type: 'sell'; readonly payload: Record<string, never> };

export interface WarehouseEventPayloads {
  readonly departed: { dock: number; truck: number; orders: number; parcels: number; cents: number; full: boolean; express: boolean };
  readonly arrived: { dock: number; truck: number; parcels: number; express: boolean };
  readonly bought: { upgrade: UpgradeId; level: number; cents: number };
  readonly boosted: { boost: BoostId; ticks: number };
  readonly sold: { stars: number; site: number };
  readonly rejected: { command: WarehouseCommandType; reason: string };
}
export type WarehouseEventType = keyof WarehouseEventPayloads;

/** Something the step decided, for animation and logs. Derived; never saved. */
export type WarehouseEvent = {
  [K in WarehouseEventType]: { readonly tick: number; readonly type: K; readonly payload: WarehouseEventPayloads[K] };
}[WarehouseEventType];

/** How an upgrade's effect is measured, so the interface can format it. */
export type EffectUnit = 'count' | 'parcels' | 'ordersPerSec' | 'cents' | 'seconds' | 'minutes';

export interface UpgradeView {
  readonly id: UpgradeId;
  readonly name: string;
  /** The catch, in one line (RULES 7). */
  readonly catch: string;
  readonly level: number;
  readonly maxLevel: number;
  /** Cents for the next level, or null at the max. */
  readonly cost: number | null;
  readonly affordable: boolean;
  /** Why it cannot be bought yet (other than cash), or null. */
  readonly locked: string | null;
  readonly unit: EffectUnit;
  /** Effect now and after the next level, in milli-units of `unit` (1000 = 1). */
  readonly now: number;
  readonly next: number | null;
  /** Name of the next level's item (a truck model or a contract), if it has one. */
  readonly nextName: string | null;
}

export interface DockView extends DockState {
  readonly index: number;
  readonly model: string;
  /** Boarding rate at this dock now, milli-passengers per tick (rush included). */
  readonly rate: number;
  /** Rushed now, by taps or by the All hands boost. */
  readonly rushed: boolean;
}

export type BottleneckKind = 'passengers' | 'picking' | 'loading' | 'turnaround' | 'timer';

export interface Bottleneck {
  readonly kind: BottleneckKind;
  readonly text: string;
  readonly fix: readonly UpgradeId[];
}

export interface SiteView {
  /** 0-based count of warehouses sold. */
  readonly index: number;
  readonly name: string;
  readonly twist: string;
}

export interface StarsView {
  readonly owned: number;
  /** Stars this warehouse would sell for now. */
  readonly claimable: number;
  /** Cents this warehouse must have earned to be worth one more star. */
  readonly nextAt: number;
  /** Pay multiplier from owned stars, basis points (10000 = x1). */
  readonly bonusBp: number;
  /** Pay multiplier after selling now. */
  readonly bonusAfterBp: number;
  readonly nextSite: SiteView;
}

/** A checkpoint passengers walk through (RULES 14). Picking is a real queue (RULES 3); the others are scenery, though passport control and preclearance slow picking down. */
export type CheckpointId = 'checkin' | 'picking' | 'passport' | 'preclearance' | 'baggage' | 'customs';

export interface CheckpointView {
  readonly id: CheckpointId;
  readonly name: string;
  /** A short label that fits a phone's width. */
  readonly label: string;
}

/** The passenger journey for the current contract, in walking order (RULES 14). */
export interface JourneyView {
  /** From the door to the staging; then the docks. */
  readonly departures: readonly CheckpointView[];
  /** From the docks to the exit. */
  readonly arrivals: readonly CheckpointView[];
}

export interface BoostView {
  readonly id: BoostId;
  readonly name: string;
  /** What it does, with its numbers, in one short line ("3x passengers for 60 s"). */
  readonly effect: string;
  /** Ticks of effect left (0: not running) and the full length. */
  readonly left: number;
  readonly length: number;
  /** Ticks until it can be used again, and the full recharge. */
  readonly recharge: number;
  readonly rechargeLength: number;
  /** Not running, recharged and unlocked: a tap uses it. */
  readonly ready: boolean;
  /** What opens it, short enough for its button ("Needs 3 docks"), or null once open. */
  readonly locked: string | null;
  /** It fixes the current bottleneck (RULES 8), so the interface can point at it. */
  readonly helps: boolean;
}

/** The picking line (RULES 3): the queue between the door and the staging. */
export interface PickingView {
  /** Milli-passengers in line. */
  readonly backlog: number;
  /** The longest line people will join, milli-passengers; beyond it they turn back at the door. */
  readonly cap: number;
  /** Milli-passengers picking clears a tick now, extra lane included. */
  readonly ratePerTick: number;
  /** The same without the extra lane: what the upgrade sets. */
  readonly baseRatePerTick: number;
  /** An extra lane is open (a tap, or All hands). */
  readonly rushed: boolean;
  /** Ticks a person joining the line now would wait, at today's rate. */
  readonly waitTicks: number;
  /** Departure checkpoints that slow it (passport control, preclearance), as a multiplier in basis points. */
  readonly slowBp: number;
}

/** What the interface reads (S6, P5): the warehouse plus derived numbers and names. */
export interface WarehouseView {
  readonly tick: number;
  readonly tickMs: number;
  readonly cash: number;
  /** Steady-state estimate, cents per second (P6). Boosts aside. */
  readonly incomePerSec: number;
  /** The same estimate with the running boosts applied; equal to incomePerSec when none runs. */
  readonly boostedIncomePerSec: number;
  readonly pay: number;
  readonly contract: string;
  readonly truckModel: string;
  readonly staging: { readonly staged: number; readonly cap: number; readonly orderPerTick: number };
  readonly picking: PickingView;
  readonly journey: JourneyView;
  readonly docks: readonly DockView[];
  readonly upgrades: readonly UpgradeView[];
  readonly bottleneck: Bottleneck;
  readonly boosts: readonly BoostView[];
  readonly site: SiteView;
  readonly stars: StarsView;
  readonly offbacklogCapMinutes: number;
  readonly run: Stats;
  readonly life: Stats;
}

/** A warehouse save (S9): snapshot, commands since, where to stop, and a hash to prove it. */
export interface WarehouseSaveFile {
  readonly schemaVersion: number;
  readonly snapshot: WarehouseState;
  readonly commandLog: readonly WarehouseCommand[];
  readonly savedAtTick: number;
  readonly stateHash: string;
}
