/**
 * Runs inside Chromium for the determinism check. Bundled by browser.ts into
 * one classic script; reads its settings from a global and writes the result
 * as JSON into <pre id="out">, which `chromium --dump-dom` prints.
 */
import { benchWarehouseCatchUp, hashWarehouseSeeds } from './warehouse.ts';

interface BrowserConfig {
  readonly firstSeed: number;
  readonly seeds: number;
  readonly ticks: number;
  readonly benchTicks: number;
  readonly benchRuns: number;
}

interface BrowserGlobals {
  __HARNESS_CONFIG__: BrowserConfig;
  performance: { now(): number };
  navigator: { userAgent: string };
  document: {
    getElementById(id: string): { textContent: string | null } | null;
  };
}

const g = globalThis as unknown as BrowserGlobals;
const out = g.document.getElementById('out');
try {
  const config = g.__HARNESS_CONFIG__;
  const hashes = hashWarehouseSeeds(config.firstSeed, config.seeds, config.ticks);
  const benchMs = benchWarehouseCatchUp(config.benchTicks, config.benchRuns, () => g.performance.now());
  if (out) out.textContent = JSON.stringify({ ok: true, userAgent: g.navigator.userAgent, hashes, benchMs });
} catch (error) {
  if (out) out.textContent = JSON.stringify({ ok: false, error: String(error) });
}
