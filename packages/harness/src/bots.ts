import type { Command, NationView, StandingPolicy } from '@nations/contracts';
import { GREEDY, greedyDecide, type TraderStyle } from '@nations/ai';

/**
 * Balance-harness strategies (docs/ROADMAP.md, "Balance harness"). Each reads
 * only its View and plays through ordinary commands, like any AI or player.
 *
 * Trade (Gate 1):
 * - trader: the greedy trader from packages/ai, with the default crisis
 *   policies (reciprocal rule, monthly contribution): the reciprocal cooperator.
 * - hoarder: buys what it lacks, never sells or pays in goods, sits on surplus,
 *   and hoards Credit too: pays nothing into the crisis pools.
 * - isolationist: sets the reject-everything policy and never trades. Crisis
 *   policies stay at the defaults: isolation is a trade posture.
 * - exploiter: sells only as hard bargains above the fair band and promises
 *   the same goods to two buyers at once, so some of its deals fail; in a
 *   crisis it pledges its share and withdraws the pledge the next month.
 *
 * Crises (Gate 2):
 * - freeRider: trades exactly like the trader, but pays nothing into any pool.
 * - spoiler: the saboteur of RULES 5.3. Closes its trade, pays nothing, and
 *   pledges twice its share to every appeal only to withdraw it, to sink the
 *   shared goal. Used from mid-game by the Gate 2 spoiler scenario.
 */
export const STRATEGIES = ['trader', 'hoarder', 'isolationist', 'exploiter'] as const;
/** The Gate 2 archetypes, assigned at random: Gate 1's four plus the free-rider. */
export const ARCHETYPES = [...STRATEGIES, 'freeRider'] as const;
export type Strategy = (typeof ARCHETYPES)[number] | 'spoiler';

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

export function botDecide(strategy: Strategy, view: NationView, seed: number): Command[] {
  const limit = view.rules.maxCommandsPerNationPerTick ?? 8;
  const fit = (commands: Command[]): Command[] => commands.slice(0, limit);
  switch (strategy) {
    case 'trader':
      return [...greedyDecide(view, seed).commands];
    case 'freeRider':
      return fit([...ensurePolicy(view, PAYS_NOTHING), ...greedyDecide(view, seed).commands]);
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
