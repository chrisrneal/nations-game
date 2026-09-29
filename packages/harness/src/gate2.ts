/**
 * The Gate 2 suite (docs/ROADMAP.md, "Gate 2 (MVP, go/no-go)"), which also
 * runs the Gate 1 suite, because every gate reruns earlier suites.
 *
 * Per seed it plays:
 * 1. The main game: 17 playable nations each assigned one of the five Gate 2
 *    archetypes at random (trader, hoarder, isolationist, exploiter,
 *    freeRider), 6 regions on their standing policies, a full game length.
 *    Crisis outcomes, defection, retaliation and top scorers come from it.
 * 2. A cooperator / free-rider pair: one randomly chosen nation plays the
 *    trader (the reciprocal cooperator) in one game and the free-rider in the
 *    other, everyone else unchanged.
 * 3. A spoiler pair: the nation trailing (lowest ownScore) at mid-game in the
 *    main game plays the trader from mid-game in one game and the spoiler
 *    (closes trade, pays nothing, pledges and breaks) in the other.
 * Plus a 24-hour absence test on its own seeds.
 *
 * Pass lines, fixed before any result was seen (ROADMAP gate rules):
 * - crashes 0; negative stocks 0; dead states < 2% (carried from Gate 1).
 * - crisis success: share of all locked crises (climate and pandemic) that
 *   reached full cover, in [40%, 75%].
 * - no archetype tops the score in more than 1.5x its fair share, where its
 *   fair share is its share of the random assignments.
 * - no nation tops the score in more than 2x fair share (2/17 = 11.8%):
 *   Gate 1's waived criterion, re-graded with archetypes.
 * - reciprocal cooperators beat free-riders: over the pairs, the median of
 *   cooperator finalScore / free-rider finalScore - 1 is above 0, and the
 *   cooperator scores higher in more than half the pairs.
 * - a trailing nation gains nothing by sabotage: the spoiler's median
 *   finalScore is strictly below the cooperator's (RULES 5.3), paired.
 * - 24-hour absence: over every absence run, nothing addressed to the absent
 *   nation lapses (0 offers expired, every appeal answered, every own pledge
 *   resolved on its deadline) and every recap has at most recapMaxLines lines
 *   and at most 150 words (under a minute at a slow 200 words a minute).
 * - Gate 1 suite passes, except its waived top-scorer line.
 * Defection, retaliation and broken pledges are reported, with no pass line
 * in the ROADMAP. Owner items (predicting the AI, playtests, depth budget,
 * 60 fps) are reported as owner checks.
 */
import type { CrisisEventPayloads, Event, NationId, PoolKind, Recap, Resource } from '@nations/contracts';
import { TUNABLES, buildRecap, mix32, scoreboard, viewFor, type NationView, type RosterEntry, type WorldState } from '@nations/sim';
import { ARCHETYPES, type Strategy } from './bots.ts';
import { playGame } from './game.ts';
import { runGate1, type Gate1Report, type Metric } from './gate1.ts';

export interface Gate2Options {
  readonly games: number;
  readonly firstSeed: number;
  readonly roster: readonly RosterEntry[];
  readonly ticks?: number;
  /** Seeds for the 24-hour absence test (each runs two absences). Default 20. */
  readonly absenceSeeds?: number;
  /** Skip the Gate 1 rerun (tests only). */
  readonly skipGate1?: boolean;
}

type Outcome = 'success' | 'partial' | 'failure';

export interface CrisisStats {
  readonly locked: Record<'climate' | 'pandemic', Record<Outcome, number>>;
  /** Playable nations asked for a share, per crisis, and how many of them free-rode. */
  appeals: number;
  freeRides: number;
  /** Reciprocal policy answers, and how many paid less because the world fell short last round. */
  reciprocalAnswers: number;
  retaliations: number;
  pledgesHonoured: number;
  pledgesBroken: number;
}

