import type { NationRecord, NationScore } from '@nations/contracts';
import { TUNABLES } from './tunables.ts';
import type { ScoreTrack, WorldState } from './world.ts';

/**
 * Scoring, docs/RULES.md section 5 (D3), in basis points.
 *
 * Phase 1 has no crises, so the collective multiplier uses the two goals that
 * exist yet: nations at or above their own baseline, and world deficits met.
 * The climate and pandemic goals join the mean when Phase 2 adds them.
 */
export type { NationScore };

export interface Scoreboard {
  readonly collectiveBp: number;
  readonly multiplierBp: number;
  /** Playable nations only, in nation order. Aggregates are never scored. */
  readonly nations: readonly NationScore[];
}

/**
 * ownScore x 10,000 (RULES 5.1): the smoothed track when there is one, else
 * last month's output over last month's baseline output.
 */
export function ownScoreBp(nation: NationRecord, track?: ScoreTrack): number {
  if (track !== undefined) return Math.floor((track.outputE3 * 10_000) / Math.max(1, track.baselineE3));
  const baseline = Math.max(1, nation.public.baselineOutput);
  return Math.floor((nation.public.output * 10_000) / baseline);
}

/**
 * One step of the score smoothing (RULES 5.1): move 1/span of the way from
 * the previous value to this month's, truncating towards the previous value.
 * The first month seeds the track. A span of 1 is no smoothing at all.
 */
export function smoothTowards(previous: number | undefined, value: number, span: number): number {
  if (previous === undefined) return value;
  return previous + Math.trunc((value - previous) / Math.max(1, span));
}

/** This month's track for one nation, from its freshly stepped public output and baseline. */
export function nextScoreTrack(previous: ScoreTrack | undefined, nation: NationRecord): ScoreTrack {
  const span = TUNABLES.scoreSmoothingTicks.value;
  return {
    outputE3: smoothTowards(previous?.outputE3, nation.public.output * 1000, span),
    baselineE3: smoothTowards(previous?.baselineE3, nation.public.baselineOutput * 1000, span),
  };
}

export function scoreboard(state: WorldState): Scoreboard {
  const playable = state.nationOrder
    .map((id) => state.nations[id] as NationRecord)
    .filter((n) => n.public.kind === 'playable');
  const own = playable.map((n) => ({ id: n.id, ownScoreBp: ownScoreBp(n, state.scoreTrack[n.id]) }));

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
