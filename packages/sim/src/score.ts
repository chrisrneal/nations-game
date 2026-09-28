import type { NationId, NationRecord } from '@nations/contracts';
import { TUNABLES } from './tunables.ts';
import type { WorldState } from './world.ts';

/**
 * Scoring, docs/RULES.md section 5 (D3), in basis points.
 *
 * Phase 1 has no crises, so the collective multiplier uses the two goals that
 * exist yet: nations at or above their own baseline, and world deficits met.
 * The climate and pandemic goals join the mean when Phase 2 adds them.
 */
export interface NationScore {
  readonly id: NationId;
  /** Realised output over the nation's own baseline output, x 10,000. */
  readonly ownScoreBp: number;
  readonly finalScore: number;
}

export interface Scoreboard {
  readonly collectiveBp: number;
  readonly multiplierBp: number;
  /** Playable nations only, in nation order. Aggregates are never scored. */
  readonly nations: readonly NationScore[];
}

export function ownScoreBp(nation: NationRecord): number {
  const baseline = Math.max(1, nation.public.baselineOutput);
  return Math.floor((nation.public.output * 10_000) / baseline);
}

export function scoreboard(state: WorldState): Scoreboard {
  const playable = state.nationOrder
    .map((id) => state.nations[id] as NationRecord)
    .filter((n) => n.public.kind === 'playable');
  const own = playable.map((n) => ({ id: n.id, ownScoreBp: ownScoreBp(n) }));

  const tolerance = TUNABLES.baselineToleranceBp.value;
  const atBaselineBp =
    own.length === 0 ? 0 : Math.floor((own.filter((n) => n.ownScoreBp >= tolerance).length * 10_000) / own.length);
  const l = state.ledger;
  const metBp = (consumed: number, unmet: number): number =>
    consumed + unmet === 0 ? 10_000 : Math.floor((consumed * 10_000) / (consumed + unmet));
  const deficitsMetBp = Math.floor((metBp(l.foodConsumed, l.foodUnmet) + metBp(l.energyConsumed, l.energyUnmet)) / 2);
  const collectiveBp = Math.floor((atBaselineBp + deficitsMetBp) / 2);

  const floor = TUNABLES.collectiveFloorBp.value;
  const ceiling = TUNABLES.collectiveCeilingBp.value;
  const multiplierBp = floor + Math.floor(((ceiling - floor) * collectiveBp) / 10_000);
  const scale = TUNABLES.scoreScale.value;
  return {
    collectiveBp,
    multiplierBp,
    nations: own.map((n) => ({
      ...n,
      finalScore: Math.floor((scale * n.ownScoreBp * multiplierBp) / 100_000_000),
    })),
  };
}
