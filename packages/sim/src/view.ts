import type { AirportState, AirportView, BoostId, BoostView, Bottleneck, BottleneckKind, CityView, EffectUnit, GateView, UpgradeId, UpgradeView } from '@airport/contracts';
import { BOOST_IDS, BOOST_NAMES, PLANE_MODELS, ROUTES, UPGRADE_IDS, UPGRADE_TEXT, cityAt, journeyAt, nameAt } from './catalog.ts';
import { mulDiv } from './math.ts';
import {
  arrivalBpAt,
  arrivalMilliAt,
  boardMilliAt,
  boostEffect,
  boostLock,
  boostProblem,
  boostTicks,
  crewBpAt,
  derive,
  earnedForSlots,
  fareCentsAt,
  lockReason,
  maxLevel,
  meanArrivalBp,
  offlineMinutesAt,
  seatsAt,
  slotsFor,
  turnTicksFor,
  twistText,
  upgradeCost,
} from './rules.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

const BP = 10_000;

export interface Estimate {
  /** Cents a second at steady state, idle (no taps). */
  readonly incomePerSec: number;
  /** Passengers a second carried at steady state, in milli-passengers. */
  readonly paxPerSec: number;
  readonly full: boolean;
  readonly bottleneck: Bottleneck;
}

const BOTTLENECK_TEXT: Readonly<Record<BottleneckKind, string>> = {
  passengers: 'Planes are waiting for passengers.',
  boarding: 'Passengers are queuing at the gates.',
  turnaround: 'Gates are busy turning planes around.',
  timer: 'Planes leave before they fill.',
};

/**
 * Passengers a second the gates can actually take when arrivals average
 * `mean`. Sunvale's waves arrive faster than the gates can board for a minute,
 * then slower: the terminal stores what it can of the wave for the quiet spell.
 */
function supplyThroughput(twist: ReturnType<typeof derive>['twist'], mean: number, capacity: number, room: number): number {
  if (twist !== 'waves') return mean;
  const tickSec = T.tickMs.value / 1000;
  const base = mean / (meanArrivalBp(twist) / BP);
  const waveSec = T.waveTicks.value * tickSec;
  const offSec = (T.wavePeriodTicks.value - T.waveTicks.value) * tickSec;
  const inWave = base * (T.waveArrivalBp.value / BP);
  const offWave = base * (T.offWaveArrivalBp.value / BP);
  const stored = Math.min(room, Math.max(0, inWave - capacity) * waveSec, Math.max(0, capacity - offWave) * offSec);
  return (Math.min(inWave, capacity) * waveSec + Math.min(offWave, capacity) * offSec + stored) / (waveSec + offSec);
}

/** What the running boosts change, for the estimate (RULES 15). */
export interface BoostEffect {
  /** Arrivals multiplier, basis points. */
  readonly arrivalBp: number;
  /** Every gate rushed, with walk-ups (RULES 6). */
  readonly rushed: boolean;
  /** Fare multiplier, basis points. */
  readonly fareBp: number;
}

export const NO_BOOST: BoostEffect = { arrivalBp: BP, rushed: false, fareBp: BP };

/** The effect of the boosts running in this state. */
export function runningBoosts(state: Pick<AirportState, 'boosts'>): BoostEffect {
  return {
    arrivalBp: state.boosts.rushHour.left > 0 ? T.rushHourArrivalBp.value : BP,
    rushed: state.boosts.allHands.left > 0,
    fareBp: state.boosts.surge.left > 0 ? T.surgeFareBp.value : BP,
  };
}

/**
 * The steady-state income estimate and the bottleneck (RULES 8, P6). A display
 * number derived from the levels, never stored in State, so it uses ordinary
 * arithmetic and rounds to whole cents at the end. With `boost`, the same
 * estimate as if those boosts ran for good (the boosted income on screen).
 */
