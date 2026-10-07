import type { RngState } from './state.ts';
import type { WmsAction, WmsActionName, WmsState, WmsView } from './wms.ts';

/**
 * The warehouse game's shared vocabulary (docs/RULES.md, decision records W1
 * and P3-P7).
 *
 * Units (P3): money is integer cents; orders and stock are integer
 * milli-units (1 order = 1 unit of stock = 1000), time is ticks of `tickMs`
 * wall-clock milliseconds. Nothing here is a float; State is hashed and must
 * match on every machine.
 */

/** The nine upgrades, in the order the upgrade sheet lists them. */
export type UpgradeId = 'docks' | 'truck' | 'loading' | 'sales' | 'picking' | 'receiving' | 'contract' | 'crew' | 'night';

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
 * The star perks (RULES 10a), in the order they unlock. Each is permanent once
 * the stars owned reach its threshold; stars are never spent on them.
 */
export type PerkId = 'headStart' | 'secondDock' | 'quickCharge' | 'express' | 'longShift';

/**
 * One outbound dock. `turn > 0` means the dock is swapping trucks and has none
 * to load; otherwise a truck is loading. A truck keeps the size it arrived with.
 */
export interface DockState {
  /** Id of the truck at (or next backing into) this dock; new for every arrival. */
  readonly truck: number;
  /** Parcels the truck holds: one parcel is one order. */
  readonly parcels: number;
  /** Milli-orders loaded. */
  readonly loaded: number;
  /** Ticks left on the departure timer (0: leaves with its first order). */
  readonly timer: number;
  readonly timerMax: number;
  /** Ticks of turnaround left; 0 while a truck is loading. */
  readonly turn: number;
  readonly turnMax: number;
  /** Ticks of rush banked by taps (RULES 6). */
  readonly rush: number;
  /** An express truck pays double (RULES 4). */
  readonly express: boolean;
}

/** The purchase order being unloaded at the receiving dock (RULES 3a). */
export interface PoState {
  /** PO number; new for every PO. */
  readonly id: number;
  /** Units on the PO. */
  readonly units: number;
  /** Milli-units put away on the shelves so far. */
  readonly received: number;
}

/** Counters for the recap and the harness. `earned` is in cents; the rest are whole things. */
export interface Stats {
  readonly earned: number;
  /** Trucks dispatched, and those that left full. */
  readonly shipments: number;
  readonly fullShipments: number;
  /** Orders shipped. */
  readonly orders: number;
  /** Milli-orders cancelled: customers who would not join a backlog that long. */
  readonly missed: number;
  readonly expresses: number;
  /** Purchase orders fully received, and their units. */
  readonly pos: number;
  readonly received: number;
  readonly taps: number;
}

/** The whole warehouse. Authoritative, hashed, saved; the interface never sees it (S6). */
export interface WarehouseState {
  readonly schemaVersion: number;
  readonly tick: number;
  readonly rng: RngState;
  /** Cents. Never negative. */
  readonly cash: number;
  /** Milli-orders in the backlog, waiting to be picked (RULES 3). */
  readonly backlog: number;
  /** Ticks of rush banked at picking by taps (extra pickers, RULES 6). */
  readonly pickRush: number;
  /** Milli-orders picked and packed, staged for the docks. */
  readonly staged: number;
  /** Milli-units on the shelves (RULES 3a). */
  readonly stock: number;
  /** The PO at the receiving dock. */
  readonly po: PoState;
  /** Ticks of rush banked at receiving by taps. */
  readonly receiveRush: number;
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
  /** The warehouse management system's orders, stock, pickers and log (docs/wms-plan.md). */
  readonly wms: WmsState;
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

type NoPayload = Record<string, never>;

/**
 * Intent from the player (S2, P5). `tick` is the tick it applies to. `tap`
 * rushes a dock, `tapPick` sends extra pickers for a moment, `tapReceive`
 * extra hands to the receiving dock.
 */
export type WarehouseCommand =
  | { readonly tick: number; readonly type: 'tap'; readonly payload: TapPayload }
  | { readonly tick: number; readonly type: 'tapPick'; readonly payload: NoPayload }
  | { readonly tick: number; readonly type: 'tapReceive'; readonly payload: NoPayload }
  | { readonly tick: number; readonly type: 'buy'; readonly payload: BuyPayload }
  | { readonly tick: number; readonly type: 'boost'; readonly payload: BoostPayload }
  | { readonly tick: number; readonly type: 'sell'; readonly payload: NoPayload }
  | { readonly tick: number; readonly type: 'wms'; readonly payload: WmsAction };

export type WarehouseCommandType = WarehouseCommand['type'];

/** A command before the host stamps it with the tick it applies to: what the interface sends. */
export type WarehouseIntent = WarehouseCommand extends infer C ? (C extends unknown ? Omit<C, 'tick'> : never) : never;

export interface WarehouseEventPayloads {
  readonly departed: { dock: number; truck: number; orders: number; parcels: number; cents: number; full: boolean; express: boolean };
  readonly arrived: { dock: number; truck: number; parcels: number; express: boolean };
  /** A PO was fully put away; the next one is at the dock. */
  readonly received: { po: number; units: number };
  readonly bought: { upgrade: UpgradeId; level: number; cents: number };
  readonly boosted: { boost: BoostId; ticks: number };
  readonly sold: { stars: number; site: number };
  /** A WMS action succeeded (slice 7); `cents` is what it cost. */
  readonly wms: { action: WmsActionName; order: number; cents: number };
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
  /** Loading rate at this dock now, milli-orders per tick (rush included). */
  readonly rate: number;
  /** Rushed now, by taps or by the All hands boost. */
  readonly rushed: boolean;
}

export type BottleneckKind = 'orders' | 'picking' | 'stock' | 'loading' | 'turnaround' | 'timer';

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
  /** Every star perk, in unlock order (RULES 10a). */
  readonly perks: readonly PerkView[];
}

