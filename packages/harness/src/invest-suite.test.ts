import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Event, NationId } from '@nations/contracts';
import { buyWith, costOf, pointPrice as aiPointPrice } from '@nations/ai';
import { TUNABLES, investBuy, investCost, pointPrice } from '@nations/sim';
import { INVEST_RATES, investRateOf, type Strategy } from './bots.ts';
import { playGame } from './game.ts';
import { bestRate, cardParams, formatInvestLines, gapByNation, investMetrics, investNumbers, nationForSeed, playableOf, rateNations, rateVerdict, runInvestLines, type IdlePair, type InvestLines, type RateNation, type RateRow } from './invest-suite.ts';
import { applyOverrides } from './overrides.ts';
import { formatTune, gate2Json, runTune, tuneJson } from './summary.ts';
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

describe('the best rate', () => {
  it('is the lowest rate within the tie tolerance of the top median, so nations that gain nothing are "best at 0"', () => {
    expect(bestRate([1000, 1000, 1000, 1000, 1000]).rate).toBe(0);
    expect(bestRate([1000, 1002, 1001, 999, 1003]).rate).toBe(0);
    expect(bestRate([900, 1000, 990, 950, 800]).rate).toBe(10);
    expect(bestRate([900, 950, 1000, 990, 800]).rate).toBe(25);
    expect(bestRate([900, 950, 990, 1000, 1000]).rate).toBe(50);
    const { loss } = bestRate([900, 1000, 990, 950, 800]);
    expect(loss[0]).toBeCloseTo(0.1);
    expect(loss[4]).toBeCloseTo(0.2);
    expect(loss[1]).toBe(0);
  });

  it('counts the rates that are best for at least two nations and takes the median loss at each end', () => {
    const mk = (nation: string, medians: number[]): RateNation => {
      const b = bestRate(medians);
      return { nation, games: 10, medians, aiMedian: 0, idleMedian: 0, selfReliantMedian: 0, isolationistMedian: 0, best: b.rate, loss: b.loss };
    };
    const nations = [
      mk('a', [1000, 900, 900, 900, 900]),
      mk('b', [1000, 900, 900, 900, 900]),
      mk('c', [900, 1000, 950, 900, 850]),
      mk('d', [900, 1000, 950, 900, 850]),
      mk('e', [800, 900, 950, 1000, 900]),
      mk('f', [800, 900, 950, 1000, 900]),
      mk('g', [800, 900, 950, 990, 1000]),
    ];
    const v = rateVerdict(nations);
    expect(v.bestCounts).toEqual({ 0: 2, 10: 2, 25: 0, 50: 2, 100: 1 });
    expect(v.ratesWithTwo).toBe(3);
    expect(v.nations).toBe(7);
    // Never investing loses 0, 0, 10, 10, 20, 20, 20 percent: median 10. The highest rate loses 10, 10, 15, 15, 10, 10, 0: median 10.
    expect(v.medianLossNever).toBeCloseTo(0.1);
    expect(v.medianLossTop).toBeCloseTo(0.1);
    expect(v.nationsHurtNever).toBe(5);
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
  const lines = runInvestLines({ games: 3, firstSeed: 1, roster, ticks: 24 });

  it('plays one nation per seed in every arm and keeps every arm on the same seeds', () => {
    expect(lines.pairs.map((p) => p.nation)).toEqual(lines.rates.map((r) => r.nation));
    expect(lines.pairs.map((p) => p.seed)).toEqual([1, 2, 3]);
    for (const r of lines.rates) {
      expect(r.byRate).toHaveLength(INVEST_RATES.length);
      expect(r.selfReliant).toBeGreaterThan(0);
      expect(r.isolationist).toBeGreaterThan(0);
    }
    // The played game of the pair is the AI-plan column of the sweep: the same game.
    expect(lines.rates.map((r) => r.ai)).toEqual(lines.pairs.map((p) => p.played));
    expect(lines.sinks.income).toBeGreaterThan(0);
  });

  it('counts what an idle nation is asked: appeals prepaid never exceed appeals, offers are whole numbers', () => {
    for (const d of lines.density) {
      expect(d.prepaid).toBeLessThanOrEqual(d.appeals);
      expect(Number.isInteger(d.offers)).toBe(true);
      expect(d.investCards).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports the prompt 17 lines with their pass lines and prints the detail tables', () => {
    const metrics = investMetrics(lines);
    const names = metrics.map((m) => m.name).join('\n');
    for (const needle of ['AI vs idle: median gap, overall', 'Japan, Korea, Mexico, Turkiye', 'Credit sinks / Credit income, all-AI world', 'trade offers received', 'crisis appeals', 'already paid in full', 'investment card', 'best for at least two nations', 'nations whose median gap from never investing', 'at the highest rate', 'Collaboration vs self-reliance']) {
      expect(names, needle).toContain(needle);
    }
    expect(metrics.find((m) => m.name.includes('median gap, overall'))?.passLine).toBe('>= +10%');
    expect(metrics.find((m) => m.name.includes('Japan, Korea'))?.passLine).toBe('each +8% to +16%');
    expect(metrics.find((m) => m.name.includes('never investing'))?.passLine).toBe('>= 6 nations');
    expect(metrics.find((m) => m.name.includes('at the highest rate'))?.passLine).toBe('>= 6 nations');
    expect(metrics.find((m) => m.name.includes('all-AI world'))?.passLine).toBe('8-25%');
    const text = formatInvestLines(lines);
    expect(text).toContain('## AI vs idle by nation');
    expect(text).toContain('## Fixed investment rates by nation');
  });

  it('skips the heavy sweep on request', () => {
    const light = runInvestLines({ games: 1, firstSeed: 1, roster, ticks: 12, skipRates: true });
    expect(light.rates).toEqual([]);
    expect(investMetrics(light).some((m) => m.name.includes('Fixed investment rates'))).toBe(false);
  });

  it('can leave out the self-reliant and isolationist games but keep the rest of the sweep', () => {
    const lean = runInvestLines({ games: 1, firstSeed: 1, roster, ticks: 12, skipAlone: true });
    expect(lean.withAlone).toBe(false);
    expect(lean.rates[0]!.byRate).toHaveLength(INVEST_RATES.length);
    expect(lean.rates[0]!.selfReliant).toBe(0);
    const names = investMetrics(lean).map((m) => m.name).join('\n');
    expect(names).toContain('best for at least two nations');
    expect(names).not.toContain('Collaboration vs');
    expect(formatInvestLines(lean)).not.toContain('Self-reliant AI');
    expect(lean.pairs).toEqual(runInvestLines({ games: 1, firstSeed: 1, roster, ticks: 12, skipRates: true }).pairs);
  });
});

/** Synthetic lines: the named nations with the given played/idle scores and rate medians, one game each. */
function synthetic(gaps: Record<string, number>, medians: Record<string, number[]>, sinkShare = 0.15): InvestLines {
  const pairs: IdlePair[] = Object.entries(gaps).map(([nation, gap], i) => ({ seed: i + 1, nation, played: 1000, idle: Math.round(1000 * (1 - gap)), playedRank: 1, idleRank: 2 }));
  const rates: RateRow[] = Object.entries(medians).map(([nation, byRate], i) => ({ seed: i + 1, nation, byRate, ai: 1000, idle: 900, selfReliant: 0, isolationist: 0 }));
  return { firstSeed: 1, games: pairs.length, pairs, density: [], rates, sinks: { income: 1000, resilience: 0, crises: 0, investment: Math.round(1000 * sinkShare) }, withAlone: false };
}
const line = (lines: InvestLines, needle: string) => investMetrics(lines).find((m) => m.name.includes(needle))!;

describe('the prompt 17b grading', () => {
  const buyers = { japan: 0.1, korea: 0.12, mexico: 0.14, turkiye: 0.09 };

  it('grades each Credit buyer between +8% and +16%, both ends, and the overall gap at +10%', () => {
    expect(line(synthetic({ ...buyers, other: 0.12 }, {}), 'Japan, Korea').pass).toBe(true);
    expect(line(synthetic({ ...buyers, turkiye: 0.07 }, {}), 'Japan, Korea').pass).toBe(false);
    expect(line(synthetic({ ...buyers, mexico: 0.17 }, {}), 'Japan, Korea').pass).toBe(false);
    expect(line(synthetic({ ...buyers }, {}), 'Japan, Korea').value).toBe('japan +10.0%, korea +12.0%, mexico +14.0%, turkiye +9.0%');
    expect(line(synthetic({ ...buyers, a: 0.05, b: 0.05, c: 0.05, d: 0.05, e: 0.05 }, {}), 'median gap, overall').pass).toBe(false);
    expect(line(synthetic({ ...buyers }, {}), 'median gap, overall').pass).toBe(true);
    // A missing buyer cannot pass.
    expect(line(synthetic({ japan: 0.1, korea: 0.1, mexico: 0.1 }, {}), 'Japan, Korea').pass).toBe(false);
  });

  it('grades the sweep by nation counts: at least 6 nations at each end, and prints them with the nation count', () => {
    // never-invest loses 10% for the first six nations, 0 for the last two; the top rate loses 10% for the last six, 0 for the first two.
    const hurtNever = [900, 1000, 990, 950, 800];
    const hurtTop = [1000, 990, 980, 950, 900];
    const med: Record<string, number[]> = {};
    ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].forEach((n) => (med[n] = hurtNever));
    ['n3', 'n4', 'n5', 'n6', 'n7', 'n8'].forEach((n) => (med[n] = hurtTop));
    for (const n of ['n1', 'n2']) med[n] = hurtNever;
    const lines = synthetic({}, med);
    const v = rateVerdict(rateNations(lines.rates));
    expect(v.nationsHurtNever).toBe(2);
    expect(v.nationsHurtTop).toBe(8);
    const never = line(lines, 'nations whose median gap from never investing');
    expect(never.value).toBe('2 of 8 nations');
    expect(never.pass).toBe(false);
    const topLine = line(lines, 'at the highest rate');
    expect(topLine.value).toBe('8 of 8 nations');
    expect(topLine.pass).toBe(true);
    const n = investNumbers(lines);
    expect(n.rates?.nationsHurtNever).toBe(2);
    expect(line(lines, 'median nation').passLine).toBe('info');
  });

  it('keeps the credit sink line at 8-25%', () => {
    expect(line(synthetic({}, {}, 0.05), 'Credit sinks').pass).toBe(false);
    expect(line(synthetic({}, {}, 0.2), 'Credit sinks').pass).toBe(true);
  });
});

describe('the card tunables', () => {
  it('are read from TUNABLES at call time, so --set overrides reach the tracker', () => {
    expect(cardParams()).toEqual({ shortTicks: 3, openTicks: 1, quietTicks: 3, growthBp: 500 });
    const restore = applyOverrides({ investCardShortTicks: 5, investCardQuietTicks: 0 });
    try {
      expect(cardParams()).toMatchObject({ shortTicks: 5, quietTicks: 0 });
    } finally {
      restore();
    }
    expect(cardParams().shortTicks).toBe(3);
  });
});

describe('tune', () => {
  it('reads its flags', () => {
    expect(parseArgs(['tune', '--games', '200', '--seed', '1001', '--set', 'investCostBp=900', '--out', 'x', '--no-rates'])).toMatchObject({ command: 'tune', numbers: { games: 200, seed: 1001 }, switches: ['no-rates'], strings: { set: 'investCostBp=900', out: 'x' } });
    expect(() => parseArgs(['tune', '--absence', '3'])).toThrow(/Unknown flag/);
  });

  it('plays the archetype games and the lines, and prints a summary and a json with every quantity the rule needs', () => {
    const r = runTune({ games: 2, firstSeed: 1, roster, ticks: 24 });
    expect(r.archetypes.freeRiderPairs).toHaveLength(0);
    expect(r.archetypes.spoilerPairs).toHaveLength(0);
    expect(r.archetypes.absence).toHaveLength(0);
    expect(r.archetypes.gate1).toBeNull();
    expect(r.invest.withAlone).toBe(false);
    const text = formatTune(r);
    for (const needle of ['Credit sinks / income', 'AI vs idle, median gap, overall', 'Credit buyers', 'Fixed rates, best rate per nation', '2(b)', '2(c)', 'free-rider', 'Most frequent top scorer', 'top three', 'Home-investment card']) expect(text, needle).toContain(needle);
    const json = tuneJson(r);
    for (const key of ['topScorerShareByNation', 'topThree', 'archetypeMultiples', 'freeRiderMultiple', 'aiVsIdleByNation', 'aiVsIdleOverall', 'creditBuyerGaps', 'rateSweep', 'homeInvestmentCardMonths', 'creditSinksOverIncomeAllAi']) expect(json, key).toHaveProperty(key);
    expect(JSON.stringify(json)).not.toContain('\n');
    expect(runTune({ games: 1, firstSeed: 1, roster, ticks: 12, skipRates: true }).numbers.rates).toBeNull();
  }, 60_000);

  it('gate2.json carries the comparison fields', () => {
    const report = runGate2({ games: 1, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true, skipRates: true });
    const json = gate2Json(report);
    for (const key of ['topScorerShareByNation', 'mostFrequentTopScorer', 'aiVsIdleByNation', 'archetypeMultiples', 'freeRiderMultiple', 'creditSinksOverIncomeAllAi', 'creditSinksOverIncomeArchetypeGames', 'rateSweep']) expect(json, key).toHaveProperty(key);
    expect(json.rateSweep).toBeNull();
  }, 60_000);
});

describe('the fixed-rate strategies', () => {
  const investedBy = (strategy: Strategy): number => {
    let total = 0;
    playGame({ seed: 4, ticks: 30, roster, strategies: { egypt: strategy }, humanSwitch: false, onTick: (s) => (total += s.nations['egypt' as NationId]!.private.last.invested) });
    return total;
  };

  it('are named invest<N>, and are the shipped AI with its investment plan replaced', () => {
    expect(INVEST_RATES.map((r) => `invest${r}`).map((s) => investRateOf(s as Strategy))).toEqual([...INVEST_RATES]);
    expect(investRateOf('trader')).toBeNull();
    expect(() => playGame({ seed: 1, ticks: 2, roster, humanSwitch: false, switches: [{ tick: 1, nation: 'egypt', strategy: 'invest50' }] })).toThrow(/fixed for the whole game/);
  });

  it('invest0 never builds, and more rate builds more, until the ceiling', () => {
    expect(investedBy('invest0')).toBe(0);
    const [ten, fifty, all] = [investedBy('invest10'), investedBy('invest50'), investedBy('invest100')];
    expect(ten).toBeGreaterThan(0);
    expect(fifty).toBeGreaterThan(ten);
    expect(all).toBeGreaterThanOrEqual(fifty);
  });

  it('the self-reliant AI builds and never trades', () => {
    const events: Event[] = [];
    const r = playGame({ seed: 4, ticks: 30, roster, strategies: { egypt: 'selfReliant' }, humanSwitch: false, onTick: (_s, e) => events.push(...e) });
    const trades = events.filter((e) => e.type === 'offerSettled' && [e.payload as { offer: { from: string; to: string } }].some((p) => p.offer.from === 'egypt' || p.offer.to === 'egypt'));
    expect(trades).toHaveLength(0);
    expect(r.state.nations['egypt' as NationId]!.private.policy.rejectAll).toBe(true);
    expect(events.some((e) => e.type === 'investmentMade' && (e.payload as { nationId: string }).nationId === 'egypt')).toBe(true);
  });
});

describe('the AI\'s price arithmetic is the sim\'s', () => {
  it('prices a point, a build and a purchase identically', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000 }), fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 4_000 }), fc.integer({ min: 0, max: 400_000 }), fc.integer({ min: 0, max: 10_000 }), (base, at, add, credit, cap) => {
        const esc = TUNABLES.investEscalationPct.value;
        expect(aiPointPrice(base, Math.floor(at / 100), esc)).toBe(pointPrice(base, Math.floor(at / 100)));
        expect(costOf(base, at, add, esc)).toBe(investCost(base, at, add));
        expect(buyWith(base, at, credit, cap, esc)).toEqual(investBuy(base, at, credit, cap));
      }),
      { numRuns: 400 },
    );
  });
});

