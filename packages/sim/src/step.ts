import type { WarehouseCommand, WarehouseEvent, WarehouseState, BoostId, BoostState, DockState, Levels, PoState, RngState, Stats, UpgradeId, WmsState } from '@warehouse/contracts';
import { randomInt } from './rng.ts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';
import { warehouseCommandProblem } from './commands.ts';
import { mulDiv } from './math.ts';
import { expressChanceBp } from './perks.ts';
import { boostProblem, boostTicks, cashCap, derive, lockReason, orderBpAt, rushed, starsFor, turnTicksFor, upgradeCost, type Derived } from './rules.ts';
import { arrivingDock, arrivingPo, openWarehouse } from './state.ts';
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
  stock: number;
  po: Mutable<PoState>;
  receiveRush: number;
  levels: Mutable<Levels>;
  docks: MDock[];
  nextTruck: number;
  site: number;
  stars: number;
  boosts: Record<BoostId, Mutable<BoostState>>;
  run: MStats;
  life: MStats;
  /** Not stepped yet (docs/wms-plan.md slice 2): shared, never changed in place. */
  wms: WmsState;
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
    stock: s.stock,
    po: { ...s.po },
    receiveRush: s.receiveRush,
    levels: { ...s.levels },
    docks: s.docks.map((g) => ({ ...g })),
    nextTruck: s.nextTruck,
    site: s.site,
    stars: s.stars,
    boosts: { flashSale: { ...s.boosts.flashSale }, allHands: { ...s.boosts.allHands }, surge: { ...s.boosts.surge } },
    run: { ...s.run },
    life: { ...s.life },
    wms: s.wms,
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

/** New orders join the backlog up to the longest backlog customers accept; the rest cancel (RULES 3). */
function joinBacklog(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.backlogCapMilli - m.backlog);
  const added = Math.min(milli, room);
  m.backlog += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

/**
 * The receiving dock puts the PO away onto the shelves; full shelves hold it.
 * A finished PO is replaced at once by the next, which takes the rest of the
 * tick's put-away (RULES 3a, 6).
 */
function receivingTick(m: MState, d: Derived, events: Sink): void {
  const fast = m.receiveRush > 0 || m.boosts.allHands.left > 0;
  if (m.receiveRush > 0) m.receiveRush -= 1;
  let budget = fast ? rushed(d.receiveMilli) : d.receiveMilli;
  while (budget > 0) {
    const put = Math.min(budget, m.po.units * 1000 - m.po.received, Math.max(0, d.shelfCapMilli - m.stock));
    if (put <= 0) break;
    m.stock += put;
    m.po.received += put;
    budget -= put;
    if (m.po.received >= m.po.units * 1000) {
      bump(m, 'pos', 1);
      bump(m, 'received', m.po.units);
      emit(events, { tick: m.tick, type: 'received', payload: { po: m.po.id, units: m.po.units } });
      m.po = arrivingPo(m.po.id + 1, d);
    }
  }
}

/**
 * Pickers take orders from the head of the backlog into staging, a unit of
 * stock for each item (an order is `itemsMilli` / 1000 items, rounded up when
 * taken); empty shelves or full staging hold them (RULES 3, 3b, 6).
 */
function pickingTick(m: MState, d: Derived): void {
  const fast = m.pickRush > 0 || m.boosts.allHands.left > 0;
  if (m.pickRush > 0) m.pickRush -= 1;
  const rate = fast ? rushed(d.pickingMilli) : d.pickingMilli;
  const stocked = Math.floor((m.stock * 1000) / d.itemsMilli);
  const picked = Math.min(rate, m.backlog, stocked, Math.max(0, d.stageCapMilli - m.staged));
  m.backlog -= picked;
  m.stock -= Math.ceil((picked * d.itemsMilli) / 1000);
  m.staged += picked;
}

/** Adds orders straight to staging (cross-dock orders skip picking and stock) up to its space; the rest are cancelled (RULES 10). */
function addStaged(m: MState, milli: number, d: Derived): void {
  const room = Math.max(0, d.stageCapMilli - m.staged);
  const added = Math.min(milli, room);
  m.staged += added;
  if (milli > added) bump(m, 'missed', milli - added);
}

function rollExpress(m: MState): boolean {
  const draw = randomInt(m.rng, 0, BP - 1);
  m.rng = draw.rng;
  return draw.value < expressChanceBp(m.stars);
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
  if (full && d.twist === 'crossdock') addStaged(m, mulDiv(dock.parcels * 1000, T.crossdockBp.value, BP), d);
  dock.turn = turnTicksFor(dock.parcels, d.crewBp);
  dock.turnMax = dock.turn;
  dock.loaded = 0;
  dock.timer = 0;
  dock.express = false;
}

/** One dock's tick (RULES 5 and 6). */
function dockTick(m: MState, index: number, d: Derived, events: Sink): void {
  const dock = m.docks[index] as MDock;
  const fast = dock.rush > 0 || m.boosts.allHands.left > 0;
  if (dock.rush > 0) dock.rush -= 1;
  if (dock.turn > 0) {
    dock.turn = Math.max(0, dock.turn - (fast ? T.rushTurnSpeed.value : 1));
    if (dock.turn === 0) arrive(m, index, d, events);
    return;
  }
  const rate = fast ? rushed(d.loadMilli) : d.loadMilli;
  const need = dock.parcels * 1000 - dock.loaded;
  const take = Math.min(rate, need, m.staged);
  m.staged -= take;
  dock.loaded += take;
  // A rushed dock also loads counter orders: trade customers collecting at the dock (RULES 6).
  if (fast) dock.loaded += Math.min(rate - take, need - take);
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
  const { length, recharge } = boostTicks(id, m.stars);
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
  const next = openWarehouse({ tick: m.tick, rng: m.rng, site: m.site + 1, stars: m.stars + stars, life: m.life, nextTruck: m.nextTruck, nextPo: m.po.id + 1 });
  Object.assign(m, clone(next));
  emit(events, { tick: m.tick, type: 'sold', payload: { stars, site: m.site } });
  return true;
}

function bank(rush: number): number {
  return Math.min(T.rushMaxTicks.value, rush + T.rushTicksPerTap.value);
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
      dock.rush = bank(dock.rush);
      bump(m, 'taps', 1);
      return false;
    }
    case 'tapPick':
      m.pickRush = bank(m.pickRush);
      bump(m, 'taps', 1);
      return false;
    case 'tapReceive':
      m.receiveRush = bank(m.receiveRush);
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

/**
 * One tick, in place (RULES 5): commands, new orders into the backlog,
 * receiving onto the shelves, picking into staging, then every dock in
 * rotating order.
 */
function tickInPlace(m: MState, commands: readonly WarehouseCommand[], d: Derived, events: Sink): Derived {
  let current = d;
  for (const command of commands.slice(0, T.maxCommandsPerTick.value)) {
    if (apply(m, command, events)) current = derive(m);
  }
  const orders = mulDiv(current.orderMilli, orderBpAt(current.twist, m.tick), BP);
  joinBacklog(m, m.boosts.flashSale.left > 0 ? mulDiv(orders, T.flashSaleOrderBp.value, BP) : orders, current);
  receivingTick(m, current, events);
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
