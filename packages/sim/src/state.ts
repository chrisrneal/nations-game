import type { WarehouseState } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { createWms } from './wms/generate.ts';

/** Current warehouse save schema. Bump it with a migration in save.ts. */
export const WAREHOUSE_SCHEMA_VERSION = 8;

export interface CreateWarehouseOptions {
  readonly seed: number;
}

/** A brand-new warehouse (RULES 3): the WMS seeded from `seed`, opening cash, the clock at tick 0. */
export function createWarehouse(options: CreateWarehouseOptions): WarehouseState {
  return { schemaVersion: WAREHOUSE_SCHEMA_VERSION, tick: 0, cash: T.startingCashCents.value, wms: createWms({ seed: options.seed, tick: 0 }) };
}

/** Ticks the warehouse runs while the app is closed, at most (RULES 11). */
export function offlineCapTicks(): number {
  return Math.floor((T.offlineCapMinutes.value * 60_000) / T.tickMs.value);
}
