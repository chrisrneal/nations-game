/**
 * The Gate 1 suite (docs/ROADMAP.md, "Gate 1 (Economy and trade)").
 *
 * Plays `games` seeded full-roster games (17 nations + 6 regions, a full
 * game length each) with every playable nation assigned a strategy at random,
 * plus a paired run per seed in which one randomly chosen nation plays the
 * trader (the shipped AI since prompt 13) in one game and the isolationist in
 * the other, everyone else unchanged. Reports every Gate 1 metric with its pass line.
 *
 * Pass lines, fixed before any result was seen (ROADMAP gate rules):
 * - crashes 0; negative stocks 0.
 * - sources and sinks in band: world food and energy consumed / produced in
 *   [75%, 100%]; Credit sinks / Credit income in [0%, 25%] (Phase 1's only
 *   Credit sink is resilience; crises add more in Phase 2).
 * - trading vs isolating: median over the paired runs of
 *   (trading ownScore / isolating ownScore - 1) >= 15%.
 * - isolationists worse off but alive: isolating scores below trading in most
 *   pairs (> 50%), and no isolationist game ends dead.
 * - dead states < 2%: a nation is dead when its final output is under half of
 *   its own baseline output (ownScore < 0.50).
 * - no nation tops the score in more than 2x fair share: 2/17 = 11.8% of games.
 * - "a trade in 3 taps or fewer" is an interface measure (lane U), and
 *   "Gate 0 still passes" is the determinism test; both are reported as
 *   pointers, not measured here.
 */
import type { NationId, Resource } from '@nations/contracts';
import { TUNABLES, mix32, type RosterEntry, type WorldState } from '@nations/sim';
import { STRATEGIES, type Strategy } from './bots.ts';
import { playGame } from './game.ts';

export interface Gate1Options {
  readonly games: number;
  readonly firstSeed: number;
  readonly roster: readonly RosterEntry[];
  readonly ticks?: number;
}

export interface Gate1RangeOptions extends Gate1Options {
  /** Consecutive ranges of `games` seeds each, starting at `firstSeed`. */
  readonly ranges: number;
}

export interface PairResult {
  readonly seed: number;
  readonly nation: string;
  readonly tradingBp: number;
  readonly isolatingBp: number;
  readonly isolatingDead: boolean;
}

export interface Gate1GameRow {
  readonly seed: number;
  readonly top: string;
  readonly topStrategy: Strategy;
  readonly multiplierBp: number;
  readonly dead: number;
  readonly tradesSettled: number;
  readonly offersFailed: number;
  readonly rejected: number;
}

export interface Metric {
  readonly name: string;
  readonly value: string;
  readonly passLine: string;
  readonly pass: boolean | null;
}

export interface NationPairs {
  readonly pairs: number;
  /** Median of trading / isolating - 1 over this nation's pairs, in percent, one decimal. */
  readonly medianPct: number;
  /** Share of this nation's pairs at the +15% pass line or above. */
  readonly shareAtPassLine: number;
}

export interface Gate1Report {
  readonly firstSeed: number;
  readonly games: number;
  readonly ticks: number;
  readonly metrics: readonly Metric[];
  readonly rows: readonly Gate1GameRow[];
  readonly pairs: readonly PairResult[];
  /** Median over the paired runs of trading / isolating - 1. */
  readonly medianGain: number;
  /** Share of paired runs at +15% or more. */
  readonly shareAtPassLine: number;
  readonly topShare: Readonly<Record<string, number>>;
  readonly strategyTopShare: Readonly<Record<string, { assigned: number; tops: number }>>;
  readonly strategyMeanOwnBp: Readonly<Record<string, number>>;
  readonly perNation: Readonly<Record<string, NationPairs>>;
  readonly pass: boolean;
}

export interface Gate1RangesReport {
  readonly ranges: readonly Gate1Report[];
  /** Every metric over all the ranges' games and pairs together. */
  readonly pooled: Gate1Report;
  /** Every range and the pooled run pass. */
  readonly pass: boolean;
}

