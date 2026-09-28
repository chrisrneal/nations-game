import { describe, expect, it } from 'vitest';
import { playGame } from './game.ts';
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

  it('computes the top-scorer share as the ROADMAP defines it', () => {
    // ROADMAP "Balance harness": fair share = 1 / playable nations; no nation may top
    // the score in more than 2x its fair share of games. Regions are never scored.
    const roster = loadRoster();
    const playable = roster.filter((r) => r.endowment?.kind === 'playable').map((r) => r.id);
    const games = 5;
    const ticks = 12;
    const report = runGate1({ games, firstSeed: 21, roster, ticks });

    expect(Object.keys(report.topShare).sort()).toEqual([...playable].sort());
    const sum = Object.values(report.topShare).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);

    // Each game's top scorer is the playable nation with the highest final score in that game.
    report.rows.forEach((row) => {
      const result = playGame({ seed: row.seed, ticks, roster, strategies: assignStrategies(row.seed, playable), humanSwitch: false });
      let best = result.score.nations[0];
      for (const n of result.score.nations) if (best === undefined || n.finalScore > best.finalScore) best = n;
      expect(row.top).toBe(best?.id);
    });
    for (const id of playable) {
      expect(report.topShare[id]).toBe(report.rows.filter((r) => r.top === id).length / games);
    }

    const metric = report.metrics.find((m) => m.name.startsWith('Most frequent top scorer'));
    const max = Math.max(...Object.values(report.topShare));
    const line = 2 / playable.length;
    expect(metric?.value).toBe(`${(max * 100).toFixed(1)}%`);
    expect(metric?.passLine).toBe(`<= ${(line * 100).toFixed(1)}% (2x fair share)`);
    expect(metric?.passLine).toContain('11.8%');
    expect(metric?.pass).toBe(max <= line);
  });
});
