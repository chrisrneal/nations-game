import type { AirportState, BoostId, UpgradeId } from '@airport/contracts';
import { ROUTES, cityAt, nameAt, type CityTwist } from './catalog.ts';
import { grow, isqrt, mulDiv } from './math.ts';
import { AIRPORT_TUNABLES as T, type AirportTunableId } from './tunables.ts';

/**
 * The formulas of docs/RULES.md sections 3-10, as pure functions of the state's
 * levels. Tunables are read at call time so a harness sweep can override them.
 */

const BP = 10_000;

export function cashCap(): number {
  return T.cashCapCents.value;
}

/** Seats on a plane of this level (RULES 4). */
export function seatsAt(level: number): number {
  return grow(T.planeSeatsBase.value, T.planeSeatsGrowthBp.value, level);
}

/** Departure timer, in ticks, for a plane with this many seats. */
export function departTicksFor(seats: number): number {
  return T.departBaseTicks.value + T.departTicksPerSeat.value * seats;
}

/** Turnaround multiplier for this crew level, in basis points. */
export function crewBpAt(level: number): number {
  return grow(BP, T.crewTurnBp.value, level);
}

/** Turnaround, in ticks, after a plane with this many seats leaves (RULES 5.5). */
export function turnTicksFor(seats: number, crewBp: number): number {
  const raw = T.turnBaseTicks.value + Math.floor(seats / T.turnSeatsPerTick.value);
  return Math.max(T.turnMinTicks.value, mulDiv(raw, crewBp, BP));
}

export function boardMilliAt(level: number): number {
  return grow(T.boardBaseMilliPerTick.value, T.boardGrowthBp.value, level);
}

export function arrivalMilliAt(level: number): number {
  return grow(T.arrivalBaseMilliPerTick.value, T.arrivalGrowthBp.value, level);
}

/** Waiting room, in milli-passengers. */
export function waitCapMilliAt(level: number): number {
  return grow(T.terminalCapBase.value, T.terminalCapGrowthBp.value, level) * 1000;
}

export function fareCentsAt(level: number): number {
  return grow(T.fareBaseCents.value, T.fareGrowthBp.value, level);
}

export function twistOf(state: Pick<AirportState, 'city'>): CityTwist {
  return cityAt(state.city).twist;
}

/** Fare multiplier from the city and owned slots, in basis points (RULES 5.4, 10). */
export function fareMulBp(state: Pick<AirportState, 'city' | 'slots'>): number {
  const city = twistOf(state) === 'shortRunway' ? T.shortRunwayFareBp.value : BP;
  return mulDiv(city, BP + state.slots * T.slotBonusBp.value, BP);
}

/** Sunvale's wave multiplier at this tick, basis points; 10000 elsewhere. */
export function arrivalBpAt(twist: CityTwist, tick: number): number {
  if (twist !== 'waves') return BP;
  return tick % T.wavePeriodTicks.value < T.waveTicks.value ? T.waveArrivalBp.value : T.offWaveArrivalBp.value;
}

/** The average of `arrivalBpAt` over a wave cycle (for the estimate). */
export function meanArrivalBp(twist: CityTwist): number {
  if (twist !== 'waves') return BP;
  const period = T.wavePeriodTicks.value;
  const wave = T.waveTicks.value;
  return Math.floor((T.waveArrivalBp.value * wave + T.offWaveArrivalBp.value * (period - wave)) / period);
}

const COST: Readonly<Record<UpgradeId, readonly [AirportTunableId, AirportTunableId]>> = {
  gates: ['gatesCostBase', 'gatesCostGrowthBp'],
  plane: ['planeCostBase', 'planeCostGrowthBp'],
  boarding: ['boardCostBase', 'boardCostGrowthBp'],
  terminal: ['terminalCostBase', 'terminalCostGrowthBp'],
  route: ['routeCostBase', 'routeCostGrowthBp'],
  crew: ['crewCostBase', 'crewCostGrowthBp'],
  night: ['nightCostBase', 'nightCostGrowthBp'],
};

/** Cents for the level after `level` (RULES 7): base x growth^level. */
export function upgradeCost(id: UpgradeId, level: number): number {
  const [base, growth] = COST[id];
  return grow(T[base].value, T[growth].value, level, cashCap());
}

/** Highest level this upgrade can reach in this city. */
export function maxLevel(id: UpgradeId, state: Pick<AirportState, 'city'>): number {
  const planeMax = twistOf(state) === 'shortRunway' ? Math.min(T.maxPlaneLevel.value, T.shortRunwayMaxPlane.value) : T.maxPlaneLevel.value;
  switch (id) {
    case 'gates':
      return T.maxGates.value - 1;
    case 'plane':
    case 'route':
      return planeMax;
    case 'boarding':
      return T.maxBoardLevel.value;
    case 'terminal':
      return T.maxTerminalLevel.value;
    case 'crew':
      return T.maxCrewLevel.value;
    case 'night':
      return T.maxNightLevel.value;
  }
}

