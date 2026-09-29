/**
 * @nations/harness - headless balance runner and repo invariant checks.
 *
 * Runs in Node, may use Node APIs, and is the only package that both drives the
 * sim and inspects the repo. Job (docs/ROADMAP.md, "Balance harness"): run many
 * seeded games with bot archetypes and write one metrics row per game, plus
 * check the invariants that must hold on every build - conservation, no negative
 * stocks, stable state hash.
 *
 * Holds the seeded runs and CSV metrics, the Node-vs-browser determinism
 * check, the 1,000-tick catch-up benchmark, the archetype bots, the Gate 1
 * and Gate 2 suites, and the prediction-mode report (see cli.ts for commands).
 */
export { benchCatchUp, hashSeeds, runGame, type GameMetrics, type GameOptions } from './game.ts';
export { CSV_COLUMNS, formatSummary, summarize, toCsv, type Summary } from './metrics.ts';
export { loadRoster } from './roster.ts';
export { ARCHETYPES, STRATEGIES, botDecide, type Strategy } from './bots.ts';
export { assignArchetypes, formatGate2, runGate2, type Gate2Options, type Gate2Report } from './gate2.ts';
export { findChromium, runInBrowser, type BrowserRun, type BrowserRunOptions } from './browser.ts';
