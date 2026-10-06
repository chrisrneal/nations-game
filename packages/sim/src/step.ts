import type { WarehouseCommand, WarehouseEvent, WarehouseState, BoostId, BoostState, DockState, Levels, RngState, Stats, UpgradeId } from '@warehouse/contracts';
import { randomInt } from './rng.ts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';
import { warehouseCommandProblem } from './commands.ts';
import { mulDiv } from './math.ts';
import { orderBpAt, boostProblem, boostTicks, cashCap, derive, lockReason, starsFor, turnTicksFor, upgradeCost, type Derived } from './rules.ts';
import { arrivingDock, openWarehouse } from './state.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

const BP = 10_000;

type Mutable<V> = { -readonly [K in keyof V]: V[K] };
type MDock = Mutable<DockState>;
type MStats = Mutable<Stats>;
/** The step works on a private copy it may change in place (P4). */
interface MState {
  schemaVersion: number;
  tick: number;
  rng: RngState;
  cash: number;
  backlog: number;
  pickRush: number;
  staged: number;
  levels: Mutable<Levels>;
  docks: MDock[];
  nextTruck: number;
  site: number;
  stars: number;
  boosts: Record<BoostId, Mutable<BoostState>>;
  run: MStats;
  life: MStats;
}

function clone(s: WarehouseState): MState {
  return {
    schemaVersion: s.schemaVersion,
    tick: s.tick,
    rng: s.rng,
    cash: s.cash,
    backlog: s.backlog,
    pickRush: s.pickRush,
    staged: s.staged,
    levels: { ...s.levels },
    docks: s.docks.map((g) => ({ ...g })),
    nextTruck: s.nextTruck,
    site: s.site,
    stars: s.stars,
    boosts: { flashSale: { ...s.boosts.flashSale }, allHands: { ...s.boosts.allHands }, surge: { ...s.boosts.surge } },
    run: { ...s.run },
    life: { ...s.life },
  };
}

type Sink = WarehouseEvent[] | null;

function emit(events: Sink, event: WarehouseEvent): void {
  if (events !== null) events.push(event);
}

function bump(m: MState, key: keyof Stats, by: number): void {
  m.run[key] = Math.min(cashCap(), m.run[key] + by);
  m.life[key] = Math.min(cashCap(), m.life[key] + by);
}

/** Arrivals join the picking line up to the longest line people will join; the rest are missed (RULES 3). */
function joinBacklog(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.backlogCapMilli - m.backlog);
  const added = Math.min(milli, room);
  m.backlog += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

/** Picking clears the head of the line into the staging; a full staging holds the line (RULES 3, 6). */
function pickingTick(m: MState, d: Derived): void {
  const rushed = m.pickRush > 0 || m.boosts.allHands.left > 0;
  if (m.pickRush > 0) m.pickRush -= 1;
  const rate = rushed ? mulDiv(d.pickingMilli, T.rushLoadBp.value, BP) : d.pickingMilli;
  const cleared = Math.min(rate, m.backlog, Math.max(0, d.stageCapMilli - m.staged));
  m.backlog -= cleared;
  m.staged += cleared;
}

/** Adds passengers straight to the staging (connecting passengers stay airside) up to its parcels; the rest are missed (RULES 10). */
function addWaiting(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.stageCapMilli - m.staged);
  const added = Math.min(milli, room);
  m.staged += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

function rollExpress(m: MState): boolean {
  const draw = randomInt(m.rng, 0, BP - 1);
  m.rng = draw.rng;
  return draw.value < T.expressChanceBp.value;
}

function arrive(m: MState, index: number, d: Derived, events: Sink): void {
  const dock = m.docks[index] as MDock;
  const express = rollExpress(m);
  Object.assign(dock, arrivingDock(m.nextTruck, d, express, dock.rush));
  m.nextTruck += 1;
  if (express) bump(m, 'expresses', 1);
  emit(events, { tick: m.tick, type: 'arrived', payload: { dock: index, truck: dock.truck, parcels: dock.parcels, express } });
}

function depart(m: MState, index: number, d: Derived, events: Sink): void {
  const dock = m.docks[index] as MDock;
  const orders = Math.floor(dock.loaded / 1000);
  const full = dock.loaded >= dock.parcels * 1000;
  let cents = orders * d.payCents;
  if (full) cents = mulDiv(cents, BP + T.fullBonusBp.value, BP);
  if (dock.express) cents = mulDiv(cents, T.expressPayBp.value, BP);
  cents = mulDiv(cents, d.payMulBp, BP);
  if (m.boosts.surge.left > 0) cents = mulDiv(cents, T.surgePayBp.value, BP);
  m.cash = Math.min(cashCap(), m.cash + cents);
  bump(m, 'earned', cents);
  bump(m, 'shipments', 1);
  bump(m, 'orders', orders);
  if (full) bump(m, 'fullShipments', 1);
  emit(events, { tick: m.tick, type: 'departed', payload: { dock: index, truck: dock.truck, orders, parcels: dock.parcels, cents, full, express: dock.express } });
  if (full && d.twist === 'crossdock') addWaiting(m, mulDiv(dock.parcels * 1000, T.crossdockBp.value, BP), d);
  dock.turn = turnTicksFor(dock.parcels, d.crewBp);
  dock.turnMax = dock.turn;
  dock.loaded = 0;
  dock.timer = 0;
  dock.express = false;
}

