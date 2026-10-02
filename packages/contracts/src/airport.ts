import type { RngState } from './state.ts';

/**
 * The airport game's shared vocabulary (docs/RULES.md, decision records P1-P5).
 *
 * Units (P3): money is integer cents, passengers are integer milli-passengers
 * (1 passenger = 1000), time is ticks of `tickMs` wall-clock milliseconds.
 * Nothing here is a float; State is hashed and must match on every machine.
 */

/** The eight upgrades, in the order the upgrade sheet lists them. */
export type UpgradeId = 'gates' | 'plane' | 'boarding' | 'terminal' | 'security' | 'route' | 'crew' | 'night';

export type Levels = Readonly<Record<UpgradeId, number>>;

/** The three boosts (RULES 15), in the order the boost bar shows them. */
export type BoostId = 'rushHour' | 'allHands' | 'surge';

/** One boost's clock, in ticks. Both 0: ready (or locked, if its unlock is not reached). */
export interface BoostState {
  /** Ticks of effect left; > 0 while the boost is running. */
  readonly left: number;
  /** Ticks until it can be used again, counted from when it was used. */
  readonly recharge: number;
}

export type Boosts = Readonly<Record<BoostId, BoostState>>;

/**
 * One gate. `turn > 0` means the gate is in turnaround and has no plane;
 * otherwise a plane is boarding. A plane keeps the seats it arrived with.
 */
export interface GateState {
  /** Id of the plane at (or next arriving at) this gate; new for every arrival. */
  readonly plane: number;
  readonly seats: number;
  /** Milli-passengers on board. */
  readonly boarded: number;
  /** Ticks left on the departure timer (0: leaves with its first passenger). */
  readonly timer: number;
  readonly timerMax: number;
  /** Ticks of turnaround left; 0 while a plane is boarding. */
  readonly turn: number;
  readonly turnMax: number;
  /** Ticks of rush banked by taps (RULES 6). */
  readonly rush: number;
  readonly charter: boolean;
}

/** Counters for the recap and the harness. `earned` is in cents. */
export interface Stats {
  readonly earned: number;
  readonly flights: number;
  readonly fullFlights: number;
  readonly pax: number;
  readonly missed: number;
  readonly charters: number;
  readonly taps: number;
}

/** The whole airport. Authoritative, hashed, saved; the interface never sees it (S6). */
export interface AirportState {
  readonly schemaVersion: number;
  readonly tick: number;
  readonly rng: RngState;
  /** Cents. Never negative. */
  readonly cash: number;
  /** Milli-passengers in the security line, not yet in the lounge (RULES 3). */
  readonly line: number;
  /** Ticks of rush banked at security by taps (an extra lane open, RULES 6). */
  readonly securityRush: number;
  /** Milli-passengers waiting in the lounge, past security. */
  readonly waiting: number;
  readonly levels: Levels;
  readonly gates: readonly GateState[];
  readonly nextPlane: number;
  /** How many airports have been sold: the city is CITIES[city mod count]. */
  readonly city: number;
  readonly slots: number;
  /** Boost clocks (RULES 15); reset to ready when a new airport opens. */
  readonly boosts: Boosts;
  /** This airport since it opened. */
  readonly run: Stats;
  /** Every airport, ever. */
  readonly life: Stats;
}

export interface TapPayload {
  readonly gate: number;
}
export interface BuyPayload {
  readonly upgrade: UpgradeId;
}
export interface BoostPayload {
  readonly boost: BoostId;
}

/** Intent from the player (S2, P5). `tick` is the tick it applies to. `tapSecurity` opens an extra lane at security for a moment. */
export type AirportCommand =
  | { readonly tick: number; readonly type: 'tap'; readonly payload: TapPayload }
  | { readonly tick: number; readonly type: 'tapSecurity'; readonly payload: Record<string, never> }
  | { readonly tick: number; readonly type: 'buy'; readonly payload: BuyPayload }
  | { readonly tick: number; readonly type: 'boost'; readonly payload: BoostPayload }
  | { readonly tick: number; readonly type: 'sell'; readonly payload: Record<string, never> };

export type AirportCommandType = AirportCommand['type'];

/** A command before the host stamps it with the tick it applies to: what the interface sends. */
export type AirportIntent =
  | { readonly type: 'tap'; readonly payload: TapPayload }
  | { readonly type: 'tapSecurity'; readonly payload: Record<string, never> }
  | { readonly type: 'buy'; readonly payload: BuyPayload }
  | { readonly type: 'boost'; readonly payload: BoostPayload }
  | { readonly type: 'sell'; readonly payload: Record<string, never> };

