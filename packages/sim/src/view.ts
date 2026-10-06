import type { WarehouseState, WarehouseView, BoostId, BoostView, Bottleneck, BottleneckKind, SiteView, EffectUnit, DockView, PerkView, PickingView, ReceivingView, UpgradeId, UpgradeView } from '@warehouse/contracts';
import { BOOST_IDS, BOOST_NAMES, TRUCK_MODELS, CONTRACTS, UPGRADE_IDS, UPGRADE_TEXT, siteAt, journeyAt, nameAt } from './catalog.ts';
import { mulDiv } from './math.ts';
import { PERK_IDS, PERK_NAMES, expressChanceBp, hasPerk, perkEffect, perkStars } from './perks.ts';
import {
  orderBpAt,
  orderMilliAt,
  loadMilliAt,
  boostEffect,
  boostLock,
  boostProblem,
  boostTicks,
  crewBpAt,
  derive,
  earnedForStars,
  payCentsAt,
  lockReason,
  maxLevel,
  meanOrderBp,
  offlineMinutesFor,
  parcelsAt,
  pickingMilliAt,
  pickingSlowBpAt,
  receiveMilliAt,
  rushed,
  starsFor,
  turnTicksFor,
  twistText,
  upgradeCost,
} from './rules.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

const BP = 10_000;

export interface Estimate {
  /** Cents a second at steady state, idle (no taps). */
  readonly incomePerSec: number;
  /** Orders a second shipped at steady state, in milli-orders. */
  readonly ordersPerSec: number;
  readonly full: boolean;
  readonly bottleneck: Bottleneck;
}

const BOTTLENECK_TEXT: Readonly<Record<BottleneckKind, string>> = {
  orders: 'Trucks are waiting for orders.',
  picking: 'Orders are piling up at picking.',
  stock: 'The shelves are running empty.',
  loading: 'Packed orders are queuing at the docks.',
  turnaround: 'Docks are busy swapping trucks.',
  timer: 'Trucks leave before they fill.',
};

/**
 * Orders a second the floor can actually take when orders average `mean`,
 * with `capacity` the slowest of picking, receiving and the docks. Sunvale's
 * sales bring orders faster than that for a minute, then slower: the backlog
 * and staging store what they can of the sale for the quiet spell.
 */
function supplyThroughput(twist: ReturnType<typeof derive>['twist'], mean: number, capacity: number, room: number): number {
  if (twist !== 'waves') return mean;
  const tickSec = T.tickMs.value / 1000;
  const base = mean / (meanOrderBp(twist) / BP);
  const waveSec = T.waveTicks.value * tickSec;
  const offSec = (T.wavePeriodTicks.value - T.waveTicks.value) * tickSec;
  const inWave = base * (T.waveOrderBp.value / BP);
  const offWave = base * (T.offWaveOrderBp.value / BP);
  const stored = Math.min(room, Math.max(0, inWave - capacity) * waveSec, Math.max(0, capacity - offWave) * offSec);
  return (Math.min(inWave, capacity) * waveSec + Math.min(offWave, capacity) * offSec + stored) / (waveSec + offSec);
}

/** What the running boosts change, for the estimate (RULES 15). */
export interface BoostEffect {
  /** Orders multiplier, basis points. */
  readonly orderBp: number;
  /** Every station rushed, counter orders included (RULES 6). */
  readonly rushed: boolean;
  /** Pay multiplier, basis points. */
  readonly payBp: number;
}

export const NO_BOOST: BoostEffect = { orderBp: BP, rushed: false, payBp: BP };

/** The effect of the boosts running in this state. */
export function runningBoosts(state: Pick<WarehouseState, 'boosts'>): BoostEffect {
  return {
    orderBp: state.boosts.flashSale.left > 0 ? T.flashSaleOrderBp.value : BP,
    rushed: state.boosts.allHands.left > 0,
    payBp: state.boosts.surge.left > 0 ? T.surgePayBp.value : BP,
  };
}

/**
 * The steady-state income estimate and the bottleneck (RULES 8, P6). A display
 * number derived from the levels, never stored in State, so it uses ordinary
 * arithmetic and rounds to whole cents at the end. With `boost`, the same
 * estimate as if those boosts ran for good (the boosted income on screen).
 */