export interface PairScore {
  readonly seed: number;
  readonly nation: string;
  readonly coop: number;
  readonly other: number;
  readonly coopMultiplierBp: number;
  readonly otherMultiplierBp: number;
  /** Crises that reached full cover in each run. */
  readonly coopSuccesses: number;
  readonly otherSuccesses: number;
}

export interface AbsenceRun {
  readonly seed: number;
  readonly nation: string;
  readonly from: number;
  readonly to: number;
  readonly offersToIt: number;
  readonly offersLapsed: number;
  readonly appealsDue: number;
  readonly appealsAnswered: number;
  readonly pledgesDue: number;
  readonly pledgesResolved: number;
  readonly recap: Recap;
  readonly words: number;
}

export interface Gate2Report {
  readonly firstSeed: number;
  readonly games: number;
  readonly ticks: number;
  readonly metrics: readonly Metric[];
  readonly crises: CrisisStats;
  readonly archetypes: Readonly<Record<string, { assigned: number; tops: number; meanFinal: number }>>;
  readonly topShare: Readonly<Record<string, number>>;
  readonly freeRiderPairs: readonly PairScore[];
  readonly spoilerPairs: readonly PairScore[];
  readonly absence: readonly AbsenceRun[];
  readonly gate1: Gate1Report | null;
  readonly pass: boolean;
}

const DEAD_BP = 5_000;
const MAX_RECAP_WORDS = 150;

