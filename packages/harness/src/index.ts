/**
 * @nations/harness - headless balance runner and repo invariant checks.
 *
 * Runs in Node, may use Node APIs, and is the only package that both drives the
 * sim and inspects the repo. Job (docs/ROADMAP.md, "Balance harness"): run many
 * seeded games with bot archetypes and write one metrics row per game, plus
 * check the invariants that must hold on every build - conservation, no negative
 * stocks, stable state hash.
 *
 * Phase 0: seeded games with the dummy AI, CSV metrics, the Node-vs-browser
 * determinism check and the 1,000-tick catch-up benchmark. Archetype bots
 * arrive with the economy.
 */
export { benchCatchUp, hashSeeds, runGame, type GameMetrics, type GameOptions } from './game.ts';
export { CSV_COLUMNS, formatSummary, summarize, toCsv, type Summary } from './metrics.ts';
export { loadRoster } from './roster.ts';
export { findChromium, runInBrowser, type BrowserRun, type BrowserRunOptions } from './browser.ts';