export function estimate(state: WarehouseState, boost: BoostEffect = NO_BOOST): Estimate {
  const d = derive(state);
  const tickSec = T.tickMs.value / 1000;
  const parcels = d.parcels;
  const perSecond = (milli: number): number => (boost.rushed ? rushed(milli) : milli) / 1000 / tickSec;
  const orders = ((d.orderMilli / 1000) * (meanOrderBp(d.twist) / BP) * (boost.orderBp / BP)) / tickSec;
  const load = perSecond(d.loadMilli);
  const timer = d.departTicks * tickSec;
  const turnTicks = turnTicksFor(parcels, d.crewBp);
  const turn = (boost.rushed ? Math.ceil(turnTicks / T.rushTurnSpeed.value) : turnTicks) * tickSec;
  const fill = parcels / load;
  const cycle = Math.min(fill, timer) + turn;
  const capacity = (d.docks * Math.min(parcels, load * timer)) / cycle;
  // Picking takes orders from the backlog, a unit of stock each; receiving refills the shelves (RULES 3, 3a).
  const picking = perSecond(d.pickingMilli);
  const receiving = perSecond(d.receiveMilli);
  const floor = Math.min(picking, receiving);

  let throughput: number;
  let full: boolean;
  let kind: BottleneckKind;
  let fix: UpgradeId[];
  const supply = Math.min(floor, supplyThroughput(d.twist, orders, Math.min(capacity, floor), (d.stageCapMilli + d.backlogCapMilli) / 1000));
  // Rushed docks load counter orders when staging is empty (RULES 6): the docks are the limit.
  if (boost.rushed || supply >= capacity * 0.999) {
    throughput = capacity;
    full = fill <= timer;
    kind = !full ? 'timer' : fill >= turn ? 'loading' : 'turnaround';
    fix = kind === 'turnaround' ? ['crew', 'truck'] : ['loading', 'docks'];
  } else {
    full = (parcels * d.docks) / supply - turn <= timer;
    // Highmoor Crossdock: full trucks bring back a share of their load, already packed.
    const fed = full && d.twist === 'crossdock' ? supply / (1 - T.crossdockBp.value / BP) : supply;
    throughput = Math.min(capacity, fed);
    const held = supply >= floor * 0.999;
    if (held && receiving <= picking) {
      kind = 'stock';
      fix = ['receiving'];
    } else if (held) {
      kind = 'picking';
      fix = ['picking'];
    } else {
      kind = full ? 'orders' : 'timer';
      fix = ['sales'];
    }
  }
  const express = 1 + (expressChanceBp(state.stars) / BP) * (T.expressPayBp.value / BP - 1);
  const bonus = full ? 1 + T.fullBonusBp.value / BP : 1;
  const incomePerSec = Math.floor(throughput * d.payCents * bonus * express * (d.payMulBp / BP) * (boost.payBp / BP));
  return {
    incomePerSec,
    ordersPerSec: Math.floor(throughput * 1000),
    full,
    bottleneck: { kind, text: BOTTLENECK_TEXT[kind], fix },
  };
}

/** Model name of a truck of this size (a truck keeps its size after an upgrade). */
function modelFor(parcels: number): string {
  for (let level = 0; level <= T.maxTruckLevel.value; level++) if (parcelsAt(level) === parcels) return nameAt(TRUCK_MODELS, level);
  return nameAt(TRUCK_MODELS, 0);
}

const perSec = (milliPerTick: number): number => Math.floor((milliPerTick * 1000) / T.tickMs.value);

function effect(id: UpgradeId, level: number, state: WarehouseState, payMul: number): { unit: EffectUnit; value: number; name: string | null } {
  switch (id) {
    case 'docks':
      return { unit: 'count', value: (1 + level) * 1000, name: null };
    case 'truck':
      return { unit: 'parcels', value: parcelsAt(level) * 1000, name: nameAt(TRUCK_MODELS, level) };
    case 'loading':
      return { unit: 'ordersPerSec', value: perSec(loadMilliAt(level)), name: null };
    case 'sales':
      return { unit: 'ordersPerSec', value: perSec(orderMilliAt(level)), name: null };
    case 'picking':
      return { unit: 'ordersPerSec', value: perSec(pickingMilliAt(level, state.levels.contract)), name: null };
    case 'receiving':
      return { unit: 'ordersPerSec', value: perSec(receiveMilliAt(level)), name: null };
    case 'contract':
      return { unit: 'cents', value: mulDiv(payCentsAt(level), payMul, BP) * 1000, name: nameAt(CONTRACTS, level) };
    case 'crew':
      return { unit: 'seconds', value: turnTicksFor(parcelsAt(state.levels.truck), crewBpAt(level)) * T.tickMs.value, name: null };
    case 'night':
      return { unit: 'minutes', value: offlineMinutesFor(level, state.stars) * 1000, name: null };
  }
}

