/**
 * The prompt 17 lines of the gate2 suite (docs/gates/GO-NO-GO.md, "How to
 * reproduce"; docs/balance/gate2-prompt17.md):
 *
 * 1. **AI vs idle.** The same nation, on paired seeds, in an all-AI world like
 *    the phone's: played by the shipped AI in one game, left idle on the default
 *    standing policies all game in the other (the `away` option, month 0 to the
 *    end). The gap is (played - idle) / played of the nation's final score.
 * 2. **Decision density.** In the idle game: trade offers the nation received,
 *    crisis appeals asked of it, and how many of those appeals its default
 *    monthly contribution had already paid in full when they opened, plus the
 *    months the home-investment card (RULES 8.1) would have been open.
 * 3. **Fixed-rate investment.** The same nation, same seeds, playing the AI's
 *    trade with its investment plan replaced by "invest N% of spare Credit a
 *    month" for N in {0, 10, 25, 50, 100}. Which rate is best differs by nation
 *    only if investing is a real trade-off.
 *
 * The nation for seed `s` is `playable[(s - 1) % playable.length]`, so every
 * nation gets an equal share of the seeds in any range that is a multiple of 17
 * long and near-equal otherwise. Pass lines are fixed before any run they grade
 * (prompt 17 pre-registered targets 1-3) and are in `investMetrics`.
 */
import type { CrisisEventPayloads, Event, NationId } from '@nations/contracts';
import { TUNABLES, viewFor, type RosterEntry, type WorldState } from '@nations/sim';
import { INVEST_RATES, type Strategy } from './bots.ts';
import { playGame, type GameResult } from './game.ts';
import type { Metric } from './gate1.ts';

/** The four Credit buyers prompt 17 is meant to give a lever (GO-NO-GO section 2). */
export const CREDIT_BUYERS = ['japan', 'korea', 'mexico', 'turkiye'] as const;

/** A best rate within this share of the top median counts as tied with it; the lowest tied rate is "best" (see `bestRate`). */
export const TIE_TOLERANCE = 0.005;

export interface InvestLineOptions {
  readonly games: number;
  readonly firstSeed: number;
  readonly roster: readonly RosterEntry[];
  readonly ticks?: number;
  /** Skip the fixed-rate sweep (5 extra games per seed). */
  readonly skipRates?: boolean;
}

export interface IdlePair {
  readonly seed: number;
  readonly nation: string;
  readonly played: number;
  readonly idle: number;
  readonly playedRank: number;
  readonly idleRank: number;
}

export interface Density {
  readonly seed: number;
  readonly nation: string;
  readonly offers: number;
  readonly appeals: number;
  readonly prepaid: number;
  /** Months in which the home-investment card would have been open for this idle nation. */
  readonly investCards: number;
}

export interface RateRow {
  readonly seed: number;
  readonly nation: string;
  /** Final score at each fixed rate, in INVEST_RATES order. */
  readonly byRate: readonly number[];
  /** The shipped AI's plan (the "trader" game) and the idle game, for comparison. */
  readonly ai: number;
  readonly idle: number;
  /** The nation as the self-reliant AI: investing by plan with trade closed (absent when the sweep is skipped). */
  readonly selfReliant: number;
  /** The nation as the isolationist bot: trade closed, investing by the default dial only. */
  readonly isolationist: number;
}

export interface WorldSinks {
  income: number;
  resilience: number;
  crises: number;
  investment: number;
}

export interface InvestLines {
  readonly firstSeed: number;
  readonly games: number;
  readonly pairs: readonly IdlePair[];
  readonly density: readonly Density[];
  readonly rates: readonly RateRow[];
  /** World Credit sinks over the played (all-AI) games. */
  readonly sinks: WorldSinks;
}

export const playableOf = (roster: readonly RosterEntry[]): string[] => roster.filter((r) => (r.endowment?.kind ?? 'playable') === 'playable').map((r) => r.id);

/** The nation that plays seed `seed` in these lines. */
export const nationForSeed = (seed: number, playable: readonly string[]): string => playable[(seed - 1) % playable.length] as string;

function finalOf(result: GameResult, id: string): number {
  return result.score.nations.find((n) => n.id === (id as NationId))?.finalScore ?? 0;
}

function rankOf(result: GameResult, id: string): number {
  const mine = finalOf(result, id);
  return 1 + result.score.nations.filter((n) => n.finalScore > mine).length;
}

