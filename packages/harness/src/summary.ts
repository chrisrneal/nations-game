/**
 * Machine-readable summaries of a run, so a script can compare runs without
 * parsing markdown, and the `tune` command (the fast tuning rule, prompt 17b).
 *
 * `gate2.json` (written next to gate2.md by `npm run harness -- gate2`):
 *   firstSeed, games, ticks
 *   topScorerShareByNation   { nation: share of archetype games it topped }   (random archetypes)
 *   mostFrequentTopScorer    { nation, share }
 *   archetypeMultiples       { archetype: tops / fair share }                 (random archetypes)
 *   freeRiderMultiple        the free-rider's multiple (graded at <= 1.5)
 *   creditSinksOverIncomeArchetypeGames   sinks / income in the archetype games
 *   aiVsIdleByNation         { nation: median (played - idle) / played }      (null when --no-invest)
 *   aiVsIdleOverall          median gap over all pairs
 *   creditBuyerGaps          { japan, korea, mexico, turkiye: median gap }
 *   creditSinksOverIncomeAllAi, investmentOverIncomeAllAi   (all-AI world)
 *   homeInvestmentCardMonths months the card is open per game, idle nation
 *   rateSweep                { bestCounts: {rate: nations best at it}, ratesWithTwo, nations,
 *                              nationsHurtNever (2b), nationsHurtTop (2c),
 *                              medianLossNever, medianLossTop } (null when skipped)
 *   pass                     the suite's overall verdict
 *
 * `tune.json` (written by `tune`, also printed as the last stdout line) carries
 * the same names for the same quantities, plus `games`, `firstSeed`, `overrides`
 * and `wallMs`, and `topThree` ([{ nation, share }]).
 */
import { TUNABLES, type RosterEntry } from '@nations/sim';
import { performance } from 'node:perf_hooks';
import { runGate2, type Gate2Report } from './gate2.ts';
import { BUYER_GAP_MAX, BUYER_GAP_MIN, NATIONS_HURT_MIN, investNumbers, runInvestLines, type InvestLines, type InvestNumbers } from './invest-suite.ts';
import { INVEST_RATES } from './bots.ts';

const top = (shares: Readonly<Record<string, number>>): { nation: string; share: number }[] =>
  Object.entries(shares)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([nation, share]) => ({ nation, share }));

const investFields = (n: InvestNumbers | null): Record<string, unknown> => ({
  aiVsIdleByNation: n === null ? null : n.gapByNation,
  aiVsIdleOverall: n === null ? null : n.overallGap,
  creditBuyerGaps: n === null ? null : n.buyerGaps,
  creditSinksOverIncomeAllAi: n === null ? null : n.sinkShare,
  investmentOverIncomeAllAi: n === null ? null : n.investShare,
  homeInvestmentCardMonths: n === null ? null : n.cardMonths,
  rateSweep: n?.rates ?? null,
});

export function gate2Json(report: Gate2Report): Record<string, unknown> {
  const t = top(report.topShare)[0] ?? { nation: '', share: 0 };
  return {
    firstSeed: report.firstSeed,
    games: report.games,
    ticks: report.ticks,
    topScorerShareByNation: report.topShare,
    mostFrequentTopScorer: t,
    archetypeMultiples: report.archetypeMultiples,
    freeRiderMultiple: report.archetypeMultiples.freeRider ?? 0,
    creditSinksOverIncomeArchetypeGames: report.creditSinkShare,
    ...investFields(report.invest === null ? null : investNumbers(report.invest)),
    pass: report.pass,
  };
}

export interface TuneOptions {
  readonly games: number;
  readonly firstSeed: number;
  readonly roster: readonly RosterEntry[];
  readonly ticks?: number;
  readonly skipRates?: boolean;
  readonly overrides?: Readonly<Record<string, number>>;
}

export interface TuneResult {
  readonly options: TuneOptions;
  readonly archetypes: Gate2Report;
  readonly invest: InvestLines;
  readonly numbers: InvestNumbers;
  readonly wallMs: number;
}

/** Plays only what the tuning rule needs: the archetype games (gate2's code path) and the prompt 17 lines without the self-reliant and isolationist games. */
export function runTune(options: TuneOptions): TuneResult {
  const start = performance.now();
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const archetypes = runGate2({ games: options.games, firstSeed: options.firstSeed, roster: options.roster, ticks, archetypesOnly: true });
  const invest = runInvestLines({ games: options.games, firstSeed: options.firstSeed, roster: options.roster, ticks, skipAlone: true, ...(options.skipRates === true ? { skipRates: true } : {}) });
  return { options, archetypes, invest, numbers: investNumbers(invest), wallMs: Math.round(performance.now() - start) };
}

