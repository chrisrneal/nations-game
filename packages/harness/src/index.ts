/**
 * @nations/harness - headless balance runner and repo invariant checks.
 *
 * Runs in Node, may use Node APIs, and is the only package that both drives the
 * sim and inspects the repo. Job (docs/ROADMAP.md, "Balance harness"): run many
 * seeded games with bot archetypes and write one metrics row per game, plus
 * check the invariants that must hold on every build - conservation, no negative
 * stocks, stable state hash.
 *
 * Phase 0: the purity invariant is real (see purity.test.ts); the game runner is
 * a placeholder until the sim has a step function.
 */
export const HARNESS_PLACEHOLDER_MESSAGE =
  'harness: placeholder - no sim to run yet (Phase 0)';