/** Seeded archetype per playable nation: uniform over the five Gate 2 archetypes. */
export function assignArchetypes(seed: number, playable: readonly string[]): Record<string, Strategy> {
  const out: Record<string, Strategy> = {};
  playable.forEach((id, i) => {
    out[id] = ARCHETYPES[mix32(seed * 6_151 + i * 92_821 + 29) % ARCHETYPES.length] as Strategy;
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
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;

function negativeStocks(state: WorldState): number {
  let count = 0;
  for (const id of state.nationOrder) {
    const s = state.nations[id]?.private.stocks;
    if (s === undefined) continue;
    for (const r of ['food', 'energy', 'credit'] as Resource[]) if (s[r] < 0) count++;
  }
  if (state.pools.adaptation.balance < 0 || state.pools.health.balance < 0) count++;
  return count;
}

function emptyStats(): CrisisStats {
  const o = (): Record<Outcome, number> => ({ success: 0, partial: 0, failure: 0 });
  return { locked: { climate: o(), pandemic: o() }, appeals: 0, freeRides: 0, reciprocalAnswers: 0, retaliations: 0, pledgesHonoured: 0, pledgesBroken: 0 };
}

/** Per-game memory for the tally: each pool's funding last round, and which pool each crisis draws on. */
interface GameMemory {
  readonly lastFunded: Record<PoolKind, number>;
  readonly poolOf: Map<number, PoolKind>;
}

const newMemory = (): GameMemory => ({ lastFunded: { adaptation: 10_000, health: 10_000 }, poolOf: new Map() });

/**
 * Adds one tick's crisis events to the tally. A reciprocal answer counts as
 * retaliation when the pool it pays into met less than `reciprocalMatchPct`
 * of its target last round, so the rule scaled the payment down.
 */
function tallyCrises(stats: CrisisStats, events: readonly Event[], playable: ReadonlySet<string>, memory: GameMemory): void {
  const match = TUNABLES.reciprocalMatchPct.value * 100;
  for (const e of events) {
    if (e.type === 'crisisOpened') {
      const c = (e.payload as CrisisEventPayloads['crisisOpened']).crisis;
      memory.poolOf.set(c.id, c.pool);
    } else if (e.type === 'appealAnswered') {
      const a = e.payload as CrisisEventPayloads['appealAnswered'];
      if (a.rule === 'reciprocal' && a.share > 0 && playable.has(a.nationId)) {
        stats.reciprocalAnswers++;
        if (memory.lastFunded[memory.poolOf.get(a.crisisId) ?? 'adaptation'] < match) stats.retaliations++;
      }
    } else if (e.type === 'crisisLocked') {
      const r = (e.payload as CrisisEventPayloads['crisisLocked']).result;
      stats.locked[r.kind][r.outcome]++;
      stats.appeals += [...r.contributors, ...r.freeRiders].filter((id) => playable.has(id)).length;
      stats.freeRides += r.freeRiders.filter((id) => playable.has(id)).length;
      memory.lastFunded[r.kind === 'climate' ? 'adaptation' : 'health'] = Math.min(10_000, Math.floor((r.effective * 10_000) / Math.max(1, r.target)));
    } else if (e.type === 'pledgeHonoured') {
      stats.pledgesHonoured++;
    } else if (e.type === 'pledgeBroken') {
      stats.pledgesBroken++;
    }
  }
}

function finalOf(result: ReturnType<typeof playGame>, id: string): number {
  return result.score.nations.find((n) => n.id === (id as NationId))?.finalScore ?? 0;
}

/** One 24-hour absence: `nation` walks away for [from, to) after pledging, and must come back to a short recap with nothing lapsed. */
function absenceRun(seed: number, roster: readonly RosterEntry[], ticks: number, nation: string, from: number, to: number, strategies: Record<string, Strategy>): AbsenceRun {
  let before: NationView | undefined;
  let after: NationView | undefined;
  const seen: Event[] = [];
  const id = nation as NationId;
  let offersToIt = 0;
  let lapsed = 0;
  let appealsDue = 0;
  let appealsAnswered = 0;
  let pledgesDue = 0;
  let pledgesResolved = 0;
  playGame({
    seed,
    ticks,
    roster,
    strategies,
    humanSwitch: false,
    // Before leaving, the player promises a little to the adaptation pool, due while they are away.
    away: [{ nation, from, to, leaving: [{ nationId: id, tick: from, type: 'pledge', payload: { pool: 'adaptation', amount: 40, deadlineTick: from + Math.min(3, to - from - 1) } }] }],
    onTick: (state, events) => {
      const stepped = state.tick - 1;
      if (state.tick === from) before = viewFor(state, id);
      if (state.tick === to) after = viewFor(state, id);
      if (stepped < from || stepped >= to) return;
      for (const e of events) {
        if (e.audience.length === 0 || e.audience.includes(id)) seen.push(e);
        const p = e.payload as { offer?: { id: number; to: NationId }; nationId?: NationId; pledge?: { nationId: NationId } };
        if (e.type === 'offerMade' && p.offer?.to === id) offersToIt++;
        if (e.type === 'offerExpired' && p.offer?.to === id) lapsed++;
        if (e.type === 'crisisLocked') appealsDue++;
        if (e.type === 'appealAnswered' && p.nationId === id) appealsAnswered++;
        if ((e.type === 'pledgeHonoured' || e.type === 'pledgeBroken') && p.pledge?.nationId === id) pledgesResolved++;
        if (e.type === 'pledgeMade' && p.pledge?.nationId === id && (e.payload as CrisisEventPayloads['pledgeMade']).pledge.deadlineTick < to) pledgesDue++;
      }
    },
  });
  if (before === undefined || after === undefined) throw new Error('absence window outside the game');
  // An appeal that opened before the player left may have been answered before they left; count answers seen in the window only for crises it had not answered.
  const answeredBefore = before.crises.open.filter((c) => c.answers[id] !== undefined && c.deadlineTick < to).length;
  const recap = buildRecap(before, after, seen);
  const words = recap.lines.reduce((sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    seed,
    nation,
    from,
    to,
    offersToIt,
    offersLapsed: lapsed,
    appealsDue,
    appealsAnswered: appealsAnswered + answeredBefore,
    pledgesDue,
    pledgesResolved,
    recap,
    words,
  };
}

export function runGate2(options: Gate2Options): Gate2Report {
  const ticks = options.ticks ?? TUNABLES.gameLengthTicks.value;
  const roster = options.roster;
  const playable = roster.filter((r) => (r.endowment?.kind ?? 'playable') === 'playable').map((r) => r.id);
  const playableSet = new Set(playable);
  const mid = Math.floor(ticks / 2);

  let crashes = 0;
  let negatives = 0;
  let dead = 0;
  let nationGames = 0;
  let income = 0;
  let sinks = 0;
  const crises = emptyStats();
  const tops: Record<string, number> = Object.fromEntries(playable.map((id) => [id, 0]));
  const archetypes: Record<string, { assigned: number; tops: number; finalSum: number }> = Object.fromEntries(ARCHETYPES.map((a) => [a, { assigned: 0, tops: 0, finalSum: 0 }]));
  const freeRiderPairs: PairScore[] = [];
  const spoilerPairs: PairScore[] = [];

  for (let g = 0; g < options.games; g++) {
    const seed = options.firstSeed + g;
    const strategies = assignArchetypes(seed, playable);
    try {
      const memory = newMemory();
      let trailing = playable[0] as string;
      const main = playGame({
        seed,
        ticks,
        roster,
        strategies,
        humanSwitch: false,
        onTick: (state, events) => {
          negatives += negativeStocks(state);
          tallyCrises(crises, events, playableSet, memory);
          if (state.tick === mid) {
            const board = scoreboard(state);
            trailing = [...board.nations].sort((a, b) => a.ownScoreBp - b.ownScoreBp || (a.id < b.id ? -1 : 1))[0]?.id ?? trailing;
          }
        },
      });
      income += main.state.ledger.creditIncome;
      sinks += main.state.ledger.creditSpentResilience + main.state.ledger.creditSpentCrises;
      let best = main.score.nations[0];
      for (const n of main.score.nations) {
        const a = archetypes[strategies[n.id] as string] as { assigned: number; finalSum: number };
        a.assigned++;
        a.finalSum += n.finalScore;
        nationGames++;
        if (n.ownScoreBp < DEAD_BP) dead++;
        if (best === undefined || n.finalScore > best.finalScore) best = n;
      }
      if (best !== undefined) {
        tops[best.id] = (tops[best.id] ?? 0) + 1;
        (archetypes[strategies[best.id] as string] as { tops: number }).tops++;
      }

      const pair = (who: string, a: ReturnType<typeof playGame>, b: ReturnType<typeof playGame>): PairScore => ({
        seed,
        nation: who,
        coop: finalOf(a, who),
        other: finalOf(b, who),
        coopMultiplierBp: a.score.multiplierBp,
        otherMultiplierBp: b.score.multiplierBp,
        coopSuccesses: a.state.ledger.crisesSucceeded,
        otherSuccesses: b.state.ledger.crisesSucceeded,
      });
      const who = playable[mix32(seed ^ 0x0c0ffee) % playable.length] as string;
      const as = (s: Strategy) => playGame({ seed, ticks, roster, strategies: { ...strategies, [who]: s }, humanSwitch: false });
      freeRiderPairs.push(pair(who, as('trader'), as('freeRider')));
      const from = (s: Strategy) => playGame({ seed, ticks, roster, strategies, humanSwitch: false, switches: [{ tick: mid, nation: trailing, strategy: s }] });
      spoilerPairs.push(pair(trailing, from('trader'), from('spoiler')));
    } catch (error) {
      crashes++;
      console.error(`seed ${seed} crashed:`, error);
    }
  }

  // 24-hour absence: at the multiplayer cadence (6 h a month) a day is 4 months; at RULES 9's single-player 1x (30 min a month, the app's live clock) it is 48.
  const absence: AbsenceRun[] = [];
  const absenceSeeds = options.absenceSeeds ?? 20;
  for (let i = 0; i < absenceSeeds; i++) {
    const seed = options.firstSeed + i;
    const nation = playable[mix32(seed ^ 0xab5e) % playable.length] as string;
    const strategies = { ...assignArchetypes(seed, playable), [nation]: 'trader' as Strategy };
    // The short absence spans a climate deadline (the third year's, or the last one that fits the game).
    const firstDeadline = TUNABLES.climateFirstOpenTick.value + TUNABLES.crisisResponseTicks.value;
    const interval = TUNABLES.climateEventIntervalTicks.value;
    const deadline = firstDeadline + interval * Math.max(0, Math.min(2, Math.floor((ticks - 2 - firstDeadline) / interval)));
    try {
      absence.push(absenceRun(seed, roster, ticks, nation, Math.max(1, deadline - 3), deadline + 1, strategies));
      absence.push(absenceRun(seed, roster, ticks, nation, 6, Math.min(ticks - 1, 54), strategies));
    } catch (error) {
      crashes++;
      console.error(`absence seed ${seed} crashed:`, error);
    }
  }

  const gate1 = options.skipGate1 === true ? null : runGate1({ games: options.games, firstSeed: options.firstSeed, roster, ticks });

  const games = options.games - crashes;
  const lockedAll = (['climate', 'pandemic'] as const).reduce((s, k) => s + crises.locked[k].success + crises.locked[k].partial + crises.locked[k].failure, 0);
  const successAll = crises.locked.climate.success + crises.locked.pandemic.success;
  const successRate = lockedAll === 0 ? 0 : successAll / lockedAll;
  const fairShare = 1 / playable.length;
  const topShare = Object.fromEntries(Object.entries(tops).map(([id, n]) => [id, games <= 0 ? 0 : n / games]));
  const maxTop = Object.entries(topShare).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const totalAssigned = Object.values(archetypes).reduce((s, a) => s + a.assigned, 0);
  const ratio = (a: { assigned: number; tops: number }): number => (a.assigned === 0 || games <= 0 ? 0 : a.tops / games / (a.assigned / totalAssigned));
  const worstArchetype = Object.entries(archetypes).sort((a, b) => ratio(b[1]) - ratio(a[1]))[0] ?? ['', { assigned: 0, tops: 0 }];
  const gap = (p: PairScore): number => p.coop / Math.max(1, p.other) - 1;
  const coopMedian = median(freeRiderPairs.map(gap));
  const coopAhead = freeRiderPairs.length === 0 ? 0 : freeRiderPairs.filter((p) => p.coop > p.other).length / freeRiderPairs.length;
  const coopSpoiler = median(spoilerPairs.map((p) => p.coop));
  const spoilerMedian = median(spoilerPairs.map((p) => p.other));
  const spoilerAhead = spoilerPairs.length === 0 ? 0 : spoilerPairs.filter((p) => p.other > p.coop).length / spoilerPairs.length;
  const sank = spoilerPairs.length === 0 ? 0 : spoilerPairs.filter((p) => p.otherSuccesses < p.coopSuccesses).length / spoilerPairs.length;
  const multDrop = median(spoilerPairs.map((p) => (p.otherMultiplierBp - p.coopMultiplierBp) / 10_000));
  const deadRate = nationGames === 0 ? 0 : dead / nationGames;
  const creditRatio = income === 0 ? 0 : sinks / income;
  const lapsed = absence.reduce((s, a) => s + a.offersLapsed, 0);
  const unanswered = absence.reduce((s, a) => s + Math.max(0, a.appealsDue - a.appealsAnswered), 0);
  const unresolved = absence.reduce((s, a) => s + Math.max(0, a.pledgesDue - a.pledgesResolved), 0);
  const maxLines = absence.reduce((m, a) => Math.max(m, a.recap.lines.length), 0);
  const maxWords = absence.reduce((m, a) => Math.max(m, a.words), 0);
  const absencePass = absence.length > 0 && lapsed === 0 && unanswered === 0 && unresolved === 0 && maxLines <= TUNABLES.recapMaxLines.value && maxWords <= MAX_RECAP_WORDS;
  const gate1Failing = gate1 === null ? [] : gate1.metrics.filter((m) => m.pass === false && !m.name.startsWith('Most frequent top scorer'));
  const rate = (n: number, d: number): string => (d === 0 ? 'n/a' : pct(n / d));

  const metrics: Metric[] = [
    { name: `Seeded full-roster games (${playable.length} nations + ${roster.length - playable.length} regions, ${ticks} ticks, random archetypes)`, value: `${games} + ${(freeRiderPairs.length + spoilerPairs.length) * 2} paired`, passLine: `${options.games} with no crashes`, pass: crashes === 0 },
    { name: 'Crashes', value: String(crashes), passLine: '0', pass: crashes === 0 },
    { name: 'Negative stocks or pools (every nation, every tick)', value: String(negatives), passLine: '0', pass: negatives === 0 },
    { name: 'Crisis success (locked crises reaching full cover)', value: `${pct(successRate)} of ${lockedAll}`, passLine: '40-75%', pass: successRate >= 0.4 && successRate <= 0.75 },
    { name: 'Climate: success / partial / failure', value: `${crises.locked.climate.success} / ${crises.locked.climate.partial} / ${crises.locked.climate.failure}`, passLine: 'info', pass: null },
    { name: 'Pandemic: success / partial / failure', value: `${crises.locked.pandemic.success} / ${crises.locked.pandemic.partial} / ${crises.locked.pandemic.failure}`, passLine: 'info', pass: null },
    { name: 'Defection rate (playable nation-appeals paid under half their share)', value: rate(crises.freeRides, crises.appeals), passLine: 'info', pass: null },
    { name: 'Broken pledges (of all pledges resolved)', value: rate(crises.pledgesBroken, crises.pledgesBroken + crises.pledgesHonoured), passLine: 'info', pass: null },
    { name: 'Retaliation rate (reciprocal answers scaled down after a short round)', value: rate(crises.retaliations, crises.reciprocalAnswers), passLine: 'info', pass: null },
    { name: `Most winning archetype (${worstArchetype[0]}), tops / fair share`, value: `${ratio(worstArchetype[1]).toFixed(2)}x`, passLine: '<= 1.50x', pass: ratio(worstArchetype[1]) <= 1.5 },
    { name: `Most frequent top scorer (${maxTop[0]})`, value: pct(maxTop[1]), passLine: `<= ${pct(2 * fairShare)} (2x fair share)`, pass: maxTop[1] <= 2 * fairShare },
    { name: 'Reciprocal cooperator vs free-rider, same nation (median finalScore gap)', value: signed(coopMedian), passLine: '> 0', pass: coopMedian > 0 },
    { name: 'Pairs where the cooperator scores higher', value: pct(coopAhead), passLine: '> 50%', pass: coopAhead > 0.5 },
    { name: 'Trailing nation: spoiler vs cooperator from mid-game (median finalScore)', value: `${spoilerMedian.toFixed(0)} vs ${coopSpoiler.toFixed(0)}`, passLine: 'spoiler strictly lower', pass: spoilerMedian < coopSpoiler },
    { name: 'Spoiler pairs where sabotage paid', value: pct(spoilerAhead), passLine: 'info', pass: null },
    { name: 'Spoiler pairs where it sank a shared goal (fewer crises at full cover)', value: pct(sank), passLine: 'info', pass: null },
    { name: 'World multiplier change from one spoiler (median)', value: `${multDrop >= 0 ? '+' : ''}${multDrop.toFixed(3)}`, passLine: 'info', pass: null },
    { name: 'Dead states (ownScore < 0.50 at game end)', value: pct(deadRate), passLine: '< 2%', pass: deadRate < 0.02 },
    { name: 'Credit sinks / Credit income (resilience + crises)', value: pct(creditRatio), passLine: '0-25%', pass: creditRatio >= 0 && creditRatio <= 0.25 },
    {
      name: `24-hour absence (${absence.length} runs: 4 months at the multiplayer cadence, 48 at single-player 1x)`,
      value: `${lapsed} lapsed, ${unanswered} appeals and ${unresolved} pledges unanswered; recap <= ${maxLines} lines, <= ${maxWords} words`,
      passLine: `0 / 0 / 0; <= ${TUNABLES.recapMaxLines.value} lines, <= ${MAX_RECAP_WORDS} words`,
      pass: absencePass,
    },
    {
      name: 'Gate 1 suite (top scorer waived)',
      value: gate1 === null ? 'skipped' : gate1Failing.length === 0 ? 'all other lines pass' : `FAIL: ${gate1Failing.map((m) => m.name).join('; ')}`,
      passLine: 'pass',
      pass: gate1 === null ? null : gate1Failing.length === 0,
    },
    { name: 'Gate 0 still passes', value: 'npm test: determinism (1,000 seeds, Node vs Chromium), purity, save/load', passLine: 'all pass', pass: null },
    { name: 'Owner predicts AI responses after one game', value: 'owner check', passLine: '>= 70%', pass: null },
    { name: '10 playtests, 3+ by others, most want another game', value: 'owner check', passLine: 'see ROADMAP', pass: null },
    { name: 'Depth budget and 60 fps hold', value: 'owner check (phone)', passLine: 'hold', pass: null },
  ];

  return {
    firstSeed: options.firstSeed,
    games,
    ticks,
    metrics,
    crises,
    archetypes: Object.fromEntries(Object.entries(archetypes).map(([k, a]) => [k, { assigned: a.assigned, tops: a.tops, meanFinal: a.assigned === 0 ? 0 : Math.round(a.finalSum / a.assigned) }])),
    topShare,
    freeRiderPairs,
    spoilerPairs,
    absence,
    gate1,
    pass: metrics.every((m) => m.pass !== false),
  };
}

export function formatGate2(report: Gate2Report): string {
  const seeds = `seeds ${report.firstSeed}-${report.firstSeed + report.games - 1}`;
  const total = Object.values(report.archetypes).reduce((s, a) => s + a.assigned, 0);
  const sample = report.absence.find((a) => a.to - a.from > 4) ?? report.absence[0];
  const lines = [
    `# Gate 2 suite: ${report.games} games x ${report.ticks} ticks, ${seeds} - ${report.pass ? 'PASS' : 'FAIL'}`,
    '',
    '| Metric | Result | Pass line | |',
    '|---|---|---|---|',
    ...report.metrics.map((m) => `| ${m.name} | ${m.value} | ${m.passLine} | ${m.pass === null ? 'see note' : m.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Win rate by archetype (random assignment)',
    '',
    '| Archetype | Nation-games | Tops | Tops / fair share | Mean final score |',
    '|---|---|---|---|---|',
    ...Object.entries(report.archetypes).map(([k, a]) => {
      const share = report.games === 0 ? 0 : a.tops / report.games;
      const fair = total === 0 ? 0 : a.assigned / total;
      return `| ${k} | ${a.assigned} | ${a.tops} | ${(share / Math.max(1e-9, fair)).toFixed(2)}x | ${a.meanFinal} |`;
    }),
    '',
    '## Top scorer share by nation',
    '',
    '| Nation | Games topped |',
    '|---|---|',
    ...Object.entries(report.topShare)
      .sort((a, b) => b[1] - a[1])
      .map(([id, share]) => `| ${id} | ${pct(share)} |`),
    '',
  ];
  if (sample !== undefined) {
    lines.push(
      `## Sample away recap (seed ${sample.seed}, ${sample.nation}, away months ${sample.from}-${sample.to}, ${sample.words} words)`,
      '',
      ...sample.recap.lines.map((l) => `- ${l.text}`),
      '',
    );
  }
  return lines.join('\n');
}
