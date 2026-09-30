import type { Command, NationView, StandingPolicy } from '@nations/contracts';
import { GREEDY, greedyDecide, type TraderStyle } from '@nations/ai';

/**
 * Balance-harness strategies (docs/ROADMAP.md, "Balance harness"). Each reads
 * only its View and plays through ordinary commands, like any AI or player.
 *
 * Played by the shipped AI (`AiDirector`, packages/ai), the AI the phone runs
 * (prompt 13, GATE-2 F1). game.ts runs one director per game:
 * - trader: the AI in its data-derived style (the reciprocal cooperator).
 * - freeRider: the AI with paying switched off: trades exactly like the
 *   trader, pays nothing into any pool. Fixed for the whole game.
 * - selfReliant (prompt 17): the AI's investing and crisis play with trade closed
 *   (reject-everything posture, no offers): pays to be self-reliant instead of
 *   depending on partners. Reported against the trader, not graded.
 * - stealthSpoiler: the AI's trade, but pays nothing and pledges twice its
 *   share to every appeal only to withdraw it (GATE-2 criterion 4 and the
 *   reviewer's check: sabotage without closing trade). Used from mid-game.
 *
 * Bots (Phase 1 greedy trader underneath, kept as they were):
 * - hoarder: buys what it lacks, never sells or pays in goods, sits on surplus,
 *   and hoards Credit too: pays nothing into the crisis pools.
 * - isolationist: sets the reject-everything policy and never trades. Crisis
 *   policies stay at the defaults: isolation is a trade posture.
 * - exploiter: sells only as hard bargains above the fair band and promises
 *   the same goods to two buyers at once, so some of its deals fail; in a
 *   crisis it pledges its share and withdraws the pledge the next month.
 * - spoiler: the saboteur of RULES 5.3. Closes its trade, pays nothing, and
 *   pledges twice its share to every appeal only to withdraw it, to sink the
 *   shared goal. Used from mid-game by the Gate 2 spoiler scenario.
 */
export const STRATEGIES = ['trader', 'hoarder', 'isolationist', 'exploiter'] as const;
/** The Gate 2 archetypes, assigned at random: Gate 1's four plus the free-rider. */
export const ARCHETYPES = [...STRATEGIES, 'freeRider'] as const;
/**
 * The fixed-rate investment strategies (prompt 17, docs/balance/gate2-prompt17.md):
 * the AI's trade and crisis play unchanged, with its investment plan replaced by
 * a flat rule, `invest<N>` = spend N percent of spare Credit each month on the
 * good with the larger gap. `invest0` never invests. Fixed for the whole game.
 */
export const INVEST_RATES = [0, 10, 25, 50, 100] as const;
export type InvestStrategy = `invest${(typeof INVEST_RATES)[number]}`;
export const INVEST_STRATEGIES: readonly InvestStrategy[] = INVEST_RATES.map((r) => `invest${r}` as const);
export type Strategy = (typeof ARCHETYPES)[number] | 'spoiler' | 'stealthSpoiler' | 'selfReliant' | InvestStrategy;

/** The percent of spare Credit a fixed-rate strategy invests each month, or null for any other strategy. */
export function investRateOf(strategy: Strategy): number | null {
  const m = /^invest(\d+)$/.exec(strategy);
  return m === null ? null : Number(m[1]);
}

/** The strategies the shipped AI plays; the rest are bots. */
export const AI_STRATEGIES: readonly Strategy[] = ['trader', 'freeRider', 'stealthSpoiler', 'selfReliant', ...INVEST_STRATEGIES];
export const playedByAi = (strategy: Strategy): boolean => AI_STRATEGIES.includes(strategy);

const HOARDER: TraderStyle = { ...GREEDY, sells: false, paysGoods: false };

/** No money into any pool: no monthly contribution, and appeals answered with no. */
const PAYS_NOTHING: Partial<StandingPolicy> = { crisisRule: 'none', contributionBp: 0 };

/** A setPolicy command for whatever part of `wanted` differs from the nation's policy now, or none. */
function ensurePolicy(view: NationView, wanted: Partial<StandingPolicy>): Command[] {
  const current = view.self.private.policy as unknown as Record<string, unknown>;
  const diff = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => current[k] !== v));
  if (Object.keys(diff).length === 0) return [];
  return [{ nationId: view.selfId, tick: view.tick, type: 'setPolicy', payload: diff }];
}

