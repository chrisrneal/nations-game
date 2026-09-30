/**
 * Two permanent lines of the gate2 suite that ask whether a player's choices
 * matter (prompt 17; measured as in docs/gates/GO-NO-GO.md, "How to
 * reproduce"):
 *
 * 1. **AI vs idle.** The same nation, on paired seeds, in an all-AI world like
 *    the phone's: played by the shipped AI in one game, left idle on the default
 *    standing policies all game in the other (the `away` option, month 0 to the
 *    end). The gap is (played - idle) / played of the nation's final score.
 * 2. **Decision density.** In the idle game: the trade offers the nation
 *    received, the crisis appeals asked of it, and how many of those appeals its
 *    default monthly contribution had already paid in full when they opened.
 *
 * The nation for seed `s` is `playable[(s - 1) % playable.length]`, so every
 * nation gets an equal share of the seeds in any run that is a multiple of 17
 * long and near-equal otherwise. The pass lines are prompt 17's pre-registered
 * target 3 (docs/balance/gate2-prompt17.md): at least 10% overall and at least
 * 8% for each of the four Credit buyers.
 */
import type { CrisisEventPayloads, Event, NationId } from '@nations/contracts';
import { TUNABLES, type RosterEntry } from '@nations/sim';
import { playGame, type GameResult } from './game.ts';
import type { Metric } from './gate1.ts';

/** The four Credit buyers whose choices barely mattered before prompt 17 (GO-NO-GO section 2). */
export const CREDIT_BUYERS = ['japan', 'korea', 'mexico', 'turkiye'] as const;

export interface IdleLineOptions {
  readonly games: number;
  readonly firstSeed: number;
  readonly roster: readonly RosterEntry[];
  readonly ticks?: number;
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
}

/** World Credit flows over the played (all-AI) games. */
export interface WorldSinks {
  income: number;
  resilience: number;
  crises: number;
}

export interface IdleLines {
  readonly firstSeed: number;
  readonly games: number;
  readonly pairs: readonly IdlePair[];
  readonly density: readonly Density[];
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

/** Plays both lines for seeds [firstSeed, firstSeed + games): two games a seed. */
export function runIdleLines(options: IdleLineOptions): IdleLines {
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const playable = playableOf(options.roster);
  const pairs: IdlePair[] = [];
  const density: Density[] = [];
  const sinks: WorldSinks = { income: 0, resilience: 0, crises: 0 };

  for (let g = 0; g < options.games; g++) {
    const seed = options.firstSeed + g;
    const nation = nationForSeed(seed, playable);
    const id = nation as NationId;
    const played = playGame({ seed, ticks, roster: options.roster, humanSwitch: false });
    const l = played.state.ledger;
    sinks.income += l.creditIncome;
    sinks.resilience += l.creditSpentResilience;
    sinks.crises += l.creditSpentCrises;

    let offers = 0;
    let appeals = 0;
    let prepaid = 0;
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
              // The pool's round is what the nation has paid since the pool last locked, at the moment the appeal opens.
              if ((state.pools[crisis.pool].round[id] ?? 0) >= share) prepaid++;
            }
          }
        }
      },
    });
    pairs.push({ seed, nation, played: finalOf(played, nation), idle: finalOf(idle, nation), playedRank: rankOf(played, nation), idleRank: rankOf(idle, nation) });
    density.push({ seed, nation, offers, appeals, prepaid });
  }
  return { firstSeed: options.firstSeed, games: options.games, pairs, density, sinks };
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

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/** The metric lines, with the pass lines fixed by prompt 17's pre-registered target 3. */
export function idleMetrics(lines: IdleLines): Metric[] {
  const overall = median(lines.pairs.map(gapOf));
  const byNation = gapByNation(lines.pairs);
  const buyers = CREDIT_BUYERS.map((n) => byNation.find((g) => g.nation === n));
  const buyersPass = buyers.every((b) => b !== undefined && b.medianGap >= 0.08);
  const beat = lines.pairs.length === 0 ? 0 : lines.pairs.filter((p) => p.played > p.idle).length / lines.pairs.length;
  const s = lines.sinks;
  const sinkShare = s.income === 0 ? 0 : (s.resilience + s.crises) / s.income;
  const d = lines.density;
  const per = (f: (x: Density) => number): number => (d.length === 0 ? 0 : d.reduce((sum, x) => sum + f(x), 0) / d.length);
  const appeals = d.reduce((sum, x) => sum + x.appeals, 0);
  const prepaid = d.reduce((sum, x) => sum + x.prepaid, 0);
  return [
    { name: `AI vs idle, same nation, paired seeds (${lines.pairs.length} pairs): playing beats idling`, value: pct(beat), passLine: 'info', pass: null },
    { name: 'AI vs idle: median gap, overall ((played - idle) / played)', value: signed(overall), passLine: '>= +10%', pass: overall >= 0.1 },
    {
      name: 'AI vs idle: median gap for Japan, Korea, Mexico, Turkiye',
      value: CREDIT_BUYERS.map((n, i) => `${n} ${buyers[i] === undefined ? 'n/a' : signed(buyers[i]!.medianGap)}`).join(', '),
      passLine: 'each >= +8%',
      pass: buyersPass,
    },
    { name: 'Credit sinks / Credit income, all-AI world (resilience + crises; prompt 17 target: 8-25% with a Credit sink that competes)', value: pct(sinkShare), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: trade offers received per game', value: per((x) => x.offers).toFixed(1), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: crisis appeals with a share to pay per game', value: per((x) => x.appeals).toFixed(1), passLine: 'info', pass: null },
    { name: 'Decision density, idle nation: appeals already paid in full when they open', value: appeals === 0 ? 'n/a' : pct(prepaid / appeals), passLine: 'info', pass: null },
  ];
}

/** The detail table for the report: the gap by nation. */
export function formatIdleLines(lines: IdleLines): string {
  const seeds = `seeds ${lines.firstSeed}-${lines.firstSeed + lines.games - 1}`;
  const out = [`## AI vs idle by nation (${seeds}; median of (played - idle) / played)`, '', '| Nation | Pairs | Median gap | Median rank played / idle |', '|---|---|---|---|'];
  for (const g of gapByNation(lines.pairs)) {
    const mine = lines.pairs.filter((p) => p.nation === g.nation);
    out.push(`| ${g.nation} | ${g.pairs} | ${signed(g.medianGap)} | ${median(mine.map((p) => p.playedRank)).toFixed(0)} / ${median(mine.map((p) => p.idleRank)).toFixed(0)} |`);
  }
  out.push('');
  return out.join('\n');
}
