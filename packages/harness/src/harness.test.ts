import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { benchCatchUp, hashSeeds, runGame } from './game.ts';
import { CSV_COLUMNS, summarize, toCsv } from './metrics.ts';
import { loadRoster } from './roster.ts';

const roster = loadRoster();

describe('harness games', () => {
  it('loads the real roster from data/world-2030.json: 17 nations then 6 regions, each sorted', () => {
    const playable = roster.filter((r) => r.endowment?.kind === 'playable').map((r) => r.id);
    const regions = roster.filter((r) => r.endowment?.kind === 'aggregate').map((r) => r.id);
    expect(playable).toHaveLength(17);
    expect(regions).toHaveLength(6);
    expect(roster.map((r) => r.id)).toEqual([...[...playable].sort(), ...[...regions].sort()]);
    expect(playable).toContain('united-states');
    expect(roster.map((r) => r.id)).not.toContain('schemaVersion');
  });

  it('200 seeds give identical hashes on repeat runs, and different seeds differ (1,000 in determinism.test.ts)', () => {
    const first = hashSeeds(1, 200, 30, roster);
    const second = hashSeeds(1, 200, 30, roster);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(200);
  }, 60_000);

  it('a game of AI traders has no invalid commands, trades, and switches a controller twice', () => {
    const game = runGame({ seed: 7, ticks: 120, roster });
    expect(game.rejectedAtSubmit).toBe(0);
    expect(game.rejectedAtStep).toBe(0);
    // Same-month races (the other side answered first) are refused but are not invalid; about 1 in 200 AI commands.
    expect(game.racedAtStep).toBeLessThan(game.submitted / 50);
    expect(game.controllerSwitches).toBe(2);
    expect(game.tradesSettled).toBeGreaterThan(100);
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
