import { describe, expect, it } from 'vitest';
import { gapByNation, idleMetrics, formatIdleLines, nationForSeed, playableOf, runIdleLines, type IdlePair } from './idle-suite.ts';
import { runGate2 } from './gate2.ts';
import { parseArgs } from './args.ts';
import { loadRoster } from './roster.ts';

const roster = loadRoster();
const playable = playableOf(roster);

describe('the seed rotation', () => {
  it('gives every playable nation the same number of seeds in any run of 17', () => {
    const seen = new Map<string, number>();
    for (let seed = 1001; seed < 1001 + 17; seed++) seen.set(nationForSeed(seed, playable), (seen.get(nationForSeed(seed, playable)) ?? 0) + 1);
    expect(seen.size).toBe(17);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    expect(nationForSeed(1, playable)).toBe(playable[0]);
  });
});

describe('AI vs idle', () => {
  it('is the share of the played score the idle nation would have lost, taken per nation', () => {
    const pairs: IdlePair[] = [
      { seed: 1, nation: 'japan', played: 1000, idle: 800, playedRank: 3, idleRank: 12 },
      { seed: 18, nation: 'japan', played: 1000, idle: 900, playedRank: 3, idleRank: 12 },
      { seed: 2, nation: 'korea', played: 500, idle: 500, playedRank: 9, idleRank: 9 },
    ];
    const gaps = gapByNation(pairs);
    expect(gaps.map((g) => [g.nation, g.pairs])).toEqual([['japan', 2], ['korea', 1]]);
    expect(gaps[0]!.medianGap).toBeCloseTo(0.15);
    expect(gaps[1]!.medianGap).toBe(0);
  });
});

describe('the lines on a small batch', () => {
  const lines = runIdleLines({ games: 3, firstSeed: 1, roster, ticks: 24 });

  it('plays one nation per seed, played and idle on the same seed', () => {
    expect(lines.pairs.map((p) => p.seed)).toEqual([1, 2, 3]);
    expect(lines.pairs.map((p) => p.nation)).toEqual([playable[0], playable[1], playable[2]]);
    for (const p of lines.pairs) {
      expect(p.played).toBeGreaterThan(0);
      expect(p.idle).toBeGreaterThan(0);
    }
    expect(lines.sinks.income).toBeGreaterThan(0);
  });

  it('counts what an idle nation is asked: appeals prepaid never exceed appeals, offers are whole numbers', () => {
    for (const d of lines.density) {
      expect(d.prepaid).toBeLessThanOrEqual(d.appeals);
      expect(Number.isInteger(d.offers)).toBe(true);
    }
  });

  it('reports the lines with the pass lines of prompt 17 target 3 and prints the by-nation table', () => {
    const metrics = idleMetrics(lines);
    const names = metrics.map((m) => m.name).join('\n');
    for (const needle of ['AI vs idle: median gap, overall', 'Japan, Korea, Mexico, Turkiye', 'Credit sinks / Credit income, all-AI world', 'trade offers received', 'crisis appeals', 'already paid in full']) {
      expect(names, needle).toContain(needle);
    }
    expect(metrics.find((m) => m.name.includes('median gap, overall'))?.passLine).toBe('>= +10%');
    expect(metrics.find((m) => m.name.includes('Japan, Korea'))?.passLine).toBe('each >= +8%');
    expect(formatIdleLines(lines)).toContain('## AI vs idle by nation');
  });
});

describe('the gate2 suite and its command line', () => {
  it('carries the lines and grades the G1 archetype wording; --no-idle and skipIdle leave them out', () => {
    const report = runGate2({ games: 1, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true });
    expect(report.idle?.pairs).toHaveLength(1);
    const names = report.metrics.map((m) => m.name).join('\n');
    expect(names).toContain('AI vs idle');
    expect(names).toContain('Defecting archetypes');
    expect(names).not.toContain('Most winning archetype');
    expect(report.metrics.find((m) => m.name.startsWith('Defecting archetypes'))?.passLine).toBe('each <= 1.50x and <= cooperator');
    expect(runGate2({ games: 1, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true, skipIdle: true }).idle).toBeNull();
    expect(parseArgs(['gate2', '--no-idle']).switches).toEqual(['no-idle']);
  }, 60_000);
});
