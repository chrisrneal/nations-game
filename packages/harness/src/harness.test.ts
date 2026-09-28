import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { benchCatchUp, hashSeeds, runGame } from './game.ts';
import { CSV_COLUMNS, summarize, toCsv } from './metrics.ts';
import { loadRoster } from './roster.ts';

const roster = loadRoster();

describe('harness games', () => {
  it('loads the roster from data/world-2030.json in a stable order', () => {
    expect(roster.length).toBeGreaterThanOrEqual(2);
    expect(roster.map((r) => r.id)).toEqual([...roster.map((r) => r.id)].sort());
  });

  it('1,000 seeds give identical hashes on repeat runs, and different seeds differ', () => {
    const first = hashSeeds(1, 1000, 50, roster);
    const second = hashSeeds(1, 1000, 50, roster);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(1000);
  });

  it('a game of dummy AI has no rejected commands and switches a controller twice', () => {
    const game = runGame({ seed: 7, ticks: 120, roster });
    expect(game.rejectedAtSubmit).toBe(0);
    expect(game.rejectedAtStep).toBe(0);
    expect(game.controllerSwitches).toBe(2);
    expect(game.pings).toBe(game.submitted - game.controllerSwitches);
  });

  it('writes one CSV row per game plus a header', () => {
    const games = [1, 2, 3].map((seed) => runGame({ seed, ticks: 20, roster }));
    const lines = toCsv(games).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]?.split(',')).toHaveLength(CSV_COLUMNS.length);
    const summary = summarize(games, 12.3);
    expect(summary).toMatchObject({ games: 3, ticksPerGame: 20, rejected: 0, distinctHashes: 3 });
  });

  it('1,000 catch-up ticks run well inside the 2 s budget on this machine', () => {
    const [ms] = benchCatchUp(1000, 1, roster, () => performance.now());
    expect(ms).toBeLessThan(2000);
  });
});