export function estimate(state: AirportState, boost: BoostEffect = NO_BOOST): Estimate {
  const d = derive(state);
  const tickSec = T.tickMs.value / 1000;
  const seats = d.seats;
  const arrivals = ((d.arrivalMilli / 1000) * (meanArrivalBp(d.twist) / BP) * (boost.arrivalBp / BP)) / tickSec;
  const board = (boost.rushed ? mulDiv(d.boardMilli, T.rushBoardBp.value, BP) : d.boardMilli) / 1000 / tickSec;
  const timer = d.departTicks * tickSec;
  const turnTicks = turnTicksFor(seats, d.crewBp);
  const turn = (boost.rushed ? Math.ceil(turnTicks / T.rushTurnSpeed.value) : turnTicks) * tickSec;
  const fill = seats / board;
  const cycle = Math.min(fill, timer) + turn;
  const capacity = (d.gates * Math.min(seats, board * timer)) / cycle;

  let throughput: number;
  let full: boolean;
  let kind: BottleneckKind;
  let fix: UpgradeId[];
  const supply = supplyThroughput(d.twist, arrivals, capacity, d.waitCapMilli / 1000);
  // Rushed gates board walk-ups when the terminal is empty (RULES 6): the gates are the limit.
  if (boost.rushed || supply >= capacity * 0.999) {
    throughput = capacity;
    full = fill <= timer;
    kind = !full ? 'timer' : fill >= turn ? 'boarding' : 'turnaround';
    fix = kind === 'turnaround' ? ['crew', 'plane'] : ['boarding', 'gates'];
  } else {
    full = (seats * d.gates) / supply - turn <= timer;
    // Highmoor Hub: full flights send a share of their seats back to the terminal.
    const fed = full && d.twist === 'hub' ? supply / (1 - T.hubTransferBp.value / BP) : supply;
    throughput = Math.min(capacity, fed);
    kind = full ? 'passengers' : 'timer';
    fix = ['terminal'];
  }
  const charter = 1 + (T.charterChanceBp.value / BP) * (T.charterFareBp.value / BP - 1);
  const bonus = full ? 1 + T.fullBonusBp.value / BP : 1;
  const incomePerSec = Math.floor(throughput * d.fareCents * bonus * charter * (d.fareMulBp / BP) * (boost.fareBp / BP));
  return {
    incomePerSec,
    paxPerSec: Math.floor(throughput * 1000),
    full,
    bottleneck: { kind, text: BOTTLENECK_TEXT[kind], fix },
  };
}

/** Plane level of a plane with this many seats (a plane keeps its size after an upgrade). */
function modelFor(seats: number): string {
  for (let level = 0; level <= T.maxPlaneLevel.value; level++) if (seatsAt(level) === seats) return nameAt(PLANE_MODELS, level);
  return nameAt(PLANE_MODELS, 0);
}

const perSec = (milliPerTick: number): number => Math.floor((milliPerTick * 1000) / T.tickMs.value);

function effect(id: UpgradeId, level: number, state: AirportState, fareMul: number): { unit: EffectUnit; value: number; name: string | null } {
  switch (id) {
    case 'gates':
      return { unit: 'count', value: (1 + level) * 1000, name: null };
    case 'plane':
      return { unit: 'seats', value: seatsAt(level) * 1000, name: nameAt(PLANE_MODELS, level) };
    case 'boarding':
      return { unit: 'paxPerSec', value: perSec(boardMilliAt(level)), name: null };
    case 'terminal':
      return { unit: 'paxPerSec', value: perSec(arrivalMilliAt(level)), name: null };
    case 'route':
      return { unit: 'cents', value: mulDiv(fareCentsAt(level), fareMul, BP) * 1000, name: nameAt(ROUTES, level) };
    case 'crew':
      return { unit: 'seconds', value: turnTicksFor(seatsAt(state.levels.plane), crewBpAt(level)) * T.tickMs.value, name: null };
    case 'night':
      return { unit: 'minutes', value: offlineMinutesAt(level) * 1000, name: null };
  }
}

