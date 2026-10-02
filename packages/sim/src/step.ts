import type { AirportCommand, AirportEvent, AirportState, BoostId, BoostState, GateState, Levels, RngState, Stats, UpgradeId } from '@airport/contracts';
import { randomInt } from './rng.ts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';
import { airportCommandProblem } from './commands.ts';
import { mulDiv } from './math.ts';
import { arrivalBpAt, boostProblem, boostTicks, cashCap, derive, lockReason, slotsFor, turnTicksFor, upgradeCost, type Derived } from './rules.ts';
import { arrivingGate, openAirport } from './state.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

const BP = 10_000;

type Mutable<V> = { -readonly [K in keyof V]: V[K] };
type MGate = Mutable<GateState>;
type MStats = Mutable<Stats>;
/** The step works on a private copy it may change in place (P4). */
interface MState {
  schemaVersion: number;
  tick: number;
  rng: RngState;
  cash: number;
  line: number;
  securityRush: number;
  waiting: number;
  levels: Mutable<Levels>;
  gates: MGate[];
  nextPlane: number;
  city: number;
  slots: number;
  boosts: Record<BoostId, Mutable<BoostState>>;
  run: MStats;
  life: MStats;
}

function clone(s: AirportState): MState {
  return {
    schemaVersion: s.schemaVersion,
    tick: s.tick,
    rng: s.rng,
    cash: s.cash,
    line: s.line,
    securityRush: s.securityRush,
    waiting: s.waiting,
    levels: { ...s.levels },
    gates: s.gates.map((g) => ({ ...g })),
    nextPlane: s.nextPlane,
    city: s.city,
    slots: s.slots,
    boosts: { rushHour: { ...s.boosts.rushHour }, allHands: { ...s.boosts.allHands }, surge: { ...s.boosts.surge } },
    run: { ...s.run },
    life: { ...s.life },
  };
}

type Sink = AirportEvent[] | null;

function emit(events: Sink, event: AirportEvent): void {
  if (events !== null) events.push(event);
}

function bump(m: MState, key: keyof Stats, by: number): void {
  m.run[key] = Math.min(cashCap(), m.run[key] + by);
  m.life[key] = Math.min(cashCap(), m.life[key] + by);
}

/** Arrivals join the security line up to the longest line people will join; the rest are missed (RULES 3). */
function joinLine(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.lineCapMilli - m.line);
  const added = Math.min(milli, room);
  m.line += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

/** Security clears the head of the line into the lounge; a full lounge holds the line (RULES 3, 6). */
function securityTick(m: MState, d: Derived): void {
  const rushed = m.securityRush > 0 || m.boosts.allHands.left > 0;
  if (m.securityRush > 0) m.securityRush -= 1;
  const rate = rushed ? mulDiv(d.securityMilli, T.rushBoardBp.value, BP) : d.securityMilli;
  const cleared = Math.min(rate, m.line, Math.max(0, d.waitCapMilli - m.waiting));
  m.line -= cleared;
  m.waiting += cleared;
}

/** Adds passengers straight to the lounge (connecting passengers stay airside) up to its seats; the rest are missed (RULES 10). */
function addWaiting(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.waitCapMilli - m.waiting);
  const added = Math.min(milli, room);
  m.waiting += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

function rollCharter(m: MState): boolean {
  const draw = randomInt(m.rng, 0, BP - 1);
  m.rng = draw.rng;
  return draw.value < T.charterChanceBp.value;
}

function arrive(m: MState, index: number, d: Derived, events: Sink): void {
  const gate = m.gates[index] as MGate;
  const charter = rollCharter(m);
  Object.assign(gate, arrivingGate(m.nextPlane, d, charter, gate.rush));
  m.nextPlane += 1;
  if (charter) bump(m, 'charters', 1);
  emit(events, { tick: m.tick, type: 'arrived', payload: { gate: index, plane: gate.plane, seats: gate.seats, charter } });
}

