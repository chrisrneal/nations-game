import type { AirportState, Boosts, GateState, Levels, RngState, Stats } from '@airport/contracts';
import { seedRng } from './rng.ts';
import { derive, type Derived } from './rules.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

/** Current airport save schema. Bump it with a migration in save.ts. */
export const AIRPORT_SCHEMA_VERSION = 2;

export const EMPTY_STATS: Stats = { earned: 0, flights: 0, fullFlights: 0, pax: 0, missed: 0, charters: 0, taps: 0 };

export const ZERO_LEVELS: Levels = { gates: 0, plane: 0, boarding: 0, terminal: 0, route: 0, crew: 0, night: 0 };

/** Every boost recharged and not running (RULES 15). */
export const READY_BOOSTS: Boosts = { rushHour: { left: 0, recharge: 0 }, allHands: { left: 0, recharge: 0 }, surge: { left: 0, recharge: 0 } };

/** A plane arriving at a gate (RULES 4). The charter roll is the caller's. */
export function arrivingGate(plane: number, d: Derived, charter: boolean, rush = 0): GateState {
  return { plane, seats: d.seats, boarded: 0, timer: d.departTicks, timerMax: d.departTicks, turn: 0, turnMax: 0, rush, charter };
}

export interface CreateAirportOptions {
  readonly seed: number;
  /** Airports sold before this one: picks the city. */
  readonly city?: number;
  readonly slots?: number;
  readonly life?: Stats;
}

/** A brand-new airport: one gate with a plane boarding, passengers already waiting. */
export function createAirport(options: CreateAirportOptions): AirportState {
  return openAirport({
    tick: 0,
    rng: seedRng(options.seed),
    city: options.city ?? 0,
    slots: options.slots ?? 0,
    life: options.life ?? EMPTY_STATS,
    nextPlane: 1,
  });
}

/** The airport for a city, keeping the clock, the RNG, slots, lifetime stats and plane numbering. */
export function openAirport(keep: {
  readonly tick: number;
  readonly rng: RngState;
  readonly city: number;
  readonly slots: number;
  readonly life: Stats;
  readonly nextPlane: number;
}): AirportState {
  const base = { city: keep.city, slots: keep.slots, levels: ZERO_LEVELS };
  const d = derive(base);
  return {
    schemaVersion: AIRPORT_SCHEMA_VERSION,
    tick: keep.tick,
    rng: keep.rng,
    cash: T.startingCashCents.value,
    waiting: T.startingWaiting.value * 1000,
    levels: ZERO_LEVELS,
    gates: [arrivingGate(keep.nextPlane, d, false)],
    nextPlane: keep.nextPlane + 1,
    city: keep.city,
    slots: keep.slots,
    boosts: READY_BOOSTS,
    run: EMPTY_STATS,
    life: keep.life,
  };
}
