/**
 * S5 in executable form: 1,000 seeds of the airport, each played by a scripted
 * player for a minute of taps, purchases and sales and then caught up for an
 * hour, give identical state hashes in Node and in headless Chromium (see
 * browser.ts). Skips only on a machine with no Chromium/Chrome and no CI
 * variable; in CI a missing browser is a failure, not a skip.
 */
import { describe, expect, it } from 'vitest';
import { hashAirportSeeds } from './airport.ts';
import { findChromium, runInBrowser } from './browser.ts';

const browser = findChromium();
const inCi = process.env.CI !== undefined && process.env.CI !== '';

if (browser === undefined && !inCi) {
  console.warn('determinism.test.ts: no Chromium found, skipping the browser comparison. Set CHROME_PATH.');
}

describe('determinism across engines', () => {
  it.skipIf(browser === undefined && !inCi)(
    '1,000 airports hash identically in Node and in Chromium',
    async () => {
      const seeds = 1000;
      const ticks = 240;
      const node = hashAirportSeeds(1, seeds, ticks);
      expect(new Set(node).size).toBeGreaterThan(990);
      const run = await runInBrowser({ firstSeed: 1, seeds, ticks, benchTicks: 0, benchRuns: 0 }, browser);
      expect(run.hashes).toHaveLength(seeds);
      expect(run.hashes).toEqual(node);
    },
    180_000,
  );
});
