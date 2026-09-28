import { describe, expect, it } from 'vitest';
import { assignStrategies, formatGate1, formatGate1Ranges, runGate1, runGate1Ranges } from './gate1.ts';
import { loadRoster } from './roster.ts';

const roster = loadRoster();

describe('gate1 suite', () => {
  it('assigns strategies deterministically and uses all four', () => {
    const ids = roster.filter((r) => r.endowment?.kind === 'playable').map((r) => r.id);
    expect(assignStrategies(5, ids)).toEqual(assignStrategies(5, ids));
    const seen = new Set<string>();
    for (let seed = 1; seed < 20; seed++) for (const s of Object.values(assignStrategies(seed, ids))) seen.add(s);
    expect([...seen].sort()).toEqual(['exploiter', 'hoarder', 'isolationist', 'trader']);
  });

  it('runs a small batch and reports every Gate 1 metric', () => {
    const report = runGate1({ games: 3, firstSeed: 1, roster, ticks: 24 });
    expect(report.games).toBe(3);
    expect(report.firstSeed).toBe(1);
    expect(report.pairs).toHaveLength(3);
    const names = report.metrics.map((m) => m.name).join('\n');
    for (const needle of ['Crashes', 'Negative stocks', 'consumed / produced', 'trading vs isolating', 'Pairs at +15% or more', 'Isolationists worse', 'Isolationists alive', 'Dead states', 'top scorer', '3 taps', 'Gate 0']) {
      expect(names).toContain(needle);
    }
    expect(report.metrics.find((m) => m.name === 'Crashes')?.value).toBe('0');
    expect(report.metrics.find((m) => m.name.startsWith('Negative stocks'))?.value).toBe('0');
    const text = formatGate1(report);
    expect(text).toContain('| Metric | Result | Pass line |');
    expect(text).toContain('seeds 1-3');
    expect(text).toContain('| Nation | Pairs | Median gain | Pairs at +15% or more |');
  });

  it('reports the share of pairs at +15% or more, overall and per nation', () => {
    const report = runGate1({ games: 4, firstSeed: 11, roster, ticks: 24 });
    const expected = report.pairs.filter((p) => p.tradingBp * 100 >= p.isolatingBp * 115).length / report.pairs.length;
    expect(report.shareAtPassLine).toBeCloseTo(expected, 10);
    const perNation = Object.values(report.perNation);
    expect(perNation.reduce((s, n) => s + n.pairs, 0)).toBe(4);
    for (const n of perNation) expect(n.shareAtPassLine).toBeGreaterThanOrEqual(0);
  });

  it('runs consecutive seed ranges and pools them: the pooled run equals one long run', () => {
    const ranges = runGate1Ranges({ games: 2, firstSeed: 5, ranges: 2, roster, ticks: 18 });
    expect(ranges.ranges.map((r) => [r.firstSeed, r.games])).toEqual([[5, 2], [7, 2]]);
    const long = runGate1({ games: 4, firstSeed: 5, roster, ticks: 18 });
    expect(ranges.pooled.pairs).toEqual(long.pairs);
    expect(ranges.pooled.metrics).toEqual(long.metrics);
    expect(ranges.pooled.perNation).toEqual(long.perNation);
    expect(ranges.pass).toBe(ranges.pooled.pass && ranges.ranges.every((r) => r.pass));
    const text = formatGate1Ranges(ranges);
    expect(text).toContain('seeds 5-6');
    expect(text).toContain('seeds 7-8');
    expect(text).toContain('Pooled, seeds 5-8');
  });
});
