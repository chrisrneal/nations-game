import type { Command, NationView } from '@nations/contracts';
import { GREEDY, greedyDecide, type TraderStyle } from '@nations/ai';

/**
 * Balance-harness strategies (docs/ROADMAP.md, "Balance harness"). Each reads
 * only its View and plays through ordinary commands, like any AI or player.
 *
 * - trader: the greedy trader from packages/ai, the cooperative baseline.
 * - hoarder: buys what it lacks, never sells or pays in goods, sits on surplus.
 * - isolationist: sets the reject-everything policy and never trades.
 * - exploiter: sells only as hard bargains above the fair band and promises
 *   the same goods to two buyers at once, so some of its deals fail.
 */
export const STRATEGIES = ['trader', 'hoarder', 'isolationist', 'exploiter'] as const;
export type Strategy = (typeof STRATEGIES)[number];

const HOARDER: TraderStyle = { ...GREEDY, sells: false, paysGoods: false };

export function botDecide(strategy: Strategy, view: NationView, seed: number): Command[] {
  const policy = view.self.private.policy;
  const setPolicy = (payload: Record<string, unknown>): Command => ({ nationId: view.selfId, tick: view.tick, type: 'setPolicy', payload });
  switch (strategy) {
    case 'trader':
      return [...greedyDecide(view, seed).commands];
    case 'hoarder':
      return [...greedyDecide(view, seed, HOARDER).commands];
    case 'isolationist':
      return policy.rejectAll ? [] : [setPolicy({ rejectAll: true })];
    case 'exploiter': {
      const markupPct = (view.rules.priceBandPct ?? 0) + 15;
      const moves = greedyDecide(view, seed, { sells: true, paysGoods: true, markupPct, sellFanout: 2 }).commands;
      return policy.hardBargains ? [...moves] : [setPolicy({ hardBargains: true }), ...moves.slice(0, 7)];
    }
  }
}