export interface AirportEventPayloads {
  readonly departed: { gate: number; plane: number; pax: number; seats: number; cents: number; full: boolean; charter: boolean };
  readonly arrived: { gate: number; plane: number; seats: number; charter: boolean };
  readonly bought: { upgrade: UpgradeId; level: number; cents: number };
  readonly boosted: { boost: BoostId; ticks: number };
  readonly sold: { slots: number; city: number };
  readonly rejected: { command: AirportCommandType; reason: string };
}
export type AirportEventType = keyof AirportEventPayloads;

/** Something the step decided, for animation and logs. Derived; never saved. */
export type AirportEvent = {
  [K in AirportEventType]: { readonly tick: number; readonly type: K; readonly payload: AirportEventPayloads[K] };
}[AirportEventType];

/** How an upgrade's effect is measured, so the interface can format it. */
export type EffectUnit = 'count' | 'seats' | 'paxPerSec' | 'cents' | 'seconds' | 'minutes';

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
  /** Name of the next level's item (a plane model or a route), if it has one. */
  readonly nextName: string | null;
}

export interface GateView extends GateState {
  readonly index: number;
  readonly model: string;
  /** Boarding rate at this gate now, milli-passengers per tick (rush included). */
  readonly rate: number;
  /** Rushed now, by taps or by the All hands boost. */
  readonly rushed: boolean;
}

export type BottleneckKind = 'passengers' | 'security' | 'boarding' | 'turnaround' | 'timer';

export interface Bottleneck {
  readonly kind: BottleneckKind;
  readonly text: string;
  readonly fix: readonly UpgradeId[];
}

export interface CityView {
  /** 0-based count of airports sold. */
  readonly index: number;
  readonly name: string;
  readonly twist: string;
}

export interface SlotsView {
  readonly owned: number;
  /** Slots this airport would sell for now. */
  readonly claimable: number;
  /** Cents this airport must have earned to be worth one more slot. */
  readonly nextAt: number;
  /** Fare multiplier from owned slots, basis points (10000 = x1). */
  readonly bonusBp: number;
  /** Fare multiplier after selling now. */
  readonly bonusAfterBp: number;
  readonly nextCity: CityView;
}

/** A checkpoint passengers walk through (RULES 14). Security is a real queue (RULES 3); the others are scenery, though passport control and preclearance slow security down. */
export type CheckpointId = 'checkin' | 'security' | 'passport' | 'preclearance' | 'baggage' | 'customs';

export interface CheckpointView {
  readonly id: CheckpointId;
  readonly name: string;
  /** A short label that fits a phone's width. */
  readonly label: string;
}

/** The passenger journey for the current route, in walking order (RULES 14). */
export interface JourneyView {
  /** From the door to the lounge; then the gates. */
  readonly departures: readonly CheckpointView[];
  /** From the gates to the exit. */
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
  /** What opens it, short enough for its button ("Needs 3 gates"), or null once open. */
  readonly locked: string | null;
  /** It fixes the current bottleneck (RULES 8), so the interface can point at it. */
  readonly helps: boolean;
}

/** The security line (RULES 3): the queue between the door and the lounge. */
export interface SecurityView {
  /** Milli-passengers in line. */
  readonly line: number;
  /** The longest line people will join, milli-passengers; beyond it they turn back at the door. */
  readonly cap: number;
  /** Milli-passengers security clears a tick now, extra lane included. */
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

/** What the interface reads (S6, P5): the airport plus derived numbers and names. */
export interface AirportView {
  readonly tick: number;
  readonly tickMs: number;
  readonly cash: number;
  /** Steady-state estimate, cents per second (P6). Boosts aside. */
  readonly incomePerSec: number;
  /** The same estimate with the running boosts applied; equal to incomePerSec when none runs. */
  readonly boostedIncomePerSec: number;
  readonly fare: number;
  readonly route: string;
  readonly planeModel: string;
  readonly terminal: { readonly waiting: number; readonly cap: number; readonly arrivalPerTick: number };
  readonly security: SecurityView;
  readonly journey: JourneyView;
  readonly gates: readonly GateView[];
  readonly upgrades: readonly UpgradeView[];
  readonly bottleneck: Bottleneck;
  readonly boosts: readonly BoostView[];
  readonly city: CityView;
  readonly slots: SlotsView;
  readonly offlineCapMinutes: number;
  readonly run: Stats;
  readonly life: Stats;
}

/** An airport save (S9): snapshot, commands since, where to stop, and a hash to prove it. */
export interface AirportSaveFile {
  readonly schemaVersion: number;
  readonly snapshot: AirportState;
  readonly commandLog: readonly AirportCommand[];
  readonly savedAtTick: number;
  readonly stateHash: string;
}