/** One dock's tick (RULES 5 and 6). */
function dockTick(m: MState, index: number, d: Derived, events: Sink): void {
  const dock = m.docks[index] as MDock;
  const rushed = dock.rush > 0 || m.boosts.allHands.left > 0;
  if (dock.rush > 0) dock.rush -= 1;
  if (dock.turn > 0) {
    dock.turn = Math.max(0, dock.turn - (rushed ? T.rushTurnSpeed.value : 1));
    if (dock.turn === 0) arrive(m, index, d, events);
    return;
  }
  const rate = rushed ? mulDiv(d.loadMilli, T.rushLoadBp.value, BP) : d.loadMilli;
  const need = dock.parcels * 1000 - dock.loaded;
  const take = Math.min(rate, need, m.staged);
  m.staged -= take;
  dock.loaded += take;
  if (rushed) dock.loaded += Math.min(rate - take, need - take);
  if (dock.timer > 0) dock.timer -= 1;
  const full = dock.loaded >= dock.parcels * 1000;
  if (full || (dock.timer === 0 && dock.loaded >= 1000)) depart(m, index, d, events);
}

function reject(m: MState, events: Sink, command: WarehouseCommand['type'], reason: string): void {
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
  if (upgrade === 'docks') {
    m.docks.push(arrivingDock(m.nextTruck, derive(m), false));
    m.nextTruck += 1;
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
  const stars = starsFor(m.run.earned);
  if (stars < 1) {
    reject(m, events, 'sell', 'Not worth a star yet');
    return false;
  }
  const next = openWarehouse({ tick: m.tick, rng: m.rng, site: m.site + 1, stars: m.stars + stars, life: m.life, nextTruck: m.nextTruck });
  Object.assign(m, clone(next));
  emit(events, { tick: m.tick, type: 'sold', payload: { stars, site: m.site } });
  return true;
}

/** Applies one command; true if it changed the levels or the warehouse (so derived numbers must be recomputed). */
function apply(m: MState, command: WarehouseCommand, events: Sink): boolean {
  const problem = warehouseCommandProblem(command);
  if (problem !== null) {
    reject(m, events, command.type, problem);
    return false;
  }
  switch (command.type) {
    case 'tap': {
      const dock = m.docks[command.payload.dock];
      if (dock === undefined) {
        reject(m, events, 'tap', 'no such dock');
        return false;
      }
      dock.rush = Math.min(T.rushMaxTicks.value, dock.rush + T.rushTicksPerTap.value);
      bump(m, 'taps', 1);
      return false;
    }
    case 'tapPick':
      m.pickRush = Math.min(T.rushMaxTicks.value, m.pickRush + T.rushTicksPerTap.value);
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

/** One tick, in place: commands, arrivals into the line, picking into the staging, then every dock in rotating order (RULES 3, 5). */
function tickInPlace(m: MState, commands: readonly WarehouseCommand[], d: Derived, events: Sink): Derived {
  let current = d;
  for (const command of commands.slice(0, T.maxCommandsPerTick.value)) {
    if (apply(m, command, events)) current = derive(m);
  }
  const arrivals = mulDiv(current.orderMilli, orderBpAt(current.twist, m.tick), BP);
  joinBacklog(m, m.boosts.flashSale.left > 0 ? mulDiv(arrivals, T.flashSaleOrderBp.value, BP) : arrivals, current);
  pickingTick(m, current);
  const n = m.docks.length;
  const start = m.tick % n;
  for (let k = 0; k < n; k++) dockTick(m, (start + k) % n, current, events);
  boostClocks(m);
  m.tick += 1;
  return current;
}

export interface WarehouseStepResult {
  readonly state: WarehouseState;
  readonly events: readonly WarehouseEvent[];
}

/** The whole simulation surface (S1): one tick with the commands stamped for it. */
export function step(state: WarehouseState, commands: readonly WarehouseCommand[]): WarehouseStepResult {
  const m = clone(state);
  const events: WarehouseEvent[] = [];
  tickInPlace(m, commands, derive(m), events);
  return { state: m, events };
}

/**
 * `ticks` ticks with no commands, copying the state once (P4). Equal to calling
 * `step(state, [])` that many times - tested - but fast enough for a day of
 * offline earnings. No events: the recap reads the stats instead.
 */
export function advanceMany(state: WarehouseState, ticks: number): WarehouseState {
  const m = clone(state);
  const d = derive(m);
  for (let i = 0; i < ticks; i++) tickInPlace(m, [], d, null);
  return m;
}
