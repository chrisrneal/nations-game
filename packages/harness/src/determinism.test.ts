/**
 * S5 in executable form: 300 seeds of scripted games (practice boards, every
 * fourth Kindy; one game lost on purpose and retried, one won with the
 * solver's solution) give identical state hashes in Node and in headless Chromium
 * (see browser.ts). Skips only on a machine with no Chromium/Chrome and no
 * CI variable; in CI a missing browser is a failure, not a skip.
 */
import { describe, expect, it } from 'vitest';
import { hashGames } from './games.ts';
import { findChromium, runInBrowser } from './browser.ts';

const browser = findChromium();
const inCi = process.env.CI !== undefined && process.env.CI !== '';

if (browser === undefined && !inCi) {
  console.warn('determinism.test.ts: no Chromium found, skipping the browser comparison. Set CHROME_PATH.');
}

describe('determinism across engines', () => {
  it.skipIf(browser === undefined && !inCi)(
    '300 games hash identically in Node and in Chromium',
    async () => {
      const seeds = 300;
      const node = hashGames(1, seeds);
      expect(new Set(node).size).toBeGreaterThan(295);
      const run = await runInBrowser({ firstSeed: 1, seeds, benchRuns: 0 }, browser);
      expect(run.hashes).toHaveLength(seeds);
      expect(run.hashes).toEqual(node);
    },
    180_000,
  );
});
