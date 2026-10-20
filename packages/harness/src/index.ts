/**
 * @snacks/harness - headless Snack Attack and repo invariant checks.
 *
 * Runs in Node and may use Node APIs. Holds the generator report (every
 * generated day checked against RULES 10), the Node-vs-Chromium determinism
 * check, the generation benchmark, and the purity and RULES-table tests.
 * See cli.ts for the commands.
 */
export { benchGeneration, checkDays, checkPuzzle, hashGames, type DayCheck } from './games.ts';
export { formatReport, runReport, type KindReport } from './report.ts';
export { findChromium, runInBrowser, type BrowserRun, type BrowserRunOptions } from './browser.ts';
