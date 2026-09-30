/**
 * The AI's Gate 2 check (prompt 10). Test code: it drives the sim, so its name
 * carries ".test." for the purity check, and it is not itself a suite.
 *
 * It measures the Gate 2 criteria the AI can move, with this AI as the
 * cooperator, the same way packages/harness/src/gate1.ts measures Gate 1. The
 * harness's own suite (packages/harness/src/gate2.ts) grades the same gate
 * with its bots, and adds the sabotage and 24-hour absence tests.
 *
 * - archetypes at random: every playable nation is assigned one of
 *   cooperator (this AI, in its data-derived style), hoarder, isolationist,
 *   trade exploiter or free-rider, uniformly by seed; the bots' pass line is
 *   1.5x fair share; crisis success is read from the same games;
 * - paired runs: one random nation plays cooperator in one game and, with
 *   everyone else unchanged, isolationist, trade exploiter, betrayer or
 *   free-rider (this AI with paying switched off) in the others; the
 *   cooperator should finish ahead in most pairs, and trade 15%+ better than
 *   it isolates (Gate 1 carried);
 * - top scorer per nation (Gate 1 criterion 5, waived, re-graded at Gate 2);
 * - retaliation: every broken deal against a strict AI is answered within
 *   aiRetaliationWindowTicks;
 * - explanations: every AI command carries one, with a number;
 * - budget: units per tick against aiBudgetUnitsPerTick, and wall time;
 * - no AI command refused as invalid, and repeat runs hash identically.
 */
import type { Command, ControllerSlot, Event, NationId, NationView, StandingPolicy } from '@nations/contracts';
import { Session, TUNABLES, createWorld, hashState, mix32, scoreboard, viewFor, type RosterEntry } from '@nations/sim';
import { AiDirector, endowmentsOf } from './director.ts';
import type { ExplanationEvent } from './explain.ts';
import { GREEDY, greedyDecide, type TraderStyle } from './greedy.ts';

export const ARCHETYPES = ['cooperator', 'hoarder', 'isolationist', 'exploiter', 'freeRider'] as const;
/** `betrayer` (Phase 4's archetype, used here only in paired runs) promises its whole stock to three buyers at a fair price, every month. */
export type Archetype = (typeof ARCHETYPES)[number] | 'betrayer';

const HOARDER: TraderStyle = { ...GREEDY, sells: false, paysGoods: false };
const PAYS_NOTHING: Partial<StandingPolicy> = { crisisRule: 'none', contributionBp: 0 };

/** As packages/harness/src/bots.ts: a setPolicy for whatever part of `wanted` differs now. */
function ensurePolicy(view: NationView, wanted: Partial<StandingPolicy>): Command[] {
  const current = view.self.private.policy as unknown as Record<string, unknown>;
  const diff = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => current[k] !== v));
  return Object.keys(diff).length === 0 ? [] : [{ nationId: view.selfId, tick: view.tick, type: 'setPolicy', payload: diff }];
}

/** As the harness exploiter: pledge its share to every open appeal, withdraw it the next month. */
function pledgeAndBreak(view: NationView): Command[] {
  const out: Command[] = [];
  for (const pledge of view.crises.pledges) {
    if (pledge.nationId === view.selfId && pledge.createdTick < view.tick) out.push({ nationId: view.selfId, tick: view.tick, type: 'withdrawPledge', payload: { pledgeId: pledge.id } });
  }
  for (const crisis of view.crises.open) {
    const share = crisis.shares[view.selfId] ?? 0;
    const pledged = view.crises.pledges.some((p) => p.nationId === view.selfId && p.pool === crisis.pool);
    if (share > 0 && !pledged && crisis.deadlineTick > view.tick && crisis.answers[view.selfId] === undefined) {
      out.push({ nationId: view.selfId, tick: view.tick, type: 'pledge', payload: { pool: crisis.pool, amount: share, deadlineTick: crisis.deadlineTick } });
    }
  }
  return out;
}
const now = (): number => (globalThis as unknown as { performance: { now(): number } }).performance.now();

/**
 * The harness bots (packages/harness/src/bots.ts, prompt 09), for the archetypes that are not this AI.
 * The free-rider is this AI with paying switched off, so the pair differs in crises only.
 */
