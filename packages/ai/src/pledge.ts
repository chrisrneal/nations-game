import type { NationId, NationView } from '@nations/contracts';
import type { CrisisSeen } from './perception.ts';
import type { Personality } from './personality.ts';
import { month, rule } from './util.ts';

/**
 * Crisis pledges (RULES 4.3, docs/AI_DESIGN.md "Crisis pledges").
 *
 * The pool pays out by exposure, not by contribution, so free-riding works;
 * the AI's pledge is therefore a character decision, not an optimisation:
 *
 * - fair share: what is still missing from the pool, split by exposure x
 *   output across the playable nations (all public numbers);
 * - forgiving: pays its fair share scaled by cooperativeness;
 * - strict (a conditional cooperator): pays its full share when at least
 *   `aiConditionalPledgePct` of nations paid into the last crisis, and only
 *   that proportion of it otherwise;
 * - hard bargainer: skips once the pool is `aiFreeRideCoverPct` funded, and
 *   pays a token share before that (enough for the contributor bonuses).
 *
 * Never more than `aiPledgeMaxIncomePct` of a month's income, never more than
 * the Credit it has free.
 */
export interface PledgeDecision {
  readonly amount: number;
  readonly text: string;
  readonly reasons: readonly string[];
}

export interface PledgeInputs {
  readonly view: NationView;
  readonly p: Personality;
  readonly crisis: CrisisSeen;
  /** Climate exposure of every nation, from the published data (public). */
  readonly exposure: ReadonlyMap<NationId, number>;
  /** Share of playable nations (0-100) that paid into the last closed crisis, or null before the first. */
  readonly lastPaidPct: number | null;
  readonly creditFree: number;
}

export function fairShare(view: NationView, crisis: CrisisSeen, exposure: ReadonlyMap<NationId, number>): number {
  const gap = Math.max(0, crisis.target - crisis.pooled);
  if (gap === 0) return 0;
  const weightOf = (id: NationId, output: number): number => (exposure.get(id) ?? 0) * Math.max(0, output);
  const mine = weightOf(view.selfId, view.self.public.output);
  let total = mine;
  for (const o of view.others) if (o.public.kind === 'playable') total += weightOf(o.id, o.public.output);
  return total <= 0 ? 0 : Math.floor((gap * mine) / total);
}

export function decidePledge(input: PledgeInputs): PledgeDecision {
  const { view, p, crisis } = input;
  const share = fairShare(view, crisis, input.exposure);
  const fundedPct = crisis.target > 0 ? Math.floor((crisis.pooled * 100) / crisis.target) : 100;
  const name = `the ${crisis.label} (month ${month(crisis.openedTick)})`;
  const capIncome = Math.floor((view.self.public.output * rule(view, 'aiPledgeMaxIncomePct')) / 100);
  const cap = Math.max(0, Math.min(capIncome, input.creditFree));
  const shareReason = `my fair share is ${share} credit of a ${Math.max(0, crisis.target - crisis.pooled)} gap`;

  if (share === 0) {
    return { amount: 0, text: `no pledge to ${name}: the pool is ${fundedPct}% funded`, reasons: [`pool ${crisis.pooled} of ${crisis.target}`] };
  }
  let wanted: number;
  let why: string;
  switch (p.reciprocity) {
    case 'forgiving':
      wanted = Math.floor((share * (50 + p.cooperativeness)) / 100);
      why = `I pay ${50 + p.cooperativeness}% of my share whatever others do`;
      break;
    case 'strict': {
      const need = rule(view, 'aiConditionalPledgePct');
      const paid = input.lastPaidPct;
      if (paid === null || paid >= need) {
        wanted = share;
        why = paid === null ? 'first crisis: I pay my full share' : `${paid}% of nations paid last time (I match at ${need}%+)`;
      } else {
        wanted = Math.floor((share * paid) / 100);
        why = `only ${paid}% of nations paid last time, so I pay ${paid}% of my share`;
      }
      break;
    }
    case 'exploiter': {
      const freeRide = rule(view, 'aiFreeRideCoverPct');
      if (fundedPct >= freeRide) {
        return {
          amount: 0,
          text: `no pledge to ${name}: the pool is ${fundedPct}% funded and pays out by exposure`,
          reasons: [`pool is ${fundedPct}% funded (I skip at ${freeRide}%)`, shareReason],
        };
      }
      wanted = Math.floor((share * p.cooperativeness) / 200);
      why = `I pay a token ${Math.floor(p.cooperativeness / 2)}% of my share`;
      break;
    }
  }
  const amount = Math.min(cap, wanted);
  if (amount <= 0) {
    return { amount: 0, text: `no pledge to ${name}: I have ${input.creditFree} credit free`, reasons: [why, shareReason] };
  }
  return {
    amount,
    text: `pledged ${amount} credit to ${name}: ${why}`,
    reasons: [why, shareReason, `the pool is ${fundedPct}% funded`],
  };
}
