import { describe, expect, it } from 'vitest';
import { assignStrategies, formatGate1, runGate1 } from './gate1.ts';
import { loadRoster } from './roster.ts';

describe('gate1 suite', () => {
  it('assigns strategies deterministically and uses all four', () => {
    const ids = loadRoster().filter((r) => r.endowment?.kind === 'playable').map((r) => r.id);
    expect(assignStrategies(5, ids)).toEqual(assignStrategies(5, ids));
    const seen = new Set<string>();
    for (let seed = 1; seed < 20; seed++) for (const s of Object.values(assignStrategies(seed, ids))) seen.add(s);
    expect([...seen].sort()).toEqual(['exploiter', 'hoarder', 'isolationist', 'trader']);
  });

  it('runs a small batch and reports every Gate 1 metric', () => {
    const report = runGate1({ games: 3, firstSeed: 1, roster: loadRoster(), ticks: 24 });
    expect(report.games).toBe(3);
    expect(report.pairs).toHaveLength(3);
    const names = report.metrics.map((m) => m.name).join('\n');
    for (const needle of ['Crashes', 'Negative stocks', 'consumed / produced', 'trading vs isolating', 'Isolationists worse', 'Isolationists alive', 'Dead states', 'top scorer', '3 taps', 'Gate 0']) {
      expect(names).toContain(needle);
    }
    expect(report.metrics.find((m) => m.name === 'Crashes')?.value).toBe('0');
    expect(report.metrics.find((m) => m.name.startsWith('Negative stocks'))?.value).toBe('0');
    expect(formatGate1(report)).toContain('| Metric | Result | Pass line |');
  });
});
