/**
 * @nations/sim - the pure simulation core.
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness:
 * no DOM, no network, no Date, no Math.random, no imports except
 * @nations/contracts. Randomness comes from the seeded RNG inside State,
 * economy maths uses integers, iteration order over nations is stable.
 *
 * Phase 0 placeholder: the step function, RNG and tunable values arrive with
 * the next prompt. Nothing here yet by design - this prompt sets up the repo
 * and adds no game logic.
 *
 * Shape to come (seam 1):
 *   step(state: State, commands: readonly Command[]): { state: State; events: readonly Event[] }
 */
export { TUNABLES } from './tunables.ts';
