/**
 * @nations/sim - the pure simulation core.
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness:
 * no DOM, no network, no Date, no Math.random, no imports except
 * @nations/contracts. Randomness comes from the seeded RNG inside State,
 * economy maths uses integers, iteration order over nations is stable.
 *
 * Surface (seam 1): step(state, commands) -> { state, events }. A host drives
 * it through `Session` (queue + tick + command log + saves); UI and AI read
 * only `viewFor(state, nationId)`.
 */
export { TUNABLES } from './tunables.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export {
  SCHEMA_VERSION,
  createWorld,
  nationId,
  type CreateWorldOptions,
  type NationPrivate,
  type NationPublic,
  type NationRecord,
  type RosterEntry,
  type WorldState,
} from './world.ts';
export {
  COMMAND_TYPES,
  validateCommand,
  validateCommandShape,
  type PingCommand,
  type SetControllerCommand,
  type SimCommand,
} from './commands.ts';
export { canonicalOrder, step, type StepResult } from './step.ts';
export { viewFor, type ForeignNation, type NationView } from './view.ts';
export { CommandQueue, type SubmitResult } from './queue.ts';
export { MIGRATIONS, createSave, loadSave, migrateSave, type LoadedGame, type SimSaveFile } from './save.ts';
export { Session } from './session.ts';