function upgradeView(id: UpgradeId, state: AirportState, fareMul: number): UpgradeView {
  const level = state.levels[id];
  const max = maxLevel(id, state);
  const locked = lockReason(id, state);
  const cost = level >= max ? null : upgradeCost(id, level);
  const now = effect(id, level, state, fareMul);
  const next = level >= max ? null : effect(id, level + 1, state, fareMul);
  return {
    id,
    name: UPGRADE_TEXT[id].name,
    catch: UPGRADE_TEXT[id].catch,
    level,
    maxLevel: max,
    cost,
    affordable: cost !== null && locked === null && cost <= state.cash,
    locked,
    unit: now.unit,
    now: now.value,
    next: next?.value ?? null,
    nextName: next?.name ?? null,
  };
}

/** Which boost fixes each bottleneck (RULES 8, 15). Fare surge pays whatever the bottleneck. */
const BOOST_FIXES: Readonly<Record<BottleneckKind, BoostId>> = {
  passengers: 'rushHour',
  timer: 'rushHour',
  boarding: 'allHands',
  turnaround: 'allHands',
};

function boostView(id: BoostId, state: AirportState, bottleneck: BottleneckKind): BoostView {
  const clock = state.boosts[id];
  const ticks = boostTicks(id);
  return {
    id,
    name: BOOST_NAMES[id],
    effect: boostEffect(id),
    left: clock.left,
    length: ticks.length,
    recharge: clock.recharge,
    rechargeLength: ticks.recharge,
    ready: boostProblem(id, state) === null,
    locked: boostLock(id, state),
    helps: BOOST_FIXES[bottleneck] === id,
  };
}

function cityView(sold: number): CityView {
  const city = cityAt(sold);
  return { index: sold, name: city.label, twist: twistText(city.twist) };
}

/** Everything the interface reads (S6, P5). */
export function airportView(state: AirportState): AirportView {
  const d = derive(state);
  const est = estimate(state);
  const boost = runningBoosts(state);
  const anyBoost = boost.arrivalBp !== BP || boost.rushed || boost.fareBp !== BP;
  const boosted = anyBoost ? estimate(state, boost).incomePerSec : est.incomePerSec;
  const rushRate = mulDiv(d.boardMilli, T.rushBoardBp.value, BP);
  const gates: GateView[] = state.gates.map((g, index) => {
    const rushed = g.rush > 0 || boost.rushed;
    return { ...g, index, model: modelFor(g.seats), rate: rushed ? rushRate : d.boardMilli, rushed };
  });
  const claimable = slotsFor(state.run.earned);
  return {
    tick: state.tick,
    tickMs: T.tickMs.value,
    cash: state.cash,
    incomePerSec: est.incomePerSec,
    boostedIncomePerSec: Math.max(est.incomePerSec, boosted),
    fare: mulDiv(d.fareCents, d.fareMulBp, BP),
    route: nameAt(ROUTES, state.levels.route),
    planeModel: nameAt(PLANE_MODELS, state.levels.plane),
    terminal: { waiting: state.waiting, cap: d.waitCapMilli, arrivalPerTick: mulDiv(mulDiv(d.arrivalMilli, arrivalBpAt(d.twist, state.tick), BP), boost.arrivalBp, BP) },
    journey: journeyAt(state.levels.route),
    gates,
    upgrades: UPGRADE_IDS.map((id) => upgradeView(id, state, d.fareMulBp)),
    bottleneck: est.bottleneck,
    boosts: BOOST_IDS.map((id) => boostView(id, state, est.bottleneck.kind)),
    city: cityView(state.city),
    slots: {
      owned: state.slots,
      claimable,
      nextAt: earnedForSlots(claimable + 1),
      bonusBp: BP + state.slots * T.slotBonusBp.value,
      bonusAfterBp: BP + (state.slots + claimable) * T.slotBonusBp.value,
      nextCity: cityView(state.city + 1),
    },
    offlineCapMinutes: offlineMinutesAt(state.levels.night),
    run: state.run,
    life: state.life,
  };
}