export function tuneJson(r: TuneResult): Record<string, unknown> {
  const a = r.archetypes;
  const shares = top(a.topShare);
  return {
    games: r.options.games,
    firstSeed: r.options.firstSeed,
    overrides: r.options.overrides ?? {},
    wallMs: r.wallMs,
    topScorerShareByNation: a.topShare,
    mostFrequentTopScorer: shares[0] ?? { nation: '', share: 0 },
    topThree: shares.slice(0, 3),
    archetypeMultiples: a.archetypeMultiples,
    freeRiderMultiple: a.archetypeMultiples.freeRider ?? 0,
    creditSinksOverIncomeArchetypeGames: a.creditSinkShare,
    ...investFields(r.numbers),
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const mark = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');

/** One compact summary, ending with the graded lines of prompt 17b. */
export function formatTune(r: TuneResult): string {
  const n = r.numbers;
  const a = r.archetypes;
  const o = r.options;
  const sets = Object.entries(o.overrides ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  const fairShare = 1 / Math.max(1, Object.keys(a.topShare).length);
  const shares = top(a.topShare);
  const out: string[] = [];
  out.push(`# tune: ${o.games} games, seeds ${o.firstSeed}-${o.firstSeed + o.games - 1}${sets === '' ? '' : `, set ${sets}`}, wall ${(r.wallMs / 1000).toFixed(1)} s`, '');
  out.push(`- Credit sinks / income, all-AI world: ${pct(n.sinkShare)} (investment ${pct(n.investShare)}) [8-25%: ${mark(n.sinkShare >= 0.08 && n.sinkShare <= 0.25)}]`);
  out.push(`- AI vs idle, median gap, overall: ${signed(n.overallGap)} [>= +10%: ${mark(n.overallGap >= 0.1)}]`);
  out.push(`- Credit buyers (each ${signed(BUYER_GAP_MIN)} to ${signed(BUYER_GAP_MAX)}): ${Object.entries(n.buyerGaps).map(([k, g]) => `${k} ${g === null ? 'n/a' : signed(g)}`).join(', ')} [${mark(n.buyersInBand)}]`);
  out.push(`- AI vs idle by nation: ${Object.entries(n.gapByNation).map(([k, g]) => `${k} ${signed(g)}`).join(', ')}`);
  if (n.rates === null) out.push('- Fixed rates: skipped (--no-rates)');
  else {
    const v = n.rates;
    const distinct = INVEST_RATES.filter((rate) => (v.bestCounts[rate] ?? 0) > 0).length;
    out.push(`- Fixed rates, best rate per nation: ${INVEST_RATES.map((rate) => `${rate}%: ${v.bestCounts[rate] ?? 0}`).join(', ')}; ${distinct} distinct, ${v.ratesWithTwo} with at least two nations [>= 3: ${mark(v.ratesWithTwo >= 3)}]`);
    out.push(`- 2(b) nations >= 3% below best when never investing: ${v.nationsHurtNever} of ${v.nations} [>= ${NATIONS_HURT_MIN}: ${mark(v.nationsHurtNever >= NATIONS_HURT_MIN)}]`);
    out.push(`- 2(c) nations >= 3% below best at the highest rate: ${v.nationsHurtTop} of ${v.nations} [>= ${NATIONS_HURT_MIN}: ${mark(v.nationsHurtTop >= NATIONS_HURT_MIN)}]`);
    out.push(`- Median nation: never investing ${pct(v.medianLossNever)} below best, highest rate ${pct(v.medianLossTop)} below (info)`);
  }
  out.push(`- Archetype games (random assignment): free-rider ${a.archetypeMultiples.freeRider?.toFixed(2)}x fair share [<= 1.50x: ${mark((a.archetypeMultiples.freeRider ?? 0) <= 1.5)}]; all: ${Object.entries(a.archetypeMultiples).map(([k, m]) => `${k} ${m.toFixed(2)}x`).join(', ')}`);
  const first = shares[0] ?? { nation: '', share: 0 };
  out.push(`- Most frequent top scorer: ${first.nation} ${pct(first.share)} (2x fair share = ${pct(2 * fairShare)}; waived, reported); top three: ${shares.slice(0, 3).map((s) => `${s.nation} ${pct(s.share)}`).join(', ')}`);
  out.push(`- Home-investment card, idle nation: open ${n.cardMonths.toFixed(1)} months per game`);
  return out.join('\n');
}