function depart(m: MState, index: number, d: Derived, events: Sink): void {
  const gate = m.gates[index] as MGate;
  const pax = Math.floor(gate.boarded / 1000);
  const full = gate.boarded >= gate.seats * 1000;
  let cents = pax * d.fareCents;
  if (full) cents = mulDiv(cents, BP + T.fullBonusBp.value, BP);
  if (gate.charter) cents = mulDiv(cents, T.charterFareBp.value, BP);
  cents = mulDiv(cents, d.fareMulBp, BP);
  if (m.boosts.surge.left > 0) cents = mulDiv(cents, T.surgeFareBp.value, BP);
  m.cash = Math.min(cashCap(), m.cash + cents);
  bump(m, 'earned', cents);
  bump(m, 'flights', 1);
  bump(m, 'pax', pax);
  if (full) bump(m, 'fullFlights', 1);
  emit(events, { tick: m.tick, type: 'departed', payload: { gate: index, plane: gate.plane, pax, seats: gate.seats, cents, full, charter: gate.charter } });
  if (full && d.twist === 'hub') addWaiting(m, mulDiv(gate.seats * 1000, T.hubTransferBp.value, BP), d);
  gate.turn = turnTicksFor(gate.seats, d.crewBp);
  gate.turnMax = gate.turn;
  gate.boarded = 0;
  gate.timer = 0;
  gate.charter = false;
}

/** One gate's tick (RULES 5 and 6). */
function gateTick(m: MState, index: number, d: Derived, events: Sink): void {
  const gate = m.gates[index] as MGate;
  const rushed = gate.rush > 0 || m.boosts.allHands.left > 0;
  if (gate.rush > 0) gate.rush -= 1;
  if (gate.turn > 0) {
    gate.turn = Math.max(0, gate.turn - (rushed ? T.rushTurnSpeed.value : 1));
    if (gate.turn === 0) arrive(m, index, d, events);
    return;
  }
  const rate = rushed ? mulDiv(d.boardMilli, T.rushBoardBp.value, BP) : d.boardMilli;
  const need = gate.seats * 1000 - gate.boarded;
  const take = Math.min(rate, need, m.waiting);
  m.waiting -= take;
  gate.boarded += take;
  if (rushed) gate.boarded += Math.min(rate - take, need - take);
  if (gate.timer > 0) gate.timer -= 1;
  const full = gate.boarded >= gate.seats * 1000;
  if (full || (gate.timer === 0 && gate.boarded >= 1000)) depart(m, index, d, events);
}

function reject(m: MState, events: Sink, command: AirportCommand['type'], reason: string): void {
  emit(events, { tick: m.tick, type: 'rejected', payload: { command, reason } });
}

function buy(m: MState, upgrade: UpgradeId, events: Sink): boolean {
  if (!UPGRADE_IDS.includes(upgrade)) {
    reject(m, events, 'buy', 'unknown upgrade');
    return false;
  }
  const locked = lockReason(upgrade, m);
  if (locked !== null) {
    reject(m, events, 'buy', locked);
    return false;
  }
  const cents = upgradeCost(upgrade, m.levels[upgrade]);
  if (cents > m.cash) {
    reject(m, events, 'buy', 'Not enough cash');
    return false;
  }
  m.cash -= cents;
  m.levels[upgrade] += 1;
  if (upgrade === 'gates') {
    m.gates.push(arrivingGate(m.nextPlane, derive(m), false));
    m.nextPlane += 1;
  }
  emit(events, { tick: m.tick, type: 'bought', payload: { upgrade, level: m.levels[upgrade], cents } });
  return true;
}

/** Starts a boost (RULES 15). The tick it is used on is its first. */
function useBoost(m: MState, id: BoostId, events: Sink): void {
  if (!BOOST_IDS.includes(id)) {
    reject(m, events, 'boost', 'unknown boost');
    return;
  }
  const problem = boostProblem(id, m);
  if (problem !== null) {
    reject(m, events, 'boost', problem);
    return;
  }
  const { length, recharge } = boostTicks(id);
  m.boosts[id] = { left: length, recharge };
  emit(events, { tick: m.tick, type: 'boosted', payload: { boost: id, ticks: length } });
}

