import type { Crisis, NationView } from '@nations/contracts';
import type { Personality } from './personality.ts';
import { balanceOf, GOODS, type Good } from './util.ts';

/**
 * Layer 4, goals (docs/AI_DESIGN.md).
 *
 * A short ranked list of what the nation wants right now, re-scored every
 * `aiGoalRescoreTicks` (staggered across nations). Weights are 0-10,000 and
 * come from the nation's position in the View shaded by its personality, so
 * two nations in the same position but with different data want different
 * things. The action layer spends effort in goal order.
 */
export type GoalId = 'cover:food' | 'cover:energy' | 'sell:food' | 'sell:energy' | 'pledge' | 'resilience';

export interface Goal {
  readonly id: GoalId;
  readonly weight: number;
  /** Why, with numbers: shown in the nation's own why-sheet, never to rivals. */
  readonly reason: string;
}

export function scoreGoals(view: NationView, p: Personality, crises: readonly Crisis[]): Goal[] {
  const goals: Goal[] = [];
  const self = view.self;
  for (const good of GOODS) {
    const flow = self.public[good];
    const b = balanceOf(self, good);
    if (b < 0) {
      // Share of demand uncovered by production, shaded by how import-dependent the nation is.
      const gapBp = Math.floor((-b * 10_000) / Math.max(1, flow.demand));
      const weight = Math.min(10_000, Math.floor((gapBp * (50 + p.inputs.importDependence)) / 100));
      goals.push({ id: `cover:${good}` as GoalId, weight, reason: `my ${good} production covers ${100 - Math.floor(gapBp / 100)}% of demand (deficit ${-b})` });
    } else if (b > 0) {
      const spareBp = Math.floor((b * 10_000) / Math.max(1, flow.demand + b));
      const weight = Math.min(10_000, Math.floor((spareBp * (50 + p.cooperativeness)) / 100));
      goals.push({ id: `sell:${good}` as GoalId, weight, reason: `my ${good} surplus is ${b} a month` });
    }
  }
  if (crises.length > 0) {
    // A crisis matters more to the exposed and the far-sighted.
    const weight = Math.min(10_000, (p.inputs.exposure + p.timeHorizon) * 60);
    goals.push({ id: 'pledge', weight, reason: `${crises.length} crisis pool${crises.length > 1 ? 's' : ''} open, my exposure is ${p.inputs.exposure}` });
  }
  const floor = self.private.policy.resilienceFloor;
  if (self.private.resilience < floor + 10) {
    const weight = Math.min(10_000, (floor + 10 - self.private.resilience) * (50 + p.timeHorizon));
    goals.push({ id: 'resilience', weight, reason: `resilience ${self.private.resilience} against a floor of ${floor}` });
  }
  return goals.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));
}

/** Goods in the order the goals rank them, for one kind of goal. */
export function goodsByGoal(goals: readonly Goal[], kind: 'cover' | 'sell'): Good[] {
  return goals.filter((g) => g.id.startsWith(`${kind}:`)).map((g) => g.id.slice(kind.length + 1) as Good);
}

export function goalWeight(goals: readonly Goal[], id: GoalId): number {
  return goals.find((g) => g.id === id)?.weight ?? 0;
}