/** A star perk: a permanent bonus that unlocks at a number of stars owned (RULES 10a). */
export interface PerkView {
  readonly id: PerkId;
  readonly name: string;
  /** What it does, with its numbers, in one short line ("Boosts recharge 25% faster"). */
  readonly effect: string;
  /** Stars owned that unlock it. */
  readonly stars: number;
  readonly unlocked: boolean;
  /** Not unlocked yet, but selling now would unlock it. */
  readonly unlocksOnSale: boolean;
}

/**
 * A station on the floor (RULES 14). Picking is the real queue (RULES 3) and
 * receiving the real inbound dock (RULES 3a); export paperwork and customs
 * slow picking; the order desk and quality check are scenery.
 */
export type CheckpointId = 'desk' | 'picking' | 'export' | 'customs' | 'receiving' | 'qc';

export interface CheckpointView {
  readonly id: CheckpointId;
  readonly name: string;
  /** A short label that fits a phone's width. */
  readonly label: string;
}

/** The stations for the current contract, in the order goods move through them (RULES 14). */
export interface JourneyView {
  /** An order's way from the desk to packing; then the docks. */
  readonly outbound: readonly CheckpointView[];
  /** Stock's way from the receiving dock to the shelves. */
  readonly inbound: readonly CheckpointView[];
}

export interface BoostView {
  readonly id: BoostId;
  readonly name: string;
  /** What it does, with its numbers, in one short line ("3x orders for 60 s"). */
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

/** The backlog and the pickers (RULES 3): orders waiting to be picked. */
export interface PickingView {
  /** Milli-orders waiting. */
  readonly backlog: number;
  /** The longest backlog customers will wait behind, milli-orders; beyond it they cancel. */
  readonly cap: number;
  /** Milli-orders picked a tick now, extra pickers included. */
  readonly ratePerTick: number;
  /** The same without extra pickers: what the upgrade sets. */
  readonly baseRatePerTick: number;
  /** Extra pickers are on the floor (a tap, or All hands). */
  readonly rushed: boolean;
  /** Ticks an order placed now would wait, at today's rate. */
  readonly waitTicks: number;
  /** Stations that slow picking (export paperwork, customs), as a multiplier in basis points. */
  readonly slowBp: number;
  /** Milli-items in an order at today's contract (RULES 3b): each item is a pick and a unit of stock. */
  readonly itemsMilli: number;
}

/** The receiving dock and the shelves (RULES 3a). */
export interface ReceivingView {
  /** Milli-units on the shelves, and the most they hold. */
  readonly stock: number;
  readonly shelfCap: number;
  /** Milli-units put away a tick now, extra hands included, and without them. */
  readonly ratePerTick: number;
  readonly baseRatePerTick: number;
  readonly rushed: boolean;
  /** The PO being unloaded. */
  readonly po: PoState;
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
  /** Steady-state orders shipped a second, milli-orders. */
  readonly ordersPerSec: number;
  /** Pay per order, cents, stars and site included. */
  readonly pay: number;
  readonly contract: string;
  readonly truckModel: string;
  /** Packed orders waiting for a truck, the most that fit, and orders coming in a tick now. */
  readonly staging: { readonly staged: number; readonly cap: number; readonly orderPerTick: number };
  readonly picking: PickingView;
  readonly receiving: ReceivingView;
  readonly journey: JourneyView;
  readonly docks: readonly DockView[];
  readonly upgrades: readonly UpgradeView[];
  readonly bottleneck: Bottleneck;
  readonly boosts: readonly BoostView[];
  readonly site: SiteView;
  readonly stars: StarsView;
  readonly offlineCapMinutes: number;
  readonly run: Stats;
  readonly life: Stats;
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
