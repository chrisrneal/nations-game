/**
 * @warehouse/sim - the pure simulation core of the warehouse game (docs/RULES.md).
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness: no DOM,
 * no network, no clock, no Math.random, no imports except @warehouse/contracts.
 * Randomness comes from the seeded RNG inside State; all game maths uses
 * integers (cents, milli-orders, ticks, basis points).
 *
 * Surface (S1): `step(state, commands) -> { state, events }`, `advanceMany` for
 * catch-up (P4), and `WarehouseSession` for a host. The interface reads only
 * `warehouseView(state)`.
 */
export { WAREHOUSE_TUNABLES, type WarehouseTunableId } from './tunables.ts';
export { BOOST_IDS, BOOST_NAMES, CHECKPOINTS, SITES, TRUCK_MODELS, CONTRACTS, UPGRADE_IDS, UPGRADE_TEXT, siteAt, journeyAt } from './catalog.ts';
export { grow, isqrt, mulDiv } from './math.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export {
  boostLock,
  boostProblem,
  boostTicks,
  derive,
  earnedForStars,
  lockReason,
  maxLevel,
  offlineCapTicks,
  offlineMinutesAt,
  offlineMinutesFor,
  parcelsAt,
  poUnitsFor,
  receiveMilliAt,
  itemsMilliAt,
  shelfCapMilliAt,
  starsFor,
  upgradeCost,
  type Derived,
} from './rules.ts';
export { PERK_IDS, PERK_NAMES, expressChanceBp, hasPerk, perkEffect, perkStars } from './perks.ts';
export { WAREHOUSE_SCHEMA_VERSION, EMPTY_STATS, READY_BOOSTS, createWarehouse, type CreateWarehouseOptions } from './state.ts';
export { warehouseCommandProblem } from './commands.ts';
export { advanceMany, step, step as stepWarehouse, type WarehouseStepResult } from './step.ts';
export { NO_BOOST, warehouseView, estimate, runningBoosts, type BoostEffect, type Estimate } from './view.ts';
export { WAREHOUSE_MIGRATIONS, createWarehouseSave, loadWarehouseSave, migrateWarehouseSave, replay, type LoadedWarehouse } from './save.ts';
export { WarehouseSession, type WarehouseSubmitResult } from './session.ts';
