import type { BoostId, UpgradeId, WarehouseState } from '@warehouse/contracts';
import { CHECKPOINTS, CONTRACTS, nameAt, siteAt, type SiteTwist } from './catalog.ts';
import { grow, isqrt, mulDiv } from './math.ts';
import { longShiftMinutes, rechargeFor } from './perks.ts';
import { WAREHOUSE_TUNABLES as T, type WarehouseTunableId } from './tunables.ts';

/**
 * The formulas of docs/RULES.md sections 3-10, as pure functions of the state's
 * levels. Tunables are read at call time so a harness sweep can override them.
 */

const BP = 10_000;

export function cashCap(): number {
  return T.cashCapCents.value;
}

/** Parcels a truck of this level holds (RULES 4). */
export function parcelsAt(level: number): number {
  return grow(T.truckParcelsBase.value, T.truckParcelsGrowthBp.value, level);
}

/** Departure timer, in ticks, for a truck of this many parcels. */
export function departTicksFor(parcels: number): number {
  return T.departBaseTicks.value + T.departTicksPerParcel.value * parcels;
}

/** Swap-time multiplier for this yard crew level, in basis points. */
export function crewBpAt(level: number): number {
  return grow(BP, T.crewTurnBp.value, level);
}

/** Truck swap, in ticks, after a truck of this many parcels leaves (RULES 5.5). */
export function turnTicksFor(parcels: number, crewBp: number): number {
  const raw = T.turnBaseTicks.value + Math.floor(parcels / T.turnParcelsPerTick.value);
  return Math.max(T.turnMinTicks.value, mulDiv(raw, crewBp, BP));
}

export function loadMilliAt(level: number): number {
  return grow(T.loadBaseMilliPerTick.value, T.loadGrowthBp.value, level);
}

export function orderMilliAt(level: number): number {
  return grow(T.orderBaseMilliPerTick.value, T.orderGrowthBp.value, level);
}

/** Staging space, in milli-orders. */
export function stageCapMilliAt(level: number): number {
  return grow(T.stagingCapBase.value, T.stagingCapGrowthBp.value, level) * 1000;
}

/** Milli-units put away a tick at this receiving level (RULES 3a), before extra hands. */
export function receiveMilliAt(level: number): number {
  return grow(T.receiveBaseMilliPerTick.value, T.receiveGrowthBp.value, level);
}

/** Shelf space, in milli-units. */
export function shelfCapMilliAt(level: number): number {
  return grow(T.shelfCapBase.value, T.shelfCapGrowthBp.value, level) * 1000;
}

/** Units on a PO: `poTicks` of put-away at this rate, rounded up to a whole unit. */
export function poUnitsFor(receiveMilli: number): number {
  return Math.max(1, Math.ceil((receiveMilli * T.poTicks.value) / 1000));
}

export function payCentsAt(level: number): number {
  return grow(T.payBaseCents.value, T.payGrowthBp.value, level);
}

export function twistOf(state: Pick<WarehouseState, 'site'>): SiteTwist {
  return siteAt(state.site).twist;
}

/** Pay multiplier from the site and owned stars, in basis points (RULES 5.4, 10). */
export function payMulBp(state: Pick<WarehouseState, 'site' | 'stars'>): number {
  const site = twistOf(state) === 'narrowYard' ? T.narrowYardPayBp.value : BP;
  return mulDiv(site, BP + state.stars * T.starBonusBp.value, BP);
}

/** Sunvale's sale-season multiplier at this tick, basis points; 10000 elsewhere. */
export function orderBpAt(twist: SiteTwist, tick: number): number {
  if (twist !== 'waves') return BP;
  return tick % T.wavePeriodTicks.value < T.waveTicks.value ? T.waveOrderBp.value : T.offWaveOrderBp.value;
}

/** The average of `orderBpAt` over a cycle (for the estimate). */
export function meanOrderBp(twist: SiteTwist): number {
  if (twist !== 'waves') return BP;
  const period = T.wavePeriodTicks.value;
  const wave = T.waveTicks.value;
  return Math.floor((T.waveOrderBp.value * wave + T.offWaveOrderBp.value * (period - wave)) / period);
}

/** Export stations open at this contract level (export paperwork, customs): each slows picking (RULES 3). */
export function slowCheckpointsAt(contract: number): number {
  return CHECKPOINTS.filter((c) => c.way === 'outbound' && c.slowsPicking && contract >= c.fromContract).length;
}

/** Picking's speed multiplier at this contract level, basis points: x`exportCheckBp` per export station. */
export function pickingSlowBpAt(contract: number): number {
  return grow(BP, T.exportCheckBp.value, slowCheckpointsAt(contract));
}