/** The home-investment card is open (RULES 8.1): short of a good three months running, room to build, and Credit for a point. */
export function investCardOpen(state: WorldState, id: NationId, shortMonths: { food: number; energy: number }): boolean {
  const view = viewFor(state, id);
  const last = view.self.private.last;
  shortMonths.food = last.unmetFood > 0 ? shortMonths.food + 1 : 0;
  shortMonths.energy = last.unmetEnergy > 0 ? shortMonths.energy + 1 : 0;
  return (['food', 'energy'] as const).some((g) => {
    const q = view.invest[g];
    return shortMonths[g] >= 3 && q.gapBp > 0 && q.roomBp > 0 && view.self.private.stocks.credit >= q.nextPointCost;
  });
}

/** Plays every line for seeds [firstSeed, firstSeed + games). */
export function runInvestLines(options: InvestLineOptions): InvestLines {
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const playable = playableOf(options.roster);
  const pairs: IdlePair[] = [];
  const density: Density[] = [];
  const rates: RateRow[] = [];
  const sinks: WorldSinks = { income: 0, resilience: 0, crises: 0, investment: 0 };

  for (let g = 0; g < options.games; g++) {
    const seed = options.firstSeed + g;
    const nation = nationForSeed(seed, playable);
    const id = nation as NationId;
    const played = playGame({ seed, ticks, roster: options.roster, humanSwitch: false });
    const l = played.state.ledger;
    sinks.income += l.creditIncome;
    sinks.resilience += l.creditSpentResilience;
    sinks.crises += l.creditSpentCrises;
    sinks.investment += l.creditSpentInvestment;

    let offers = 0;
    let appeals = 0;
    let prepaid = 0;
    let investCards = 0;
    const short = { food: 0, energy: 0 };
    const idle = playGame({
      seed,
      ticks,
      roster: options.roster,
      humanSwitch: false,
      away: [{ nation, from: 0, to: ticks + 1 }],
      onTick: (state, events: readonly Event[]) => {
        for (const e of events) {
          if (e.type === 'offerMade' && (e.payload as { offer: { to: string } }).offer.to === nation) offers++;
          else if (e.type === 'crisisOpened') {
            const crisis = (e.payload as CrisisEventPayloads['crisisOpened']).crisis;
            const share = crisis.shares[id] ?? 0;
            if (share > 0) {
              appeals++;
              if ((state.pools[crisis.pool].round[id] ?? 0) >= share) prepaid++;
            }
          }
        }
        if (investCardOpen(state, id, short)) investCards++;
      },
    });
    pairs.push({ seed, nation, played: finalOf(played, nation), idle: finalOf(idle, nation), playedRank: rankOf(played, nation), idleRank: rankOf(idle, nation) });
    density.push({ seed, nation, offers, appeals, prepaid, investCards });

    if (options.skipRates !== true) {
      const byRate = INVEST_RATES.map((rate) => finalOf(playGame({ seed, ticks, roster: options.roster, humanSwitch: false, strategies: { [nation]: `invest${rate}` as Strategy } }), nation));
      const alone = (s: Strategy): number => finalOf(playGame({ seed, ticks, roster: options.roster, humanSwitch: false, strategies: { [nation]: s } }), nation);
      rates.push({ seed, nation, byRate, ai: finalOf(played, nation), idle: finalOf(idle, nation), selfReliant: alone('selfReliant'), isolationist: alone('isolationist') });
    }
  }
  return { firstSeed: options.firstSeed, games: options.games, pairs, density, rates, sinks };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** (played - idle) / played: how much of the played score the idle nation would have lost. */
export const gapOf = (p: IdlePair): number => (p.played <= 0 ? 0 : (p.played - p.idle) / p.played);

export interface NationGap {
  readonly nation: string;
  readonly pairs: number;
  readonly medianGap: number;
}

export function gapByNation(pairs: readonly IdlePair[]): NationGap[] {
  const by = new Map<string, IdlePair[]>();
  for (const p of pairs) by.set(p.nation, [...(by.get(p.nation) ?? []), p]);
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([nation, list]) => ({ nation, pairs: list.length, medianGap: median(list.map(gapOf)) }));
}

/** One nation's row of the fixed-rate sweep. */
export interface RateNation {
  readonly nation: string;
  readonly games: number;
  /** Median final score at each rate, in INVEST_RATES order. */
  readonly medians: readonly number[];
  readonly aiMedian: number;
  readonly idleMedian: number;
  readonly selfReliantMedian: number;
  readonly isolationistMedian: number;
  /** The best rate (see `bestRate`) and how far each rate falls short of the top median, as a share of it. */
  readonly best: number;
  readonly loss: readonly number[];
}