function botCommands(a: Exclude<Archetype, 'cooperator' | 'freeRider'>, view: ReturnType<typeof viewFor>, seed: number): Command[] {
  const limit = view.rules.maxCommandsPerNationPerTick ?? 8;
  const fit = (commands: Command[]): Command[] => commands.slice(0, limit);
  switch (a) {
    case 'hoarder':
      return fit([...ensurePolicy(view, PAYS_NOTHING), ...greedyDecide(view, seed, HOARDER).commands]);
    case 'isolationist':
      return ensurePolicy(view, { rejectAll: true });
    case 'betrayer': {
      // Promise the whole stock of each good to the three neediest playable nations at a fair price.
      const out: Command[] = [];
      for (const good of ['food', 'energy'] as const) {
        const amount = view.self.private.stocks[good];
        if (amount <= 0) continue;
        const credit = Math.max(1, Math.floor((amount * view.prices[good]) / 1000));
        const buyers = view.others
          .filter((o) => o.public.kind === 'playable' && o.public[good].demand > o.public[good].production)
          .sort((a, b) => b.public[good].demand - b.public[good].production - (a.public[good].demand - a.public[good].production) || (a.id < b.id ? -1 : 1))
          .slice(0, 3);
        for (const b of buyers) out.push({ nationId: view.selfId, tick: view.tick, type: 'makeOffer', payload: { to: b.id, give: { resource: good, amount }, get: { resource: 'credit', amount: credit } } });
      }
      return out.slice(0, 6);
    }
    case 'exploiter': {
      const markupPct = (view.rules.priceBandPct ?? 0) + 15;
      const moves = greedyDecide(view, seed, { sells: true, paysGoods: true, markupPct, sellFanout: 2 }).commands;
      return fit([...ensurePolicy(view, { hardBargains: true, ...PAYS_NOTHING }), ...pledgeAndBreak(view), ...moves]);
    }
  }
}

export function assignArchetypes(seed: number, playable: readonly string[]): Record<string, Archetype> {
  const out: Record<string, Archetype> = {};
  playable.forEach((id, i) => {
    out[id] = ARCHETYPES[mix32(seed * 7919 + i * 104_729 + 17) % ARCHETYPES.length] as Archetype;
  });
  return out;
}

export interface GameResult {
  readonly seed: number;
  readonly hash: string;
  readonly top: string;
  readonly final: Readonly<Record<string, number>>;
  readonly own: Readonly<Record<string, number>>;
  readonly aiCommands: number;
  readonly explainedCommands: number;
  readonly numericExplanations: number;
  readonly explanations: number;
  /** Broken deals against strict AI nations, and how many were answered in the window. */
  readonly strictBreaks: number;
  readonly strictAnswered: number;
  readonly forgivingBreaks: number;
  readonly maxUnits: number;
  readonly deferred: number;
  readonly aiMs: number;
  readonly ticks: number;
  readonly rejected: number;
  readonly raced: number;
  readonly crisesLocked: number;
  readonly crisesSucceeded: number;
}

