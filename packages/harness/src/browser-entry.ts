/**
 * Runs inside Chromium for the determinism check. Bundled by browser.ts into
 * one classic script; reads its settings from a global and writes the result
 * as JSON into <pre id="out">, which `chromium --dump-dom` prints.
 */
import { benchCatchUp, hashSeeds } from './game.ts';
import { loadRoster } from './roster.ts';

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
  const roster = loadRoster();
  const hashes = hashSeeds(config.firstSeed, config.seeds, config.ticks, roster);
  const benchMs = benchCatchUp(config.benchTicks, config.benchRuns, roster, () => g.performance.now());
  if (out) out.textContent = JSON.stringify({ ok: true, userAgent: g.navigator.userAgent, hashes, benchMs });
} catch (error) {
  if (out) out.textContent = JSON.stringify({ ok: false, error: String(error) });
}