/** Why the next level cannot be bought, cash aside; null if it can. */
export function lockReason(id: UpgradeId, state: Pick<AirportState, 'city' | 'levels'>): string | null {
  if (state.levels[id] >= maxLevel(id, state)) {
    const runway = (id === 'plane' || id === 'route') && twistOf(state) === 'shortRunway' && state.levels[id] < T.maxPlaneLevel.value;
    return runway ? 'Short runway' : 'Maxed out';
  }
  if (id === 'route' && state.levels.route >= state.levels.plane) return 'Needs bigger planes first';
  return null;
}

/** Offline cap in minutes for a night-shift level (RULES 9). */
export function offlineMinutesAt(level: number): number {
  return Math.min(T.offlineMaxMinutes.value, grow(T.offlineBaseMinutes.value, T.offlineGrowthBp.value, level));
}

/** Offline cap in ticks: the most the host may catch up after an absence. */
export function offlineCapTicks(state: Pick<AirportState, 'levels'>): number {
  return Math.floor((offlineMinutesAt(state.levels.night) * 60_000) / T.tickMs.value);
}

/** Slots an airport that has earned this many cents is worth (RULES 10). */
export function slotsFor(earned: number): number {
  return isqrt(Math.floor(earned / T.slotUnitCents.value));
}

/** Cents earned at which an airport is worth `n` slots. */
export function earnedForSlots(n: number): number {
  return n * n * T.slotUnitCents.value;
}

/** The numbers a tick needs, computed once per level change (P4: catch-up stays cheap). */
export interface Derived {
  readonly gates: number;
  readonly seats: number;
  readonly departTicks: number;
  readonly boardMilli: number;
  readonly arrivalMilli: number;
  readonly waitCapMilli: number;
  readonly fareCents: number;
  readonly crewBp: number;
  readonly fareMulBp: number;
  readonly twist: CityTwist;
}

export function derive(state: Pick<AirportState, 'levels' | 'city' | 'slots'>): Derived {
  const { levels } = state;
  const seats = seatsAt(levels.plane);
  return {
    gates: 1 + levels.gates,
    seats,
    departTicks: departTicksFor(seats),
    boardMilli: boardMilliAt(levels.boarding),
    arrivalMilli: arrivalMilliAt(levels.terminal),
    waitCapMilli: waitCapMilliAt(levels.terminal),
    fareCents: fareCentsAt(levels.route),
    crewBp: crewBpAt(levels.crew),
    fareMulBp: fareMulBp(state),
    twist: twistOf(state),
  };
}

/** City twist in one line, numbers from the tunables. */
export function twistText(twist: CityTwist): string {
  const pct = (bp: number): number => Math.round(Math.abs(bp - BP) / 100);
  switch (twist) {
    case 'none':
      return 'A quiet regional field. No twist.';
    case 'shortRunway':
      return `Short runway: planes stop at size ${T.shortRunwayMaxPlane.value + 1}, but every fare is +${pct(T.shortRunwayFareBp.value)}%.`;
    case 'hub':
      return `Hub: every full flight sends ${Math.round(T.hubTransferBp.value / 100)}% of its seats back as connecting passengers.`;
    case 'waves': {
      const secs = (ticks: number): number => Math.round((ticks * T.tickMs.value) / 1000);
      return `Holiday waves: ${secs(T.waveTicks.value)} s of ${T.waveArrivalBp.value / BP}x arrivals every ${Math.round(secs(T.wavePeriodTicks.value) / 60)} minutes, quieter between.`;
    }
  }
}

/** A boost's length and recharge in ticks (RULES 15). */
export function boostTicks(id: BoostId): { readonly length: number; readonly recharge: number } {
  switch (id) {
    case 'rushHour':
      return { length: T.rushHourTicks.value, recharge: T.rushHourRechargeTicks.value };
    case 'allHands':
      return { length: T.allHandsTicks.value, recharge: T.allHandsRechargeTicks.value };
    case 'surge':
      return { length: T.surgeTicks.value, recharge: T.surgeRechargeTicks.value };
  }
}

/** What opens a boost, short enough for its button, or null once it is open. */
export function boostLock(id: BoostId, state: Pick<AirportState, 'levels'>): string | null {
  if (id === 'allHands' && 1 + state.levels.gates < T.allHandsMinGates.value) return `Needs ${T.allHandsMinGates.value} gates`;
  if (id === 'surge' && state.levels.route < T.surgeMinRoute.value) return `Needs ${nameAt(ROUTES, T.surgeMinRoute.value)}`;
  return null;
}

/** Why a boost cannot be used now, or null if a tap would use it. */
export function boostProblem(id: BoostId, state: Pick<AirportState, 'levels' | 'boosts'>): string | null {
  const locked = boostLock(id, state);
  if (locked !== null) return locked;
  const clock = state.boosts[id];
  if (clock.left > 0) return 'Already running';
  if (clock.recharge > 0) return 'Recharging';
  return null;
}

/** A boost in one short line, numbers from the tunables. */
export function boostEffect(id: BoostId): string {
  const secs = Math.round((boostTicks(id).length * T.tickMs.value) / 1000);
  switch (id) {
    case 'rushHour':
      return `${T.rushHourArrivalBp.value / BP}x passengers for ${secs} s`;
    case 'allHands':
      return `Every gate rushed for ${secs} s`;
    case 'surge':
      return `${T.surgeFareBp.value / BP}x fares for ${secs} s`;
  }
}