/** Milli-items in an order at this contract level (RULES 3b): bigger customers send bigger orders. */
export function itemsMilliAt(contract: number): number {
  return T.itemsBaseMilli.value + T.itemsPerContractMilli.value * contract;
}

/** Milli-items picked a tick (RULES 3, 3b), before any extra pickers. */
export function pickingItemsMilliAt(level: number, contract: number): number {
  return mulDiv(grow(T.pickingBaseMilliPerTick.value, T.pickingGrowthBp.value, level), pickingSlowBpAt(contract), BP);
}

/** Milli-orders picked a tick (RULES 3, 3b), before any extra pickers: the items picked, in orders of this contract's size. */
export function pickingMilliAt(level: number, contract: number): number {
  return mulDiv(pickingItemsMilliAt(level, contract), 1000, itemsMilliAt(contract));
}

/** The longest backlog customers accept, milli-orders: `backlogWaitTicks` of picking. */
export function backlogCapMilliFor(pickingMilli: number): number {
  return pickingMilli * T.backlogWaitTicks.value;
}

/** A rushed station's rate (RULES 6). */
export function rushed(milli: number): number {
  return mulDiv(milli, T.rushLoadBp.value, BP);
}

const COST: Readonly<Record<UpgradeId, readonly [WarehouseTunableId, WarehouseTunableId]>> = {
  docks: ['docksCostBase', 'docksCostGrowthBp'],
  truck: ['truckCostBase', 'truckCostGrowthBp'],
  loading: ['loadCostBase', 'loadCostGrowthBp'],
  sales: ['salesCostBase', 'salesCostGrowthBp'],
  picking: ['pickingCostBase', 'pickingCostGrowthBp'],
  receiving: ['receivingCostBase', 'receivingCostGrowthBp'],
  contract: ['contractCostBase', 'contractCostGrowthBp'],
  crew: ['crewCostBase', 'crewCostGrowthBp'],
  night: ['nightCostBase', 'nightCostGrowthBp'],
};

/** Cents for the level after `level` (RULES 7): base x growth^level. */
export function upgradeCost(id: UpgradeId, level: number): number {
  const [base, growth] = COST[id];
  return grow(T[base].value, T[growth].value, level, cashCap());
}

/** Highest level this upgrade can reach at this site. */
export function maxLevel(id: UpgradeId, state: Pick<WarehouseState, 'site'>): number {
  const truckMax = twistOf(state) === 'narrowYard' ? Math.min(T.maxTruckLevel.value, T.narrowYardMaxTruck.value) : T.maxTruckLevel.value;
  switch (id) {
    case 'docks':
      return T.maxDocks.value - 1;
    case 'truck':
    case 'contract':
      return truckMax;
    case 'loading':
      return T.maxLoadLevel.value;
    case 'sales':
      return T.maxSalesLevel.value;
    case 'picking':
      return T.maxPickingLevel.value;
    case 'receiving':
      return T.maxReceivingLevel.value;
    case 'crew':
      return T.maxCrewLevel.value;
    case 'night':
      return T.maxNightLevel.value;
  }
}

/** Why the next level cannot be bought, cash aside; null if it can. */
export function lockReason(id: UpgradeId, state: Pick<WarehouseState, 'site' | 'levels'>): string | null {
  if (state.levels[id] >= maxLevel(id, state)) {
    const yard = (id === 'truck' || id === 'contract') && twistOf(state) === 'narrowYard' && state.levels[id] < T.maxTruckLevel.value;
    return yard ? 'Narrow yard' : 'Maxed out';
  }
  if (id === 'contract' && state.levels.contract >= state.levels.truck) return 'Needs bigger trucks first';
  return null;
}

/** Offline cap in minutes for a night-shift level (RULES 9). */
export function offlineMinutesAt(level: number): number {
  return Math.min(T.offlineMaxMinutes.value, grow(T.offlineBaseMinutes.value, T.offlineGrowthBp.value, level));
}

/** Offline cap in minutes for a night-shift level and stars owned: Long shift lengthens it (RULES 10a). */
export function offlineMinutesFor(level: number, stars: number): number {
  return longShiftMinutes(offlineMinutesAt(level), stars);
}

/** Offline cap in ticks: the most the host may catch up after an absence. */
export function offlineCapTicks(state: Pick<WarehouseState, 'levels' | 'stars'>): number {
  return Math.floor((offlineMinutesFor(state.levels.night, state.stars) * 60_000) / T.tickMs.value);
}

/** Stars a warehouse that has earned this many cents is worth (RULES 10). */
export function starsFor(earned: number): number {
  return isqrt(Math.floor(earned / T.starUnitCents.value));
}

/** Cents earned at which a warehouse is worth `n` stars. */
export function earnedForStars(n: number): number {
  return n * n * T.starUnitCents.value;
}

