/**
 * Gate 0, criterion 2: 1,000 seeds give identical hashes in browser and Node.
 * Runs the same game module inside headless Chromium (see browser.ts). Skips
 * only on a machine with no Chromium/Chrome and no CI variable; in CI a
 * missing browser is a failure, not a skip.
 */
import { describe, expect, it } from 'vitest';
import { findChromium, runInBrowser } from './browser.ts';
import { hashSeeds } from './game.ts';
import { loadRoster } from './roster.ts';

const browser = findChromium();
const inCi = process.env.CI !== undefined && process.env.CI !== '';

if (browser === undefined && !inCi) {
  console.warn('determinism.test.ts: no Chromium found, skipping the browser comparison. Set CHROME_PATH.');
}

describe('determinism across engines', () => {
  it.skipIf(browser === undefined && !inCi)(
    '1,000 seeds hash identically in Node and in Chromium',
    async () => {
      const seeds = 1000;
      const ticks = 50;
      const node = hashSeeds(1, seeds, ticks, loadRoster());
      const run = await runInBrowser({ firstSeed: 1, seeds, ticks, benchTicks: 0, benchRuns: 0 }, browser);
      expect(run.hashes).toHaveLength(seeds);
      expect(run.hashes).toEqual(node);
    },
    180_000,
  );
});