/** Boost clocks run down at the end of every tick, in play and in catch-up alike. */
function boostClocks(m: MState): void {
  for (const id of BOOST_IDS) {
    const b = m.boosts[id];
    if (b.left > 0) b.left -= 1;
    if (b.recharge > 0) b.recharge -= 1;
  }
}

function sell(m: MState, events: Sink): boolean {
  const slots = slotsFor(m.run.earned);
  if (slots < 1) {
    reject(m, events, 'sell', 'Not worth a slot yet');
    return false;
  }
  const next = openAirport({ tick: m.tick, rng: m.rng, city: m.city + 1, slots: m.slots + slots, life: m.life, nextPlane: m.nextPlane });
  Object.assign(m, clone(next));
  emit(events, { tick: m.tick, type: 'sold', payload: { slots, city: m.city } });
  return true;
}

/** Applies one command; true if it changed the levels or the airport (so derived numbers must be recomputed). */
function apply(m: MState, command: AirportCommand, events: Sink): boolean {
  const problem = airportCommandProblem(command);
  if (problem !== null) {
    reject(m, events, command.type, problem);
    return false;
  }
  switch (command.type) {
    case 'tap': {
      const gate = m.gates[command.payload.gate];
      if (gate === undefined) {
        reject(m, events, 'tap', 'no such gate');
        return false;
      }
      gate.rush = Math.min(T.rushMaxTicks.value, gate.rush + T.rushTicksPerTap.value);
      bump(m, 'taps', 1);
      return false;
    }
    case 'tapSecurity':
      m.securityRush = Math.min(T.rushMaxTicks.value, m.securityRush + T.rushTicksPerTap.value);
      bump(m, 'taps', 1);
      return false;
    case 'buy':
      return buy(m, command.payload.upgrade, events);
    case 'boost':
      useBoost(m, command.payload.boost, events);
      return false;
    case 'sell':
      return sell(m, events);
  }
}

/** One tick, in place: commands, arrivals into the line, security into the lounge, then every gate in rotating order (RULES 3, 5). */
function tickInPlace(m: MState, commands: readonly AirportCommand[], d: Derived, events: Sink): Derived {
  let current = d;
  for (const command of commands.slice(0, T.maxCommandsPerTick.value)) {
    if (apply(m, command, events)) current = derive(m);
  }
  const arrivals = mulDiv(current.arrivalMilli, arrivalBpAt(current.twist, m.tick), BP);
  joinLine(m, m.boosts.rushHour.left > 0 ? mulDiv(arrivals, T.rushHourArrivalBp.value, BP) : arrivals, current);
  securityTick(m, current);
  const n = m.gates.length;
  const start = m.tick % n;
  for (let k = 0; k < n; k++) gateTick(m, (start + k) % n, current, events);
  boostClocks(m);
  m.tick += 1;
  return current;
}

export interface AirportStepResult {
  readonly state: AirportState;
  readonly events: readonly AirportEvent[];
}

/** The whole simulation surface (S1): one tick with the commands stamped for it. */
export function step(state: AirportState, commands: readonly AirportCommand[]): AirportStepResult {
  const m = clone(state);
  const events: AirportEvent[] = [];
  tickInPlace(m, commands, derive(m), events);
  return { state: m, events };
}

/**
 * `ticks` ticks with no commands, copying the state once (P4). Equal to calling
 * `step(state, [])` that many times - tested - but fast enough for a day of
 * offline earnings. No events: the recap reads the stats instead.
 */
export function advanceMany(state: AirportState, ticks: number): AirportState {
  const m = clone(state);
  const d = derive(m);
  for (let i = 0; i < ticks; i++) tickInPlace(m, [], d, null);
  return m;
}