/** The numbers a tick needs, computed once per level change (P4: catch-up stays cheap). */
export interface Derived {
  readonly docks: number;
  readonly parcels: number;
  readonly departTicks: number;
  readonly loadMilli: number;
  readonly orderMilli: number;
  readonly stageCapMilli: number;
  /** Picking per tick, export stations included, extra pickers not. */
  readonly pickingMilli: number;
  readonly backlogCapMilli: number;
  readonly receiveMilli: number;
  /** Milli-items in an order, each a unit of stock (RULES 3b). */
  readonly itemsMilli: number;
  readonly shelfCapMilli: number;
  readonly poUnits: number;
  readonly payCents: number;
  readonly crewBp: number;
  readonly payMulBp: number;
  readonly twist: SiteTwist;
}

export function derive(state: Pick<WarehouseState, 'levels' | 'site' | 'stars'>): Derived {
  const { levels } = state;
  const parcels = parcelsAt(levels.truck);
  const pickingMilli = pickingMilliAt(levels.picking, levels.contract);
  const receiveMilli = receiveMilliAt(levels.receiving);
  return {
    docks: 1 + levels.docks,
    parcels,
    departTicks: departTicksFor(parcels),
    loadMilli: loadMilliAt(levels.loading),
    orderMilli: orderMilliAt(levels.sales),
    stageCapMilli: stageCapMilliAt(levels.sales),
    pickingMilli,
    backlogCapMilli: backlogCapMilliFor(pickingMilli),
    receiveMilli,
    itemsMilli: itemsMilliAt(levels.contract),
    shelfCapMilli: shelfCapMilliAt(levels.receiving),
    poUnits: poUnitsFor(receiveMilli),
    payCents: payCentsAt(levels.contract),
    crewBp: crewBpAt(levels.crew),
    payMulBp: payMulBp(state),
    twist: twistOf(state),
  };
}

/** Site twist in one line, numbers from the tunables. */
export function twistText(twist: SiteTwist): string {
  const pct = (bp: number): number => Math.round(Math.abs(bp - BP) / 100);
  switch (twist) {
    case 'none':
      return 'A small depot to learn the ropes. No twist.';
    case 'narrowYard':
      return `Narrow yard: trucks stop at size ${T.narrowYardMaxTruck.value + 1}, but every order pays +${pct(T.narrowYardPayBp.value)}%.`;
    case 'crossdock':
      return `Crossdock: every full truck brings back ${Math.round(T.crossdockBp.value / 100)}% of its load as cross-dock orders, already packed.`;
    case 'waves': {
      const secs = (ticks: number): number => Math.round((ticks * T.tickMs.value) / 1000);
      return `Sale season: ${secs(T.waveTicks.value)} s of ${T.waveOrderBp.value / BP}x orders every ${Math.round(secs(T.wavePeriodTicks.value) / 60)} minutes, quieter between.`;
    }
  }
}

const BOOST_CLOCK: Readonly<Record<BoostId, readonly [WarehouseTunableId, WarehouseTunableId]>> = {
  flashSale: ['flashSaleTicks', 'flashSaleRechargeTicks'],
  allHands: ['allHandsTicks', 'allHandsRechargeTicks'],
  surge: ['surgeTicks', 'surgeRechargeTicks'],
};

/** A boost's length and recharge in ticks (RULES 15), with Quick charge for the stars owned (RULES 10a). */
export function boostTicks(id: BoostId, stars = 0): { readonly length: number; readonly recharge: number } {
  const [length, recharge] = BOOST_CLOCK[id];
  return { length: T[length].value, recharge: rechargeFor(T[recharge].value, T[length].value, stars) };
}


/** What opens a boost, short enough for its button, or null once it is open. */
export function boostLock(id: BoostId, state: Pick<WarehouseState, 'levels'>): string | null {
  if (id === 'allHands' && 1 + state.levels.docks < T.allHandsMinDocks.value) return `Needs ${T.allHandsMinDocks.value} docks`;
  if (id === 'surge' && state.levels.contract < T.surgeMinContract.value) return `Needs ${nameAt(CONTRACTS, T.surgeMinContract.value)}`;
  return null;
}

/** Why a boost cannot be used now, or null if a tap would use it. */
export function boostProblem(id: BoostId, state: Pick<WarehouseState, 'levels' | 'boosts'>): string | null {
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
    case 'flashSale':
      return `${T.flashSaleOrderBp.value / BP}x orders for ${secs} s`;
    case 'allHands':
      return `Everyone rushed for ${secs} s`;
    case 'surge':
      return `${T.surgePayBp.value / BP}x pay for ${secs} s`;
  }
}
