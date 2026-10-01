/**
 * The airport game's sim (docs/RULES.md). Pure, like the rest of packages/sim:
 * imports only @nations/contracts and its own files. Built beside the Nations
 * sim until slice 8 (P8).
 */
export { AIRPORT_TUNABLES, type AirportTunableId } from './tunables.ts';
export { CITIES, PLANE_MODELS, ROUTES, UPGRADE_IDS, UPGRADE_TEXT, cityAt } from './catalog.ts';
export { grow, isqrt, mulDiv } from './math.ts';
export { hashState } from '../hash.ts';
export {
  derive,
  earnedForSlots,
  lockReason,
  maxLevel,
  offlineCapTicks,
  offlineMinutesAt,
  seatsAt,
  slotsFor,
  upgradeCost,
  type Derived,
} from './rules.ts';
export { AIRPORT_SCHEMA_VERSION, EMPTY_STATS, createAirport, type CreateAirportOptions } from './state.ts';
export { airportCommandProblem } from './commands.ts';
export { advanceMany, step as stepAirport, type AirportStepResult } from './step.ts';
export { airportView, estimate, type Estimate } from './view.ts';
export { AIRPORT_MIGRATIONS, createAirportSave, loadAirportSave, migrateAirportSave, replay, type LoadedAirport } from './save.ts';
export { AirportSession, type AirportSubmitResult } from './session.ts';