/**
 * The best rate for a nation: the LOWEST rate whose median score is within
 * `TIE_TOLERANCE` of the highest median. Nations for which investing changes
 * nothing (exporters) are therefore "best at 0", not at a rate picked by noise.
 * Fixed before any graded run.
 */
export function bestRate(medians: readonly number[]): { rate: number; loss: number[] } {
  const top = Math.max(...medians);
  const loss = medians.map((m) => (top <= 0 ? 0 : (top - m) / top));
  const index = medians.findIndex((m) => top <= 0 || (top - m) / top <= TIE_TOLERANCE);
  return { rate: INVEST_RATES[Math.max(0, index)] as number, loss };
}

export function rateNations(rows: readonly RateRow[]): RateNation[] {
  const by = new Map<string, RateRow[]>();
  for (const r of rows) by.set(r.nation, [...(by.get(r.nation) ?? []), r]);
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([nation, list]) => {
      const medians = INVEST_RATES.map((_, i) => median(list.map((r) => r.byRate[i] as number)));
      const best = bestRate(medians);
      return { nation, games: list.length, medians, aiMedian: median(list.map((r) => r.ai)), idleMedian: median(list.map((r) => r.idle)), selfReliantMedian: median(list.map((r) => r.selfReliant)), isolationistMedian: median(list.map((r) => r.isolationist)), best: best.rate, loss: best.loss };
    });
}

export interface RateVerdict {
  /** How many nations each rate is best for. */
  readonly bestCounts: Readonly<Record<number, number>>;
  /** Rates that are best for at least two nations. */
  readonly ratesWithTwo: number;
  /** Median over nations of the shortfall against the best rate, for never investing and for the highest rate. */
  readonly medianLossNever: number;
  readonly medianLossTop: number;
  /** How many nations fall 3% or more short of their best rate at each end. */
  readonly nationsHurtNever: number;
  readonly nationsHurtTop: number;
  readonly nations: number;
}

