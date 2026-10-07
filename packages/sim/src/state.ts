import type { WarehouseState, Boosts, DockState, Levels, PoState, RngState, Stats } from '@warehouse/contracts';
import { startingCashFor, startingDockLevelFor } from './perks.ts';
import { seedRng } from './rng.ts';
import { derive, type Derived } from './rules.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { createWms } from './wms/generate.ts';

/** Current warehouse save schema. Bump it with a migration in save.ts. */
export const WAREHOUSE_SCHEMA_VERSION = 5;

export const EMPTY_STATS: Stats = { earned: 0, shipments: 0, fullShipments: 0, orders: 0, missed: 0, expresses: 0, pos: 0, received: 0, taps: 0 };

export const ZERO_LEVELS: Levels = { docks: 0, truck: 0, loading: 0, sales: 0, picking: 0, receiving: 0, contract: 0, crew: 0, night: 0 };

/** Every boost recharged and not running (RULES 15). */
export const READY_BOOSTS: Boosts = { flashSale: { left: 0, recharge: 0 }, allHands: { left: 0, recharge: 0 }, surge: { left: 0, recharge: 0 } };

/** A truck backing into a dock (RULES 4). The express roll is the caller's. */
export function arrivingDock(truck: number, d: Derived, express: boolean, rush = 0): DockState {
  return { truck, parcels: d.parcels, loaded: 0, timer: d.departTicks, timerMax: d.departTicks, turn: 0, turnMax: 0, rush, express };
}

/** A new PO at the receiving dock (RULES 3a). */
export function arrivingPo(id: number, d: Derived): PoState {
  return { id, units: d.poUnits, received: 0 };
}

export interface CreateWarehouseOptions {
  readonly seed: number;
  /** Warehouses sold before this one: picks the site. */
  readonly site?: number;
  readonly stars?: number;
  readonly life?: Stats;
}

/** A brand-new warehouse: one dock with a truck loading, orders already packed, shelves half full. */
export function createWarehouse(options: CreateWarehouseOptions): WarehouseState {
  return openWarehouse({
    tick: 0,
    rng: seedRng(options.seed),
    site: options.site ?? 0,
    stars: options.stars ?? 0,
    life: options.life ?? EMPTY_STATS,
    nextTruck: 1,
    nextPo: 1,
  });
}

/**
 * The warehouse for a site, keeping the clock, the RNG, stars, lifetime stats,
 * and truck and PO numbering. Head start and Second dock (RULES 10a) open it
 * with more cash and docks. Each site opens a fresh WMS (docs/wms-plan.md),
 * seeded from the warehouse seed and the site.
 */
export function openWarehouse(keep: {
  readonly tick: number;
  readonly rng: RngState;
  readonly site: number;
  readonly stars: number;
  readonly life: Stats;
  readonly nextTruck: number;
  readonly nextPo: number;
}): WarehouseState {
  const levels: Levels = { ...ZERO_LEVELS, docks: startingDockLevelFor(keep.stars) };
  const d = derive({ site: keep.site, stars: keep.stars, levels });
  const docks = Array.from({ length: d.docks }, (_, i) => arrivingDock(keep.nextTruck + i, d, false));
  return {
    schemaVersion: WAREHOUSE_SCHEMA_VERSION,
    tick: keep.tick,
    rng: keep.rng,
    cash: startingCashFor(keep.stars),
    backlog: 0,
    pickRush: 0,
    staged: T.startingStaged.value * 1000,
    stock: Math.min(T.startingStock.value * 1000, d.shelfCapMilli),
    po: arrivingPo(keep.nextPo, d),
    receiveRush: 0,
    levels,
    docks,
    nextTruck: keep.nextTruck + docks.length,
    site: keep.site,
    stars: keep.stars,
    boosts: READY_BOOSTS,
    run: EMPTY_STATS,
    life: keep.life,
    wms: createWms({ seed: keep.rng.seed + keep.site, tick: keep.tick, contract: 0 }),
  };
}