/** Raw counts from a run of seeds; ranges are pooled by adding these up. */
interface Tally {
  readonly firstSeed: number;
  readonly requested: number;
  readonly ticks: number;
  readonly playable: readonly string[];
  readonly regions: number;
  crashes: number;
  negatives: number;
  readonly rows: Gate1GameRow[];
  readonly pairs: PairResult[];
  readonly tops: Record<string, number>;
  readonly byStrategy: Record<string, { assigned: number; tops: number; ownSum: number }>;
  nationGames: number;
  deadCount: number;
  readonly ledger: { foodP: number; foodC: number; energyP: number; energyC: number; income: number; sinks: number };
}

/** The Gate 1 trade line: trading beats isolating by 15% or more. */
const PASS_LINE_PCT = 15;

const DEAD_BP = 5_000;

/** Seeded strategy per playable nation: uniform over the four archetypes. */
export function assignStrategies(seed: number, playable: readonly string[]): Record<string, Strategy> {
  const out: Record<string, Strategy> = {};
  playable.forEach((id, i) => {
    out[id] = STRATEGIES[mix32(seed * 7919 + i * 104_729 + 17) % STRATEGIES.length] as Strategy;
  });
  return out;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function negativeStocks(state: WorldState): number {
  let count = 0;
  for (const id of state.nationOrder) {
    const s = state.nations[id]?.private.stocks;
    if (s === undefined) continue;
    for (const r of ['food', 'energy', 'credit'] as Resource[]) if (s[r] < 0) count++;
  }
  return count;
}

function playRange(options: Gate1Options): Tally {
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const roster = options.roster;
  const playable = roster.filter((r) => (r.endowment?.kind ?? 'playable') === 'playable').map((r) => r.id);
  const t: Tally = {
    firstSeed: options.firstSeed,
    requested: options.games,
    ticks,
    playable,
    regions: roster.length - playable.length,
    crashes: 0,
    negatives: 0,
    rows: [],
    pairs: [],
    tops: Object.fromEntries(playable.map((id) => [id, 0])),
    byStrategy: Object.fromEntries(STRATEGIES.map((s) => [s, { assigned: 0, tops: 0, ownSum: 0 }])),
    nationGames: 0,
    deadCount: 0,
    ledger: { foodP: 0, foodC: 0, energyP: 0, energyC: 0, income: 0, sinks: 0 },
  };

  for (let g = 0; g < options.games; g++) {
    const seed = options.firstSeed + g;
    const strategies = assignStrategies(seed, playable);
    try {
      const result = playGame({
        seed,
        ticks,
        roster,
        strategies,
        humanSwitch: false,
        onTick: (state) => {
          t.negatives += negativeStocks(state);
        },
      });
      const l = result.state.ledger;
      t.ledger.foodP += l.foodProduced;
      t.ledger.foodC += l.foodConsumed;
      t.ledger.energyP += l.energyProduced;
      t.ledger.energyC += l.energyConsumed;
      t.ledger.income += l.creditIncome;
      t.ledger.sinks += l.creditSpentResilience;

      let best = result.score.nations[0];
      let dead = 0;
      for (const n of result.score.nations) {
        const strategy = strategies[n.id] as Strategy;
        const entry = t.byStrategy[strategy] as { assigned: number; tops: number; ownSum: number };
        entry.assigned++;
        entry.ownSum += n.ownScoreBp;
        t.nationGames++;
        if (n.ownScoreBp < DEAD_BP) dead++;
        if (best === undefined || n.finalScore > best.finalScore) best = n;
      }
      t.deadCount += dead;
      if (best !== undefined) {
        t.tops[best.id] = (t.tops[best.id] ?? 0) + 1;
        (t.byStrategy[strategies[best.id] as Strategy] as { tops: number }).tops++;
      }
      t.rows.push({
        seed,
        top: best?.id ?? '',
        topStrategy: strategies[best?.id ?? ''] as Strategy,
        multiplierBp: result.score.multiplierBp,
        dead,
        tradesSettled: result.metrics.tradesSettled,
        offersFailed: result.metrics.offersFailed,
        rejected: result.metrics.rejectedAtStep + result.metrics.rejectedAtSubmit,
      });

      // Paired run: one nation, same world, trading vs isolating.
      const who = playable[mix32(seed ^ 0x51ed27) % playable.length] as string;
      const own = (s: Strategy): { bp: number } => {
        const r = playGame({ seed, ticks, roster, strategies: { ...strategies, [who]: s }, humanSwitch: false });
        return { bp: r.score.nations.find((n) => n.id === (who as NationId))?.ownScoreBp ?? 0 };
      };
      const trading = own('trader');
      const isolating = own('isolationist');
      t.pairs.push({ seed, nation: who, tradingBp: trading.bp, isolatingBp: isolating.bp, isolatingDead: isolating.bp < DEAD_BP });
    } catch (error) {
      t.crashes++;
      console.error(`seed ${seed} crashed:`, error);
    }
  }
  return t;
}

/** Adds up consecutive ranges' tallies as if they were one run. */
function mergeTallies(parts: readonly Tally[]): Tally {
  const first = parts[0] as Tally;
  const out: Tally = {
    ...first,
    requested: 0,
    crashes: 0,
    negatives: 0,
    rows: [],
    pairs: [],
    tops: Object.fromEntries(first.playable.map((id) => [id, 0])),
    byStrategy: Object.fromEntries(STRATEGIES.map((s) => [s, { assigned: 0, tops: 0, ownSum: 0 }])),
    nationGames: 0,
    deadCount: 0,
    ledger: { foodP: 0, foodC: 0, energyP: 0, energyC: 0, income: 0, sinks: 0 },
  };
  for (const p of parts) {
    (out as { requested: number }).requested += p.requested;
    out.crashes += p.crashes;
    out.negatives += p.negatives;
    out.rows.push(...p.rows);
    out.pairs.push(...p.pairs);
    for (const [id, n] of Object.entries(p.tops)) out.tops[id] = (out.tops[id] ?? 0) + n;
    for (const [s, e] of Object.entries(p.byStrategy)) {
      const o = out.byStrategy[s] as { assigned: number; tops: number; ownSum: number };
      o.assigned += e.assigned;
      o.tops += e.tops;
      o.ownSum += e.ownSum;
    }
    out.nationGames += p.nationGames;
    out.deadCount += p.deadCount;
    for (const k of Object.keys(out.ledger) as (keyof Tally['ledger'])[]) out.ledger[k] += p.ledger[k];
  }
  return out;
}

const gainOf = (p: PairResult): number => p.tradingBp / Math.max(1, p.isolatingBp) - 1;
const atPassLine = (p: PairResult): boolean => p.tradingBp * 100 >= Math.max(1, p.isolatingBp) * (100 + PASS_LINE_PCT);

function reportFrom(t: Tally): Gate1Report {
  const { playable, ticks, ledger } = t;
  const fairShare = 1 / playable.length;
  const pairs = t.pairs;
  const medianGap = median(pairs.map(gainOf));
  const share = (list: readonly PairResult[]): number => (list.length === 0 ? 0 : list.filter(atPassLine).length / list.length);
  const shareAtPassLine = share(pairs);
  const worseShare = pairs.length === 0 ? 0 : pairs.filter((p) => p.isolatingBp < p.tradingBp).length / pairs.length;
  const isolatedDead = pairs.filter((p) => p.isolatingDead).length;
  const deadRate = t.nationGames === 0 ? 0 : t.deadCount / t.nationGames;
  const games = t.rows.length;
  const topShare = Object.fromEntries(Object.entries(t.tops).map(([id, n]) => [id, games === 0 ? 0 : n / games]));
  const maxTop = Object.entries(topShare).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const foodRatio = ledger.foodP === 0 ? 0 : ledger.foodC / ledger.foodP;
  const energyRatio = ledger.energyP === 0 ? 0 : ledger.energyC / ledger.energyP;
  const creditRatio = ledger.income === 0 ? 0 : ledger.sinks / ledger.income;
  const inBand = (x: number, lo: number, hi: number): boolean => x >= lo && x <= hi;
  const rejected = t.rows.reduce((s, r) => s + r.rejected, 0);

  const byNation: Record<string, PairResult[]> = {};
  for (const p of pairs) (byNation[p.nation] ??= []).push(p);
  const perNation = Object.fromEntries(
    Object.entries(byNation)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, list]) => [id, { pairs: list.length, medianPct: Math.round(median(list.map(gainOf)) * 1000) / 10, shareAtPassLine: share(list) }]),
  );

  const metrics: Metric[] = [
    { name: `Seeded full-roster games (${playable.length} nations + ${t.regions} regions, ${ticks} ticks)`, value: `${games} + ${pairs.length * 2} paired`, passLine: `${t.requested} with no crashes`, pass: t.crashes === 0 && games === t.requested },
    { name: 'Crashes', value: String(t.crashes), passLine: '0', pass: t.crashes === 0 },
    { name: 'Negative stocks (every nation, every tick)', value: String(t.negatives), passLine: '0', pass: t.negatives === 0 },
    { name: 'Food consumed / produced (world)', value: pct(foodRatio), passLine: '75-100%', pass: inBand(foodRatio, 0.75, 1) },
    { name: 'Energy consumed / produced (world)', value: pct(energyRatio), passLine: '75-100%', pass: inBand(energyRatio, 0.75, 1) },
    { name: 'Credit sinks / Credit income (world)', value: pct(creditRatio), passLine: '0-25%', pass: inBand(creditRatio, 0, 0.25) },
    { name: 'Same nation, trading vs isolating (median of paired runs)', value: `${medianGap >= 0 ? '+' : ''}${pct(medianGap)}`, passLine: `>= +${PASS_LINE_PCT}%`, pass: medianGap >= PASS_LINE_PCT / 100 },
    { name: `Pairs at +${PASS_LINE_PCT}% or more`, value: pct(shareAtPassLine), passLine: 'info', pass: null },
    { name: 'Isolationists worse off (pairs where isolating scores lower)', value: pct(worseShare), passLine: '> 50%', pass: worseShare > 0.5 },
    { name: 'Isolationists alive (dead isolating runs)', value: String(isolatedDead), passLine: '0', pass: isolatedDead === 0 },
    { name: 'Dead states (ownScore < 0.50 at game end)', value: pct(deadRate), passLine: '< 2%', pass: deadRate < 0.02 },
    { name: `Most frequent top scorer (${maxTop[0]})`, value: pct(maxTop[1]), passLine: `<= ${pct(2 * fairShare)} (2x fair share)`, pass: maxTop[1] <= 2 * fairShare },
    { name: 'Commands rejected by the sim (all bots)', value: String(rejected), passLine: 'info', pass: null },
    { name: 'A trade in 3 taps or fewer', value: 'interface check (lane U)', passLine: '<= 3 taps', pass: null },
    { name: 'Gate 0 still passes', value: 'npm test: determinism, purity, save/load', passLine: 'all pass', pass: null },
  ];

  const strategyMeanOwnBp = Object.fromEntries(
    STRATEGIES.map((s) => {
      const e = t.byStrategy[s] as { assigned: number; ownSum: number };
      return [s, e.assigned === 0 ? 0 : Math.round(e.ownSum / e.assigned)];
    }),
  );
  const strategyTopShare = Object.fromEntries(STRATEGIES.map((s) => [s, { assigned: t.byStrategy[s]?.assigned ?? 0, tops: t.byStrategy[s]?.tops ?? 0 }]));

  return {
    firstSeed: t.firstSeed,
    games,
    ticks,
    metrics,
    rows: t.rows,
    pairs,
    medianGain: medianGap,
    shareAtPassLine,
    topShare,
    strategyTopShare,
    strategyMeanOwnBp,
    perNation,
    pass: metrics.every((m) => m.pass !== false),
  };
}

