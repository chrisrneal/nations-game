import type { Crisis, NationView } from '@nations/contracts';
import { crisisLabel, lastPaidPct } from './perception.ts';
import type { Personality } from './personality.ts';
import { month, rule } from './util.ts';

/**
 * Answering a crisis appeal (RULES 4.3-4.4, docs/AI_DESIGN.md "Crisis pledges").
 *
 * The pool pays out by exposure, not by contribution, so free-riding works;
 * what a nation pays is therefore a character decision, not an optimisation.
 * The sim sets every nation's fair share of the target (exposure-weighted
 * output). The AI then pays by its reciprocity style:
 *
 * - forgiving: its share, scaled by cooperativeness, whatever others did;
 * - strict (a conditional cooperator): its full share when at least
 *   `aiConditionalPledgePct` of nations paid into the last crisis of this
 *   kind, and only that proportion of it otherwise;
 * - hard bargainer: declines once the pool is `aiFreeRideCoverPct` funded,
 *   and pays a token share before that.
 *
 * Never more than `aiPledgeMaxIncomePct` of a month's output, never more than
 * the Credit it has free. A payment is a `contribute` command, which answers
 * the appeal; paying nothing is a `declineAppeal`, visible to every nation.
 * A nation whose share is already paid also answers with `declineAppeal`
 * (there is nothing left to pay), and the sim records it as contributed.
 */
export interface PledgeDecision {
  readonly amount: number;
  readonly text: string;
  readonly reasons: readonly string[];
}

export interface PledgeInputs {
  readonly view: NationView;
  readonly p: Personality;
  readonly crisis: Crisis;
  readonly creditFree: number;
  /** False for a nation told never to pay (the free-rider bot in the AI's Gate 2 check). */
  readonly pays?: boolean;
}

/** What this nation still owes of its share: the share less what it paid into the pool this round. */
export function owedShare(view: NationView, crisis: Crisis): number {
  const share = crisis.shares[view.selfId] ?? 0;
  const pool = view.crises.pools.find((x) => x.kind === crisis.pool);
  const paid = pool?.round[view.selfId] ?? 0;
  return Math.max(0, share - paid);
}

export function decidePledge(input: PledgeInputs): PledgeDecision {
  const { view, p, crisis } = input;
  const owed = owedShare(view, crisis);
  const pool = view.crises.pools.find((x) => x.kind === crisis.pool);
  const balance = pool?.balance ?? 0;
  const fundedPct = crisis.target > 0 ? Math.floor((balance * 100) / crisis.target) : 100;
  const name = `the ${crisisLabel(crisis.kind)} (month ${month(crisis.openedTick)})`;
  const capIncome = Math.floor((view.self.public.output * rule(view, 'aiPledgeMaxIncomePct')) / 100);
  const cap = Math.max(0, Math.min(capIncome, input.creditFree));
  const shareReason = `I still owe ${owed} credit of my ${crisis.shares[view.selfId] ?? 0} share`;
  const fundedReason = `the pool holds ${balance} of ${crisis.target} (${fundedPct}%)`;

  if (input.pays === false) {
    return { amount: 0, text: `declined ${name}: I pay 0 into the pools`, reasons: [shareReason, fundedReason] };
  }
  if (owed === 0) {
    // Nothing left to pay. The sim records this answer as contributed, since the share is in the pool (GATE-2 F2).
    return { amount: 0, text: `paid ${name} in full: my share of ${crisis.shares[view.selfId] ?? 0} is already in the pool`, reasons: [fundedReason] };
  }
  let wanted: number;
  let why: string;
  switch (p.reciprocity) {
    case 'forgiving':
      wanted = Math.floor((owed * (50 + p.cooperativeness)) / 100);
      why = `I pay ${50 + p.cooperativeness}% of my share whatever others do`;
      break;
    case 'strict': {
      const need = rule(view, 'aiConditionalPledgePct');
      const paid = lastPaidPct(view, crisis.kind);
      if (paid === null || paid >= need) {
        wanted = owed;
        why = paid === null ? `first ${crisis.kind} appeal: I pay my full share of ${owed}` : `${paid}% of nations paid last time, so I pay my full share`;
      } else {
        wanted = Math.floor((owed * paid) / 100);
        why = `only ${paid}% of nations paid last time, so I pay ${paid}% of my share`;
      }
      break;
    }
    case 'exploiter': {
      const freeRide = rule(view, 'aiFreeRideCoverPct');
      if (fundedPct >= freeRide) {
        return {
          amount: 0,
          text: `declined ${name}: the pool is ${fundedPct}% funded and pays out by exposure`,
          reasons: [`I skip once a pool is ${freeRide}% funded`, shareReason],
        };
      }
      wanted = Math.floor((owed * p.cooperativeness) / 200);
      why = `I pay a token ${Math.floor(p.cooperativeness / 2)}% of my share`;
      break;
    }
  }
  const amount = Math.min(cap, wanted);
  if (amount <= 0) {
    return { amount: 0, text: `declined ${name}: I have ${input.creditFree} credit free`, reasons: [why, shareReason] };
  }
  return { amount, text: `paid ${amount} credit to ${name}: ${why}`, reasons: [why, shareReason, fundedReason] };
}