/**
 * Rule overrides for tuning sweeps (`AI_GATE2_RULES='{"aiNoiseBp":500}'`): the AI reads every
 * number from its View's rules, so a sweep changes the View it is given and nothing else.
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const OVERRIDES: Readonly<Record<string, number>> = JSON.parse(env.AI_GATE2_RULES ?? '{}') as Record<string, number>;
for (const [k, v] of Object.entries(OVERRIDES)) {
  const t = (TUNABLES as Record<string, { min: number; max: number }>)[k];
  if (t === undefined || v < t.min || v > t.max) throw new Error(`AI_GATE2_RULES: ${k}=${v} is not a tunable inside its band`);
}
const aiView = (state: Parameters<typeof viewFor>[0], id: NationId): ReturnType<typeof viewFor> => {
  const v = viewFor(state, id);
  return Object.keys(OVERRIDES).length === 0 ? v : { ...v, rules: { ...v.rules, ...OVERRIDES } };
};

export function playArchetypes(seed: number, roster: readonly RosterEntry[], archetypes: Readonly<Record<string, Archetype>>, ticks = TUNABLES.gameLengthTicks.value): GameResult {
  const session = new Session(createWorld({ seed, roster }));
  const aiSeed = mix32(seed ^ 0x2545f491);
  const freeRiders = Object.keys(archetypes).filter((id) => archetypes[id] === 'freeRider');
  const director = new AiDirector({ endowments: endowmentsOf(roster), seed: aiSeed, freeRiders });
  const isAi = (a: Archetype | undefined): boolean => a === 'cooperator' || a === 'freeRider';
  const controllerOf = (id: NationId): ControllerSlot => (isAi(archetypes[id]) ? 'ai' : 'human');
  const window = OVERRIDES.aiRetaliationWindowTicks ?? TUNABLES.aiRetaliationWindowTicks.value;
  const explanations: ExplanationEvent[] = [];
  const events: Event[] = [];
  let aiCommands = 0;
  let maxUnits = 0;
  let deferred = 0;
  let aiMs = 0;
  let rejected = 0;
  let raced = 0;
  for (let t = 0; t < ticks; t++) {
    const state = session.state;
    const started = now();
    const out = director.decide(t, controllerOf, (id) => aiView(state, id));
    aiMs += now() - started;
    maxUnits = Math.max(maxUnits, out.usage.units);
    deferred += out.usage.deferred.length;
    for (const c of out.commands) {
      aiCommands++;
      if (!session.submit(c).ok) rejected++;
    }
    explanations.push(...out.explanations);
    for (const id of state.nationOrder) {
      const a = archetypes[id];
      if (a === undefined || a === 'cooperator' || a === 'freeRider') continue;
      for (const c of botCommands(a, viewFor(state, id), aiSeed)) session.submit(c);
    }
    const stepped = session.advance(1);
    for (const e of stepped) {
      if (e.type !== 'commandRejected' || !isAi(archetypes[e.audience[0] ?? ''])) continue;
      // "No longer open": the other side answered or withdrew earlier in the same month. A race, not an invalid command.
      if (/no longer open/.test((e.payload as { reason: string }).reason)) raced++;
      else {
        rejected++;
        if (env.AI_GATE2_DEBUG) (globalThis as unknown as { console: { log(...a: unknown[]): void } }).console.log('INVALID', seed, t, archetypes[e.audience[0] ?? ''], JSON.stringify(e.payload));
      }
    }
    events.push(...stepped);
    director.observe(stepped);
  }

  // Retaliation: each broken deal against a strict cooperator must be answered within the window.
  let strictBreaks = 0;
  let strictAnswered = 0;
  let forgivingBreaks = 0;
  const rules = viewFor(session.state, session.state.nationOrder[0]!).rules;
  for (const e of events) {
    if (e.type !== 'offerFailed') continue;
    const p = e.payload as { reneger: NationId; offer: { from: NationId; to: NationId } };
    const victim = p.offer.from === p.reneger ? p.offer.to : p.offer.from;
    // A break in the final month has no later month to be answered in.
    if (archetypes[victim] !== 'cooperator' || archetypes[p.reneger] === undefined || e.tick + 1 >= ticks) continue;
    const style = director.personalityOf(victim, { rules })?.reciprocity;
    if (style === 'forgiving') forgivingBreaks++;
    if (style !== 'strict') continue;
    strictBreaks++;
    const answered = explanations.some(
      (x) => x.payload.nationId === victim && x.payload.partner === p.reneger && x.payload.decision === 'suspend' && x.tick > e.tick && x.tick <= e.tick + window,
    );
    if (answered) strictAnswered++;
  }

  const board = scoreboard(session.state);
  const final: Record<string, number> = {};
  const own: Record<string, number> = {};
  let top = '';
  let best = -1;
  for (const n of board.nations) {
    final[n.id] = n.finalScore;
    own[n.id] = n.ownScoreBp;
    if (n.finalScore > best) {
      best = n.finalScore;
      top = n.id;
    }
  }
  const decisionsWithCommands = explanations.filter((x) => !['suspend', 'forgive', 'resume'].includes(x.payload.decision));
  return {
    seed,
    hash: hashState(session.state),
    top,
    final,
    own,
    aiCommands,
    explainedCommands: decisionsWithCommands.length,
    numericExplanations: explanations.filter((x) => /\d/.test(x.payload.text)).length,
    explanations: explanations.length,
    strictBreaks,
    strictAnswered,
    forgivingBreaks,
    maxUnits,
    deferred,
    aiMs,
    ticks,
    rejected,
    raced,
    crisesLocked: session.state.ledger.crisesLocked,
    crisesSucceeded: session.state.ledger.crisesSucceeded,
  };
}

export interface Gate2Report {
  readonly games: number;
  readonly firstSeed: number;
  readonly table: string;
  readonly pass: Readonly<Record<string, boolean | null>>;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function runGate2(options: { games: number; firstSeed: number; roster: readonly RosterEntry[] }): Gate2Report {
  const { games, firstSeed, roster } = options;
  const playable = roster.filter((r) => (r.endowment?.kind ?? 'playable') === 'playable').map((r) => r.id);
  const tops: Record<string, number> = {};
  const archTops: Record<string, number> = {};
  const archExpected: Record<string, number> = {};
  const archOwn: Record<string, number[]> = {};
  const reciprocity: number[] = [];
  const reciprocityAhead: boolean[] = [];
  const trading: number[] = [];
  const betrayal: number[] = [];
  const betrayalAhead: boolean[] = [];
  let strictBreaks = 0;
  let strictAnswered = 0;
  let forgivingBreaks = 0;
  let aiCommands = 0;
  let explained = 0;
  let numeric = 0;
  let explanations = 0;
  let maxUnits = 0;
  let deferred = 0;
  let aiMs = 0;
  let aiTicks = 0;
  let rejected = 0;
  let raced = 0;
  let deterministic = 0;
  let crisesLocked = 0;
  let crisesSucceeded = 0;
  const freeRide: number[] = [];
  const freeRideAhead: boolean[] = [];
  const account = (g: GameResult): void => {
    strictBreaks += g.strictBreaks;
    strictAnswered += g.strictAnswered;
    forgivingBreaks += g.forgivingBreaks;
    aiCommands += g.aiCommands;
    explained += g.explainedCommands;
    numeric += g.numericExplanations;
    explanations += g.explanations;
    maxUnits = Math.max(maxUnits, g.maxUnits);
    deferred += g.deferred;
    aiMs += g.aiMs;
    aiTicks += g.ticks;
    rejected += g.rejected;
    raced += g.raced;
  };

  for (let i = 0; i < games; i++) {
    const seed = firstSeed + i;
    const arch = assignArchetypes(seed, playable);
    const g = playArchetypes(seed, roster, arch);
    account(g);
    crisesLocked += g.crisesLocked;
    crisesSucceeded += g.crisesSucceeded;
    tops[g.top] = (tops[g.top] ?? 0) + 1;
    archTops[arch[g.top]!] = (archTops[arch[g.top]!] ?? 0) + 1;
    for (const id of playable) {
      const a = arch[id]!;
      archExpected[a] = (archExpected[a] ?? 0) + 1 / playable.length;
      (archOwn[a] ??= []).push(g.own[id]!);
    }
    if (i < 10 && playArchetypes(seed, roster, arch).hash === g.hash) deterministic++;

    // Paired runs: one nation, same seed and neighbours, five ways.
    const who = playable[mix32(seed * 31 + 7) % playable.length]!;
    const coop = playArchetypes(seed, roster, { ...arch, [who]: 'cooperator' });
    const iso = playArchetypes(seed, roster, { ...arch, [who]: 'isolationist' });
    const exp = playArchetypes(seed, roster, { ...arch, [who]: 'exploiter' });
    const bet = playArchetypes(seed, roster, { ...arch, [who]: 'betrayer' });
    const rider = playArchetypes(seed, roster, { ...arch, [who]: 'freeRider' });
    freeRide.push(coop.final[who]! / rider.final[who]! - 1);
    freeRideAhead.push(coop.final[who]! > rider.final[who]!);
    account(coop);
    account(bet);
    betrayalAhead.push(coop.final[who]! > bet.final[who]!);
    betrayal.push(coop.final[who]! / bet.final[who]! - 1);
    trading.push(coop.own[who]! / iso.own[who]! - 1);
    reciprocity.push(coop.final[who]! / exp.final[who]! - 1);
    reciprocityAhead.push(coop.final[who]! > exp.final[who]!);
  }

  const fairLimit = 2 / playable.length;
  const [topNation, topCount] = Object.entries(tops).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  // ROADMAP's archetypes are the bots (hoarder, isolationist, trade exploiter, free-rider); the
  // cooperative AI is what they are measured against, so the 1.5x line applies to the bots.
  const archRatio = ARCHETYPES.filter((a) => a !== 'cooperator').map((a) => ({ a, ratio: (archTops[a] ?? 0) / Math.max(1e-9, archExpected[a] ?? 0) }));
  const worstArch = archRatio.sort((x, y) => y.ratio - x.ratio)[0]!;
  const coopRatio = (archTops.cooperator ?? 0) / Math.max(1e-9, archExpected.cooperator ?? 0);
  const medBetray = median(betrayal);
  const medFree = median(freeRide);
  const freeShare = freeRideAhead.filter(Boolean).length / Math.max(1, freeRideAhead.length);
  const successRate = crisesSucceeded / Math.max(1, crisesLocked);
  const betrayShare = betrayalAhead.filter(Boolean).length / Math.max(1, betrayalAhead.length);
  const medTrade = median(trading);
  const medRecip = median(reciprocity);
  const aheadShare = reciprocityAhead.filter(Boolean).length / Math.max(1, reciprocityAhead.length);
  const msPerTick = aiMs / Math.max(1, aiTicks);
  const budget = TUNABLES.aiBudgetUnitsPerTick.value;
  const pass: Record<string, boolean | null> = {
    crisis: successRate >= 0.4 && successRate <= 0.75,
    freeRiders: freeShare > 0.5 && medFree > 0,
    archetype: worstArch.ratio <= 1.5 && worstArch.ratio <= coopRatio,
    reciprocity: aheadShare > 0.5 && medRecip > 0,
    sabotage: null,
    topNation: topCount / games <= fairLimit,
    trading: medTrade >= 0.15,
    retaliation: strictBreaks === 0 ? null : strictAnswered === strictBreaks,
    betrayal: betrayShare > 0.5 && medBetray > 0,
    explanations: explained === aiCommands && numeric === explanations,
    budget: maxUnits <= budget && deferred === 0,
    determinism: deterministic === Math.min(10, games),
    rejected: rejected === 0,
  };
  const mark = (p: boolean | null): string => (p === null ? 'n/a' : p ? 'PASS' : 'FAIL');
  const archDetail = ARCHETYPES.map((a) => `${a} ${((archTops[a] ?? 0) / Math.max(1e-9, archExpected[a] ?? 0)).toFixed(2)}x`).join(', ');
  const ownDetail = ARCHETYPES.map((a) => `${a} ${(median(archOwn[a] ?? []) / 100).toFixed(1)}%`).join(', ');
  const rows = [
    ['Crisis success 40-75%', `${pct(successRate)} of ${crisesLocked} crises in the random-archetype games`, '40-75%', mark(pass.crisis!)],
    ['No defecting archetype over 1.5x fair share or ahead of the cooperator (random assignment; G1)', `worst bot ${worstArch.a} ${worstArch.ratio.toFixed(2)}x; cooperative AI ${coopRatio.toFixed(2)}x, not graded (${archDetail})`, 'bots <= 1.50x and <= cooperator', mark(pass.archetype!)],
    ['Reciprocal cooperators beat exploiters (paired)', `cooperator ahead in ${pct(aheadShare)} of pairs, median ${pct(medRecip)}`, '> 50%, median > 0', mark(pass.reciprocity!)],
    ['Reciprocal cooperators beat free-riders (paired, same AI that never pays)', `cooperator ahead in ${pct(freeShare)} of pairs, median ${pct(medFree)}`, '> 50%, median > 0', mark(pass.freeRiders!)],
    ['Trailing nation gains nothing by sabotage', 'measured by the harness gate2 suite (spoiler pairs)', 'saboteur lower', mark(pass.sabotage!)],
    ['No nation tops more than 2x fair share (Gate 1, waived)', `${topNation} ${pct(topCount / games)}`, `<= ${pct(fairLimit)}`, mark(pass.topNation!)],
    ['Trading beats isolating (Gate 1 carried, paired)', `median +${pct(medTrade)}`, '>= +15%', mark(pass.trading!)],
    ['Keeping deals beats breaking them (paired, betrayer)', `cooperator ahead in ${pct(betrayShare)} of pairs, median ${pct(medBetray)}`, '> 50%, median > 0', mark(pass.betrayal!)],
    ['Strict AI retaliates within the window after a broken deal', `${strictAnswered} of ${strictBreaks} (plus ${forgivingBreaks} against forgiving AIs)`, `all, within ${TUNABLES.aiRetaliationWindowTicks.value} ticks`, mark(pass.retaliation!)],
    ['Every visible AI decision is explained, with a number', `${explained} of ${aiCommands} commands; ${numeric} of ${explanations} texts numeric`, 'all', mark(pass.explanations!)],
    ['Per-tick compute budget', `peak ${maxUnits} of ${budget} units, ${deferred} deferred thinks; ${msPerTick.toFixed(2)} ms/tick on this machine`, `<= ${budget}, 0 deferred`, mark(pass.budget!)],
    ['AI commands the sim refuses as invalid', `${rejected} of ${aiCommands} (plus ${raced} same-month races: the other side answered first)`, '0 invalid', mark(pass.rejected!)],
    ['Determinism (repeat runs)', `${deterministic} of ${Math.min(10, games)} identical hashes`, 'all', mark(pass.determinism!)],
  ];
  const table = [
    `AI Gate 2 check: ${games} seeds from ${firstSeed}, ${games * 6} full-roster games (${games} random-archetype games + 5 paired runs each).`,
    '',
    '| Criterion | Result | Pass line | Verdict |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    `Median ownScore by archetype: ${ownDetail}.`,
    `Top scorers: ${Object.entries(tops).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([n, c]) => `${n} ${pct(c / games)}`).join(', ')}.`,
  ].join('\n');
  return { games, firstSeed, table, pass };
}
