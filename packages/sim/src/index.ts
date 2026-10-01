/**
 * @airport/sim - the pure simulation core of the airport game (docs/RULES.md).
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness: no DOM,
 * no network, no clock, no Math.random, no imports except @airport/contracts.
 * Randomness comes from the seeded RNG inside State; all game maths uses
 * integers (cents, milli-passengers, ticks, basis points).
 *
 * Surface (S1): `step(state, commands) -> { state, events }`, `advanceMany` for
 * catch-up (P4), and `AirportSession` for a host. The interface reads only
 * `airportView(state)`.
 */
export { AIRPORT_TUNABLES, type AirportTunableId } from './tunables.ts';
export { CITIES, PLANE_MODELS, ROUTES, UPGRADE_IDS, UPGRADE_TEXT, cityAt } from './catalog.ts';
export { grow, isqrt, mulDiv } from './math.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
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
export { advanceMany, step, step as stepAirport, type AirportStepResult } from './step.ts';
export { airportView, estimate, type Estimate } from './view.ts';
export { AIRPORT_MIGRATIONS, createAirportSave, loadAirportSave, migrateAirportSave, replay, type LoadedAirport } from './save.ts';
export { AirportSession, type AirportSubmitResult } from './session.ts';