describe('the command line and the gate2 suite', () => {
  it('reads the invest command and the gate2 switches', () => {
    expect(parseArgs(['invest', '--games', '50', '--seed', '1001', '--no-rates', '--set', 'investCostBp=900'])).toMatchObject({ command: 'invest', numbers: { games: 50, seed: 1001 }, switches: ['no-rates'], strings: { set: 'investCostBp=900' } });
    expect(parseArgs(['gate2', '--no-invest']).switches).toEqual(['no-invest']);
    expect(() => parseArgs(['invest', '--absence', '3'])).toThrow(/Unknown flag --absence for "invest"/);
  });

  it('gate2 carries the lines, grades the G1 archetype wording, and skips them on request', () => {
    const report = runGate2({ games: 1, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true, skipRates: true });
    expect(report.invest?.pairs).toHaveLength(1);
    const names = report.metrics.map((m) => m.name).join('\n');
    expect(names).toContain('AI vs idle');
    expect(names).toContain('Defecting archetypes');
    const line = report.metrics.find((m) => m.name.startsWith('Defecting archetypes'))!;
    expect(line.passLine).toBe('each <= 1.50x and <= cooperator');
    expect(names).not.toContain('Most winning archetype');
    const skipped = runGate2({ games: 1, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true, skipInvest: true });
    expect(skipped.invest).toBeNull();
  }, 60_000);
});