export function rateVerdict(nations: readonly RateNation[]): RateVerdict {
  const bestCounts: Record<number, number> = Object.fromEntries(INVEST_RATES.map((r) => [r, 0]));
  for (const n of nations) bestCounts[n.best] = (bestCounts[n.best] ?? 0) + 1;
  return {
    bestCounts,
    ratesWithTwo: Object.values(bestCounts).filter((c) => c >= 2).length,
    medianLossNever: median(nations.map((n) => n.loss[0] as number)),
    medianLossTop: median(nations.map((n) => n.loss[INVEST_RATES.length - 1] as number)),
    nationsHurtNever: nations.filter((n) => (n.loss[0] as number) >= 0.03).length,
    nationsHurtTop: nations.filter((n) => (n.loss[INVEST_RATES.length - 1] as number) >= 0.03).length,
    nations: nations.length,
  };
}

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/** The prompt 17 metric lines, with the pass lines fixed by the prompt's pre-registered targets. */
export function investMetrics(lines: InvestLines): Metric[] {
  const gaps = lines.pairs.map(gapOf);
  const overall = median(gaps);
  const byNation = gapByNation(lines.pairs);
  const buyers = CREDIT_BUYERS.map((n) => byNation.find((g) => g.nation === n));
  const buyersPass = buyers.every((b) => b !== undefined && b.medianGap >= 0.08);
  const beat = lines.pairs.length === 0 ? 0 : lines.pairs.filter((p) => p.played > p.idle).length / lines.pairs.length;
  const s = lines.sinks;
  const sinkTotal = s.resilience + s.crises + s.investment;
  const sinkShare = s.income === 0 ? 0 : sinkTotal / s.income;
  const d = lines.density;
  const per = (f: (x: Density) => number): number => (d.length === 0 ? 0 : d.reduce((sum, x) => sum + f(x), 0) / d.length);
  const appeals = d.reduce((sum, x) => sum + x.appeals, 0);
  const prepaid = d.reduce((sum, x) => sum + x.prepaid, 0);
  const metrics: Metric[] = [
    { name: `AI vs idle, same nation, paired seeds (${lines.pairs.length} pairs): playing beats idling`, value: pct(beat), passLine: 'info', pass: null },
    { name: 'AI vs idle: median gap, overall ((played - idle) / played)', value: signed(overall), passLine: '>= +10%', pass: overall >= 0.1 },
    {
      name: 'AI vs idle: median gap for Japan, Korea, Mexico, Turkiye',
      value: CREDIT_BUYERS.map((n, i) => `${n} ${buyers[i] === undefined ? 'n/a' : signed(buyers[i]!.medianGap)}`).join(', '),
      passLine: 'each >= +8%',
      pass: buyersPass,
    },
    { name: 'Credit sinks / Credit income, all-AI world (resilience + crises + investment)', value: `${pct(sinkShare)} (investment ${pct(s.income === 0 ? 0 : s.investment / s.income)})`, passLine: '8-25%', pass: sinkShare >= 0.08 && sinkShare <= 0.25 },
    { name: 'Decision density, idle nation: trade offers received per game', value: per((x) => x.offers).toFixed(1), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: crisis appeals with a share to pay per game', value: per((x) => x.appeals).toFixed(1), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: appeals already paid in full when they open', value: appeals === 0 ? 'n/a' : pct(prepaid / appeals), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: months the home-investment card would be open per game', value: per((x) => x.investCards).toFixed(1), passLine: 'info', pass: null },
  ];
  if (lines.rates.length > 0) {
    // Collaboration against self-reliance (prompt 17 target 4's spirit): trading beats closing trade even when the closed nation builds by the AI's own plan.
    const vs = (other: (r: RateRow) => number): number => median(lines.rates.map((r) => (other(r) <= 0 ? 0 : r.ai / other(r) - 1)));
    metrics.push(
      { name: 'Collaboration vs self-reliance: trader (trades and builds) over the self-reliant AI (builds, trade closed), median final score', value: signed(vs((r) => r.selfReliant)), passLine: 'info', pass: null },
      { name: 'Collaboration vs isolation: trader over the isolationist bot (default dial only), median final score', value: signed(vs((r) => r.isolationist)), passLine: 'info', pass: null },
    );
    const v = rateVerdict(rateNations(lines.rates));
    metrics.push(
      { name: `Fixed investment rates (${INVEST_RATES.map((r) => `${r}%`).join(', ')}): rates that are best for at least two nations`, value: `${v.ratesWithTwo} (${INVEST_RATES.map((r) => `${r}%: ${v.bestCounts[r] ?? 0}`).join(', ')})`, passLine: '>= 3', pass: v.ratesWithTwo >= 3 },
      { name: 'Fixed investment rates: never investing vs the best rate, median nation', value: `${pct(v.medianLossNever)} below (${v.nationsHurtNever} of ${v.nations} nations at least 3% below)`, passLine: '>= 3% below', pass: v.medianLossNever >= 0.03 },
      { name: `Fixed investment rates: the highest rate (${INVEST_RATES[INVEST_RATES.length - 1]}%) vs the best rate, median nation`, value: `${pct(v.medianLossTop)} below (${v.nationsHurtTop} of ${v.nations} nations at least 3% below)`, passLine: '>= 3% below', pass: v.medianLossTop >= 0.03 },
    );
  }
  return metrics;
}

/** The detail tables for the report: gap by nation, then the fixed-rate sweep. */
export function formatInvestLines(lines: InvestLines): string {
  const out: string[] = [];
  const seeds = `seeds ${lines.firstSeed}-${lines.firstSeed + lines.games - 1}`;
  out.push(`## AI vs idle by nation (${seeds}; median of (played - idle) / played)`, '', '| Nation | Pairs | Median gap | Median rank played / idle |', '|---|---|---|---|');
  for (const g of gapByNation(lines.pairs)) {
    const mine = lines.pairs.filter((p) => p.nation === g.nation);
    out.push(`| ${g.nation} | ${g.pairs} | ${signed(g.medianGap)} | ${median(mine.map((p) => p.playedRank)).toFixed(0)} / ${median(mine.map((p) => p.idleRank)).toFixed(0)} |`);
  }
  if (lines.rates.length > 0) {
    const nations = rateNations(lines.rates);
    out.push('', `## Fixed investment rates by nation (${seeds}; median final score, and the best rate)`, '', `| Nation | Games | ${INVEST_RATES.map((r) => `${r}%`).join(' | ')} | Best | AI plan | Self-reliant AI | Isolationist | Idle |`, `|---|---|${INVEST_RATES.map(() => '---').join('|')}|---|---|---|---|---|`);
    for (const n of nations) {
      out.push(`| ${n.nation} | ${n.games} | ${n.medians.map((m, i) => (INVEST_RATES[i] === n.best ? `**${m.toFixed(0)}**` : m.toFixed(0))).join(' | ')} | ${n.best}% | ${n.aiMedian.toFixed(0)} | ${n.selfReliantMedian.toFixed(0)} | ${n.isolationistMedian.toFixed(0)} | ${n.idleMedian.toFixed(0)} |`);
    }
  }
  out.push('');
  return out.join('\n');
}
