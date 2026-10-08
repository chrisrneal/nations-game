/**
 * @warehouse/sim - the pure simulation core of the warehouse game (docs/RULES.md).
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness: no DOM,
 * no network, no clock, no Math.random, no imports except @warehouse/contracts.
 * Randomness comes from the seeded RNG inside State; all game maths uses
 * integers (cents, units, ticks, basis points).
 *
 * Surface (S1): `step(state, commands) -> { state, events }`, `advanceMany` for
 * catch-up (P4), and `WarehouseSession` for a host. The interface reads only
 * `warehouseView(state)`.
 */
export { WAREHOUSE_TUNABLES, type WarehouseTunableId } from './tunables.ts';
export { grow, isqrt, mulDiv } from './math.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export { DAY_MINUTES, dayAt, dayStartTick, minuteOfDay } from './clock.ts';
export { WAREHOUSE_SCHEMA_VERSION, createWarehouse, offlineCapTicks, type CreateWarehouseOptions } from './state.ts';
export { warehouseCommandProblem } from './commands.ts';
export { advanceMany, step, step as stepWarehouse, type WarehouseStepResult } from './step.ts';
export { warehouseView } from './view.ts';
export { WAREHOUSE_MIGRATIONS, createWarehouseSave, loadWarehouseSave, migrateWarehouseSave, replay, type LoadedWarehouse } from './save.ts';
export { WarehouseSession, type WarehouseSubmitResult } from './session.ts';
export {
  WMS_AISLES,
  WMS_AISLE_GAP_BAYS,
  WMS_BAYS,
  WMS_BINS_PER_BAY,
  WMS_CUSTOMERS,
  WMS_DESTINATIONS,
  WMS_FIRST_ORDER_NO,
  WMS_FIRST_PO_NO,
  WMS_SKUS,
  WMS_SUPPLIERS,
  binCode,
  binPlace,
  customerAt,
  destinationAt,
  familyOf,
  orderCode,
  poCode,
  skuAt,
  supplierAt,
  taskCode,
  travelBays,
  workerCode,
  type WmsDestination,
  type WmsSku,
  type WmsSupplier,
} from './wms/catalog.ts';
export { createWms } from './wms/generate.ts';
export { binFullUnits } from './wms/inbound.ts';
export { WMS_PICK_RULES, WMS_RELEASE_MODES, defaultPolicy, doorCost, hireCost, shipDoorCost } from './wms/policy.ts';
export { PICK_RULE_NAMES, RELEASE_NAMES, eventText, wmsView } from './wms/view.ts';