/**
 * Promise-then-break: pledge `multiple` x its share to every open appeal it has
 * not pledged to, due on the appeal's deadline, and withdraw every pledge it
 * made last month. Counts as a broken pledge every time (RULES 4.4).
 */
function pledgeAndBreak(view: NationView, multiple: number): Command[] {
  const out: Command[] = [];
  for (const pledge of view.crises.pledges) {
    if (pledge.nationId === view.selfId && pledge.createdTick < view.tick) {
      out.push({ nationId: view.selfId, tick: view.tick, type: 'withdrawPledge', payload: { pledgeId: pledge.id } });
    }
  }
  for (const crisis of view.crises.open) {
    const share = crisis.shares[view.selfId] ?? 0;
    const pledged = view.crises.pledges.some((p) => p.nationId === view.selfId && p.pool === crisis.pool);
    if (share > 0 && !pledged && crisis.deadlineTick > view.tick && crisis.answers[view.selfId] === undefined) {
      out.push({ nationId: view.selfId, tick: view.tick, type: 'pledge', payload: { pool: crisis.pool, amount: share * multiple, deadlineTick: crisis.deadlineTick } });
    }
  }
  return out;
}

/**
 * What an AI-played nation sends this tick, given the director's commands for it.
 * The trader and the free-rider send the AI's commands unchanged (the free-rider's
 * mind was built never to pay). The stealth spoiler drops the AI's crisis answers
 * and crisis dials, and pledges-then-breaks instead.
 */
export function aiDecide(strategy: Strategy, view: NationView, aiCommands: readonly Command[]): Command[] {
  if (strategy === 'selfReliant') {
    // The AI's investment and crisis play, with trade closed: the isolationist that pays to be self-reliant (prompt 17).
    const kept = aiCommands.filter((c) => c.type === 'invest' || c.type === 'contribute' || c.type === 'declineAppeal' || c.type === 'setPolicy');
    return [...ensurePolicy(view, { rejectAll: true }), ...kept].slice(0, view.rules.maxCommandsPerNationPerTick ?? 8);
  }
  if (strategy !== 'stealthSpoiler') return [...aiCommands];
  const limit = view.rules.maxCommandsPerNationPerTick ?? 8;
  const trade = aiCommands.flatMap((c): Command[] => {
    if (c.type === 'contribute' || c.type === 'declineAppeal') return [];
    if (c.type !== 'setPolicy') return [c];
    const rest = Object.fromEntries(Object.entries(c.payload as Record<string, unknown>).filter(([k]) => !(k in PAYS_NOTHING)));
    return Object.keys(rest).length === 0 ? [] : [{ ...c, payload: rest }];
  });
  return [...ensurePolicy(view, PAYS_NOTHING), ...pledgeAndBreak(view, 2), ...trade].slice(0, limit);
}

/** The bots' moves. The AI strategies are played by the director (`aiDecide`), never here. */
export function botDecide(strategy: Strategy, view: NationView, seed: number): Command[] {
  const limit = view.rules.maxCommandsPerNationPerTick ?? 8;
  const fit = (commands: Command[]): Command[] => commands.slice(0, limit);
  switch (strategy) {
    case 'trader':
    case 'freeRider':
    case 'stealthSpoiler':
    case 'selfReliant':
    case 'invest0':
    case 'invest10':
    case 'invest25':
    case 'invest50':
    case 'invest100':
      throw new Error(`${strategy} is played by the AI director (aiDecide), not by a bot`);
    case 'hoarder':
      return fit([...ensurePolicy(view, PAYS_NOTHING), ...greedyDecide(view, seed, HOARDER).commands]);
    case 'isolationist':
      return ensurePolicy(view, { rejectAll: true });
    case 'exploiter': {
      const markupPct = (view.rules.priceBandPct ?? 0) + 15;
      const moves = greedyDecide(view, seed, { sells: true, paysGoods: true, markupPct, sellFanout: 2 }).commands;
      return fit([...ensurePolicy(view, { hardBargains: true, ...PAYS_NOTHING }), ...pledgeAndBreak(view, 1), ...moves]);
    }
    case 'spoiler':
      return fit([...ensurePolicy(view, { rejectAll: true, ...PAYS_NOTHING }), ...pledgeAndBreak(view, 2)]);
  }
}
