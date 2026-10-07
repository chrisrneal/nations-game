/**
 * @warehouse/harness - headless runs of the warehouse and repo invariant checks.
 *
 * Runs in Node and may use Node APIs. Holds the pacing pass (greedy and idle
 * bots timed against docs/RULES.md section 11), the Node-vs-Chromium
 * determinism check, the catch-up benchmark, and the purity and RULES-table
 * tests. See cli.ts for the commands.
 */
export { benchWarehouseCatchUp, busyWarehouse, hashWarehouseSeeds, scriptedWarehouse } from './warehouse.ts';
export { bestUpgrade, earnedOver, formatPacing, runGreedy, runIdle, runPacing, wantsToSell, type BotRun, type PacingReport } from './pacing.ts';
export { findChromium, runInBrowser, type BrowserRun, type BrowserRunOptions } from './browser.ts';
export { applyOverrides, parseOverrides } from './overrides.ts';
export { LOAD_LINES, LOAD_ORDERS, wmsUnderLoad } from './wms-load.ts';