export function runGate1(options: Gate1Options): Gate1Report {
  return reportFrom(playRange(options));
}

/** Runs `ranges` consecutive ranges of `games` seeds and reports each one plus all of them pooled. */
export function runGate1Ranges(options: Gate1RangeOptions): Gate1RangesReport {
  const tallies: Tally[] = [];
  for (let r = 0; r < options.ranges; r++) {
    tallies.push(playRange({ ...options, firstSeed: options.firstSeed + r * options.games }));
  }
  const ranges = tallies.map(reportFrom);
  const pooled = reportFrom(mergeTallies(tallies));
  return { ranges, pooled, pass: pooled.pass && ranges.every((r) => r.pass) };
}

const seedsOf = (r: Gate1Report): string => `seeds ${r.firstSeed}-${r.firstSeed + r.games - 1}`;
const signed = (pctValue: number): string => `${pctValue >= 0 ? '+' : ''}${pctValue.toFixed(1)}%`;

/** The results as a Markdown report: the metrics table, then the detail tables. */
export function formatGate1(report: Gate1Report, title = `Gate 1 suite: ${report.games} games x ${report.ticks} ticks, ${seedsOf(report)}`): string {
  const lines = [
    `# ${title} - ${report.pass ? 'PASS' : 'FAIL'}`,
    '',
    '| Metric | Result | Pass line | |',
    '|---|---|---|---|',
    ...report.metrics.map((m) => `| ${m.name} | ${m.value} | ${m.passLine} | ${m.pass === null ? 'see note' : m.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Top scorer share by nation',
    '',
    '| Nation | Games topped |',
    '|---|---|',
    ...Object.entries(report.topShare)
      .sort((a, b) => b[1] - a[1])
      .map(([id, share]) => `| ${id} | ${pct(share)} |`),
    '',
    '## By strategy (random assignment)',
    '',
    '| Strategy | Nation-games | Tops | Top share / fair share | Mean ownScore |',
    '|---|---|---|---|---|',
    ...Object.entries(report.strategyTopShare).map(([s, e]) => {
      const games = report.games;
      const share = games === 0 ? 0 : e.tops / games;
      const assignedShare = e.assigned / Math.max(1, Object.values(report.strategyTopShare).reduce((sum, x) => sum + x.assigned, 0));
      return `| ${s} | ${e.assigned} | ${e.tops} | ${(share / Math.max(1e-9, assignedShare)).toFixed(2)}x | ${((report.strategyMeanOwnBp[s] ?? 0) / 10_000).toFixed(3)} |`;
    }),
    '',
    '## Trading vs isolating, median gain by nation (paired runs)',
    '',
    `| Nation | Pairs | Median gain | Pairs at +${PASS_LINE_PCT}% or more |`,
    '|---|---|---|---|',
    ...Object.entries(report.perNation).map(([id, n]) => `| ${id} | ${n.pairs} | ${signed(n.medianPct)} | ${pct(n.shareAtPassLine)} |`),
    '',
  ];
  return lines.join('\n');
}

/** Several ranges: a one-line-per-range summary, then the pooled report, then each range in full. */
export function formatGate1Ranges(report: Gate1RangesReport): string {
  const topOf = (r: Gate1Report): string => {
    const [id, share] = Object.entries(r.topShare).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    return `${id} ${pct(share)}`;
  };
  const row = (label: string, r: Gate1Report): string =>
    `| ${label} | ${signed(r.medianGain * 100)} | ${pct(r.shareAtPassLine)} | ${topOf(r)} | ${r.metrics.filter((m) => m.pass === false).map((m) => m.name).join('; ') || 'none'} | ${r.pass ? 'PASS' : 'FAIL'} |`;
  const pooled = report.pooled;
  const lines = [
    `# Gate 1 suite: ${report.ranges.length} ranges, ${pooled.games} games x ${pooled.ticks} ticks - ${report.pass ? 'PASS' : 'FAIL'}`,
    '',
    `| Seeds | Trading vs isolating (median) | Pairs at +${PASS_LINE_PCT}% or more | Top scorer | Failing metrics | |`,
    '|---|---|---|---|---|---|',
    ...report.ranges.map((r) => row(seedsOf(r).replace('seeds ', ''), r)),
    row(`pooled ${seedsOf(pooled).replace('seeds ', '')}`, pooled),
    '',
    formatGate1(pooled, `Pooled, ${seedsOf(pooled)}`).replace(/^## /gm, '### ').replace(/^# /, '## '),
    ...report.ranges.map((r) => formatGate1(r, `Range ${seedsOf(r)}`).replace(/^## /gm, '### ').replace(/^# /, '## ')),
  ];
  return lines.join('\n');
}