function upgradeView(id: UpgradeId, state: WarehouseState, payMul: number): UpgradeView {
  const level = state.levels[id];
  const max = maxLevel(id, state);
  const locked = lockReason(id, state);
  const cost = level >= max ? null : upgradeCost(id, level);
  const now = effect(id, level, state, payMul);
  const next = level >= max ? null : effect(id, level + 1, state, payMul);
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

/** Which boost fixes each bottleneck (RULES 8, 15). Peak rates pays whatever the bottleneck. */
const BOOST_FIXES: Readonly<Record<BottleneckKind, BoostId>> = {
  orders: 'flashSale',
  picking: 'allHands',
  stock: 'allHands',
  timer: 'flashSale',
  loading: 'allHands',
  turnaround: 'allHands',
};

function boostView(id: BoostId, state: WarehouseState, bottleneck: BottleneckKind): BoostView {
  const clock = state.boosts[id];
  const ticks = boostTicks(id, state.stars);
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

/** Every star perk, unlocked or not, and which selling now would unlock (RULES 10a). */
function perkViews(owned: number, claimable: number): PerkView[] {
  return PERK_IDS.map((id) => ({
    id,
    name: PERK_NAMES[id],
    effect: perkEffect(id),
    stars: perkStars(id),
    unlocked: hasPerk(id, owned),
    unlocksOnSale: !hasPerk(id, owned) && hasPerk(id, owned + claimable),
  }));
}

function siteView(sold: number): SiteView {
  const site = siteAt(sold);
  return { index: sold, name: site.label, twist: twistText(site.twist) };
}

/** The backlog and the pickers now (RULES 3). */
function pickingView(state: WarehouseState, d: ReturnType<typeof derive>, boost: BoostEffect): PickingView {
  const fast = state.pickRush > 0 || boost.rushed;
  const rate = fast ? rushed(d.pickingMilli) : d.pickingMilli;
  return {
    backlog: state.backlog,
    cap: d.backlogCapMilli,
    ratePerTick: rate,
    baseRatePerTick: d.pickingMilli,
    rushed: fast,
    waitTicks: rate === 0 ? 0 : Math.ceil(state.backlog / rate),
    slowBp: pickingSlowBpAt(state.levels.contract),
  };
}

/** The receiving dock and the shelves now (RULES 3a). */
function receivingView(state: WarehouseState, d: ReturnType<typeof derive>, boost: BoostEffect): ReceivingView {
  const fast = state.receiveRush > 0 || boost.rushed;
  return {
    stock: state.stock,
    shelfCap: d.shelfCapMilli,
    ratePerTick: fast ? rushed(d.receiveMilli) : d.receiveMilli,
    baseRatePerTick: d.receiveMilli,
    rushed: fast,
    po: state.po,
  };
}

/** Everything the interface reads (S6, P5). */
export function warehouseView(state: WarehouseState): WarehouseView {
  const d = derive(state);
  const est = estimate(state);
  const boost = runningBoosts(state);
  const anyBoost = boost.orderBp !== BP || boost.rushed || boost.payBp !== BP;
  const boosted = anyBoost ? estimate(state, boost).incomePerSec : est.incomePerSec;
  const rushRate = rushed(d.loadMilli);
  const docks: DockView[] = state.docks.map((g, index) => {
    const fast = g.rush > 0 || boost.rushed;
    return { ...g, index, model: modelFor(g.parcels), rate: fast ? rushRate : d.loadMilli, rushed: fast };
  });
  const claimable = starsFor(state.run.earned);
  return {
    tick: state.tick,
    tickMs: T.tickMs.value,
    cash: state.cash,
    incomePerSec: est.incomePerSec,
    boostedIncomePerSec: Math.max(est.incomePerSec, boosted),
    ordersPerSec: est.ordersPerSec,
    pay: mulDiv(d.payCents, d.payMulBp, BP),
    contract: nameAt(CONTRACTS, state.levels.contract),
    truckModel: nameAt(TRUCK_MODELS, state.levels.truck),
    staging: { staged: state.staged, cap: d.stageCapMilli, orderPerTick: mulDiv(mulDiv(d.orderMilli, orderBpAt(d.twist, state.tick), BP), boost.orderBp, BP) },
    picking: pickingView(state, d, boost),
    receiving: receivingView(state, d, boost),
    journey: journeyAt(state.levels.contract),
    docks,
    upgrades: UPGRADE_IDS.map((id) => upgradeView(id, state, d.payMulBp)),
    bottleneck: est.bottleneck,
    boosts: BOOST_IDS.map((id) => boostView(id, state, est.bottleneck.kind)),
    site: siteView(state.site),
    stars: {
      owned: state.stars,
      claimable,
      nextAt: earnedForStars(claimable + 1),
      bonusBp: BP + state.stars * T.starBonusBp.value,
      bonusAfterBp: BP + (state.stars + claimable) * T.starBonusBp.value,
      nextSite: siteView(state.site + 1),
      perks: perkViews(state.stars, claimable),
    },
    offlineCapMinutes: offlineMinutesFor(state.levels.night, state.stars),
    run: state.run,
    life: state.life,
  };
}
