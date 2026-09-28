/**
 * The Gate 1 suite (docs/ROADMAP.md, "Gate 1 (Economy and trade)").
 *
 * Plays `games` seeded full-roster games (17 nations + 6 regions, a full
 * game length each) with every playable nation assigned a strategy at random,
 * plus a paired run per seed in which one randomly chosen nation plays the
 * greedy trader in one game and the isolationist in the other, everyone else
 * unchanged. Reports every Gate 1 metric with its pass line.
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

export interface Gate1Report {
  readonly games: number;
  readonly ticks: number;
  readonly metrics: readonly Metric[];
  readonly rows: readonly Gate1GameRow[];
  readonly pairs: readonly PairResult[];
  readonly topShare: Readonly<Record<string, number>>;
  readonly strategyTopShare: Readonly<Record<string, { assigned: number; tops: number }>>;
  readonly strategyMeanOwnBp: Readonly<Record<string, number>>;
  readonly perNationPairMedianPct: Readonly<Record<string, number>>;
  readonly pass: boolean;
}

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

export function runGate1(options: Gate1Options): Gate1Report {
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const roster = options.roster;
  const playable = roster.filter((r) => (r.endowment?.kind ?? 'playable') === 'playable').map((r) => r.id);
  const fairShare = 1 / playable.length;

  let crashes = 0;
  let negatives = 0;
  const rows: Gate1GameRow[] = [];
  const pairs: PairResult[] = [];
  const tops: Record<string, number> = Object.fromEntries(playable.map((id) => [id, 0]));
  const byStrategy: Record<string, { assigned: number; tops: number; ownSum: number }> = Object.fromEntries(
    STRATEGIES.map((s) => [s, { assigned: 0, tops: 0, ownSum: 0 }]),
  );
  let nationGames = 0;
  let deadCount = 0;
  const ledger = { foodP: 0, foodC: 0, energyP: 0, energyC: 0, income: 0, sinks: 0 };

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
          negatives += negativeStocks(state);
        },
      });
      const l = result.state.ledger;
      ledger.foodP += l.foodProduced;
      ledger.foodC += l.foodConsumed;
      ledger.energyP += l.energyProduced;
      ledger.energyC += l.energyConsumed;
      ledger.income += l.creditIncome;
      ledger.sinks += l.creditSpentResilience;

      let best = result.score.nations[0];
      let dead = 0;
      for (const n of result.score.nations) {
        const strategy = strategies[n.id] as Strategy;
        const entry = byStrategy[strategy] as { assigned: number; tops: number; ownSum: number };
        entry.assigned++;
        entry.ownSum += n.ownScoreBp;
        nationGames++;
        if (n.ownScoreBp < DEAD_BP) dead++;
        if (best === undefined || n.finalScore > best.finalScore) best = n;
      }
      deadCount += dead;
      if (best !== undefined) {
        tops[best.id] = (tops[best.id] ?? 0) + 1;
        (byStrategy[strategies[best.id] as Strategy] as { tops: number }).tops++;
      }
      rows.push({
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
      pairs.push({ seed, nation: who, tradingBp: trading.bp, isolatingBp: isolating.bp, isolatingDead: isolating.bp < DEAD_BP });
    } catch (error) {
      crashes++;
      console.error(`seed ${seed} crashed:`, error);
    }
  }

  const gaps = pairs.map((p) => p.tradingBp / Math.max(1, p.isolatingBp) - 1);
  const medianGap = median(gaps);
  const worseShare = pairs.length === 0 ? 0 : pairs.filter((p) => p.isolatingBp < p.tradingBp).length / pairs.length;
  const isolatedDead = pairs.filter((p) => p.isolatingDead).length;
  const deadRate = nationGames === 0 ? 0 : deadCount / nationGames;
  const games = rows.length;
  const topShare = Object.fromEntries(Object.entries(tops).map(([id, n]) => [id, games === 0 ? 0 : n / games]));
  const maxTop = Object.entries(topShare).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const foodRatio = ledger.foodP === 0 ? 0 : ledger.foodC / ledger.foodP;
  const energyRatio = ledger.energyP === 0 ? 0 : ledger.energyC / ledger.energyP;
  const creditRatio = ledger.income === 0 ? 0 : ledger.sinks / ledger.income;
  const inBand = (x: number, lo: number, hi: number): boolean => x >= lo && x <= hi;
  const rejected = rows.reduce((s, r) => s + r.rejected, 0);

  const perNation: Record<string, number[]> = {};
  pairs.forEach((p, i) => {
    (perNation[p.nation] ??= []).push(gaps[i] as number);
  });
  const perNationPairMedianPct = Object.fromEntries(
    Object.entries(perNation)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, list]) => [id, Math.round(median(list) * 1000) / 10]),
  );

  const metrics: Metric[] = [
    { name: `Seeded full-roster games (${playable.length} nations + ${roster.length - playable.length} regions, ${ticks} ticks)`, value: `${games} + ${pairs.length * 2} paired`, passLine: `${options.games} with no crashes`, pass: crashes === 0 && games === options.games },
    { name: 'Crashes', value: String(crashes), passLine: '0', pass: crashes === 0 },
    { name: 'Negative stocks (every nation, every tick)', value: String(negatives), passLine: '0', pass: negatives === 0 },
    { name: 'Food consumed / produced (world)', value: pct(foodRatio), passLine: '75-100%', pass: inBand(foodRatio, 0.75, 1) },
    { name: 'Energy consumed / produced (world)', value: pct(energyRatio), passLine: '75-100%', pass: inBand(energyRatio, 0.75, 1) },
    { name: 'Credit sinks / Credit income (world)', value: pct(creditRatio), passLine: '0-25%', pass: inBand(creditRatio, 0, 0.25) },
    { name: 'Same nation, trading vs isolating (median of paired runs)', value: `+${pct(medianGap)}`, passLine: '>= +15%', pass: medianGap >= 0.15 },
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
      const e = byStrategy[s] as { assigned: number; ownSum: number };
      return [s, e.assigned === 0 ? 0 : Math.round(e.ownSum / e.assigned)];
    }),
  );
  const strategyTopShare = Object.fromEntries(STRATEGIES.map((s) => [s, { assigned: byStrategy[s]?.assigned ?? 0, tops: byStrategy[s]?.tops ?? 0 }]));

  return {
    games,
    ticks,
    metrics,
    rows,
    pairs,
    topShare,
    strategyTopShare,
    strategyMeanOwnBp,
    perNationPairMedianPct,
    pass: metrics.every((m) => m.pass !== false),
  };
}

/** The results as a Markdown report: the metrics table, then the detail tables. */
export function formatGate1(report: Gate1Report): string {
  const lines = [
    `# Gate 1 suite: ${report.games} games x ${report.ticks} ticks - ${report.pass ? 'PASS' : 'FAIL'}`,
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
    '| Nation | Pairs | Median gain |',
    '|---|---|---|',
    ...Object.entries(report.perNationPairMedianPct).map(([id, v]) => `| ${id} | ${report.pairs.filter((p) => p.nation === id).length} | ${v >= 0 ? '+' : ''}${v.toFixed(1)}% |`),
    '',
  ];
  return lines.join('\n');
}
