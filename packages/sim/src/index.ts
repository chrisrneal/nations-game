/**
 * @nations/sim - the pure simulation core.
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness:
 * no DOM, no network, no clock, no Math.random, no imports except
 * @nations/contracts. Randomness comes from the seeded RNG inside State,
 * economy maths uses integers, iteration order over nations is stable.
 *
 * Surface (seam 1): step(state, commands) -> { state, events }. A host drives
 * it through `Session` (queue + tick + command log + saves); UI and AI read
 * only `viewFor(state, nationId)`.
 */
export { TUNABLES, type RuleValues, type TunableId } from './tunables.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export {
  NEUTRAL_ENDOWMENT,
  SCHEMA_VERSION,
  createWorld,
  defaultPolicy,
  nationId,
  startingResilience,
  type CreateWorldOptions,
  type NationPrivate,
  type NationPublic,
  type NationRecord,
  type RosterEntry,
  type WorldState,
} from './world.ts';
export { rosterFromWorldData } from './data.ts';
export {
  flowsFor,
  isFair,
  potentialOutput,
  referencePrices,
  shortfallPenaltyBp,
  structuralBalance,
  valueMilli,
} from './economy.ts';
export { startingTrust } from './trust.ts';
export { policyAnswer, type PolicyAnswer } from './trade.ts';
export { ownScoreBp, scoreboard, type NationScore, type Scoreboard } from './score.ts';
export { POOL_OF, exposureFor, hitBp, rulePayment } from './crisis.ts';
export { buildRecap } from './recap.ts';
export {
  COMMAND_TYPES,
  MAX_CONTRIBUTION_BP,
  RESOURCES,
  validateCommand,
  validateCommandShape,
  type AcceptOfferCommand,
  type ContributeCommand,
  type CounterOfferCommand,
  type DeclineAppealCommand,
  type PledgeCommand,
  type WithdrawPledgeCommand,
  type FundResilienceCommand,
  type MakeOfferCommand,
  type PingCommand,
  type RejectOfferCommand,
  type SetControllerCommand,
  type SetPolicyCommand,
  type SimCommand,
  type WithdrawOfferCommand,
} from './commands.ts';
export { canonicalOrder, step, type StepResult } from './step.ts';
export { refreshRules, viewFor, type ForeignNation, type NationView } from './view.ts';
export { CommandQueue, type SubmitResult } from './queue.ts';
export { MIGRATIONS, createSave, loadSave, migrateSave, type LoadedGame, type SimSaveFile } from './save.ts';
export { Session } from './session.ts';
