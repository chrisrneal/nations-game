/**
 * The home-investment card tracker: RULES 8.1, "When the card is shown"
 * (prompt 17b). Pure, and fed one observation per month, so the phone and the
 * harness can share the rule's shape and a test can script any sequence.
 *
 * Per good: `run` counts consecutive months of unmet > 0. A good is eligible
 * when run >= shortTicks, it has a gap and room under the ceiling, and Credit
 * covers the next point. The card goes to the eligible good short longest (ties
 * to the cover-priority good). An opened card stays open `openTicks` months (an
 * idle nation never answers it). The tracker remembers the month a card closed
 * and the good's gap when it was shown; a month with nothing unmet clears that
 * memory; while the same shortage goes on the good gets no new card until
 * `quietTicks` months after the last card closed, unless its gap is at least
 * `growthBp` above the gap at the last showing.
 */
import type { HomeGood } from '@nations/contracts';

export interface CardParams {
  readonly shortTicks: number;
  readonly openTicks: number;
  readonly quietTicks: number;
  readonly growthBp: number;
}

/** What one good shows in a month: last month's unmet amount plus the View's `invest` quote for the good. */
export interface GoodObservation {
  readonly unmet: number;
  readonly gapBp: number;
  readonly roomBp: number;
  readonly credit: number;
  readonly nextPointCost: number;
}

export interface CardObservation {
  readonly food: GoodObservation;
  readonly energy: GoodObservation;
}

const GOODS: readonly HomeGood[] = ['food', 'energy'];

interface Memory {
  /** The gap when the card was last shown. */
  gapAtShow: number;
  /** The first month the last card was no longer open (undefined while it is still open). */
  closedAt: number | undefined;
}

export interface CardTracker {
  /** Advances one month. Returns the good whose card is open this month, or null. */
  step(observation: CardObservation, coverPriority: HomeGood): HomeGood | null;
}

export function createCardTracker(params: CardParams): CardTracker {
  const run: Record<HomeGood, number> = { food: 0, energy: 0 };
  const memory: Record<HomeGood, Memory | undefined> = { food: undefined, energy: undefined };
  let open: { good: HomeGood; since: number } | null = null;
  let month = 0;

  return {
    step(observation, coverPriority) {
      const now = month++;
      for (const g of GOODS) {
        if (observation[g].unmet > 0) run[g]++;
        else {
          run[g] = 0;
          memory[g] = undefined;
        }
      }
      if (open !== null) {
        if (now - open.since < params.openTicks) return open.good;
        // Closes now. If the shortage ended while it was open, there is nothing to be quiet about.
        const m = memory[open.good];
        if (m !== undefined) m.closedAt = open.since + params.openTicks;
        open = null;
      }
      let pick: HomeGood | null = null;
      for (const g of GOODS) {
        const o = observation[g];
        const m = memory[g];
        const quietOver = m === undefined || (m.closedAt !== undefined && now - m.closedAt >= params.quietTicks) || o.gapBp >= m.gapAtShow + params.growthBp;
        const eligible = run[g] >= params.shortTicks && o.gapBp > 0 && o.roomBp > 0 && o.credit >= o.nextPointCost && quietOver;
        if (!eligible) continue;
        if (pick === null || run[g] > run[pick] || (run[g] === run[pick] && g === coverPriority)) pick = g;
      }
      if (pick === null) return null;
      open = { good: pick, since: now };
      memory[pick] = { gapAtShow: observation[pick].gapBp, closedAt: undefined };
      return pick;
    },
  };
}
