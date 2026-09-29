import type { NationView, ResourceAmount, TradeOffer } from '@nations/contracts';
import { grudgePoints, punishing, type PartnerMemory } from './beliefs.ts';
import type { Personality } from './personality.ts';
import { isFair, month, rule, show, valueOf, type Good } from './util.ts';

/**
 * Layer 6, negotiation (docs/AI_DESIGN.md).
 *
 * Answers one offer made to this nation: accept, counter or reject. The
 * nation's reservation price moves with trust (`aiTrustPriceBpPerPoint`), with
 * how badly it needs what is offered, and with its stance: a hard bargainer
 * asks `aiExploiterMarkupPct` more, plus a surcharge for any grievance it
 * holds. An offer a little under the reservation gets a counter at the
 * reservation; one far under it is declined, with the gap in the sentence.
 */
export interface Ledger {
  /** Units still needed this tick after production, stock and pending deals. */
  readonly need: Record<Good, number>;
  /** Units that can be spared this tick. */
  readonly spare: Record<Good, number>;
  /** Credit not yet promised this tick. */
  creditFree: number;
  /** Stocks after this tick's commitments. */
  readonly stocks: { food: number; energy: number; credit: number };
  /** Open offers this nation has made. */
  open: number;
}

export type Answer =
  | { readonly kind: 'accept'; readonly text: string; readonly reasons: readonly string[] }
  | { readonly kind: 'reject'; readonly text: string; readonly reasons: readonly string[] }
  | {
      readonly kind: 'counter';
      readonly give: ResourceAmount;
      readonly get: ResourceAmount;
      readonly text: string;
      readonly reasons: readonly string[];
    };

/**
 * A hard bargainer does not refuse an offender, it charges: one percent per two
 * points of remembered grievance, never beyond the fair price band.
 */
export function grievanceSurchargePct(view: Pick<NationView, 'rules'>, memory: PartnerMemory | undefined): number {
  return memory === undefined ? 0 : Math.min(rule(view, 'priceBandPct'), Math.floor(grudgePoints(memory) / 2));
}

/**
 * What this nation will accept, as the value it receives over the value it
 * pays, in basis points (10,000 = even at reference prices).
 */
export function reservationBp(view: NationView, p: Personality, trust: number, memory: PartnerMemory | undefined, urgent: boolean): number {
  const perPoint = rule(view, 'aiTrustPriceBpPerPoint');
  // Trust above the no-ties level buys better terms, below it worse; cooperative nations round in your favour.
  let bp = 10_000 - (trust - rule(view, 'baseTrust')) * perPoint - p.cooperativeness * 10;
  if (urgent) bp -= p.inputs.importDependence * 20; // up to 20% worse terms when a deficit bites
  if (p.reciprocity === 'exploiter') bp += (rule(view, 'aiExploiterMarkupPct') + grievanceSurchargePct(view, memory)) * 100;
  return bp;
}

export function answerOffer(view: NationView, p: Personality, offer: TradeOffer, memory: PartnerMemory | undefined, ledger: Ledger): Answer {
  const gets = offer.give;
  const pays = offer.get;
  const now = view.tick;

  if (punishing(memory, now) && memory?.lastOffence !== null && memory !== undefined) {
    const o = memory.lastOffence!;
    const why = o.kind === 'broken' ? `you broke ${o.what}` : `you skipped ${o.what}`;
    return {
      kind: 'reject',
      text: `declined: ${why}; no trade with you until month ${month(memory.punishUntil)}`,
      reasons: [`${why}`, `retaliation lasts ${memory.punishUntil - memory.punishFrom} months`],
    };
  }

  const getsGood = gets.resource === 'credit' ? null : (gets.resource as Good);
  const paysGood = pays.resource === 'credit' ? null : (pays.resource as Good);
  const useful = getsGood !== null ? ledger.need[getsGood] > 0 : paysGood !== null;
  if (!useful) {
    const why = getsGood !== null ? `my ${getsGood} need this month is 0` : `a credit-for-credit swap is worth 0 to me`;
    return { kind: 'reject', text: `declined: no need for ${show(gets)}: ${why}`, reasons: [why] };
  }

  const canPay = paysGood === null ? ledger.creditFree >= pays.amount : ledger.spare[paysGood] >= pays.amount;
  const trust = view.self.private.trust[offer.from] ?? 0;
  const urgent = getsGood !== null && ledger.stocks[getsGood] < ledger.need[getsGood];
  const reservation = reservationBp(view, p, trust, memory, urgent);
  const vGets = valueOf(view.prices, gets);
  const vPays = Math.max(1, valueOf(view.prices, pays));
  const ratioBp = Math.floor((vGets * 10_000) / vPays);
  const trustReason = `my trust in you is ${trust}`;

  if (canPay && ratioBp >= reservation) {
    const text =
      getsGood !== null
        ? `accepted: ${show(gets)} covers my ${getsGood} need of ${ledger.need[getsGood]} at ${Math.floor(ratioBp / 100)}% of reference value`
        : `accepted: sells ${show(pays)} of my spare ${ledger.spare[paysGood!]} for ${gets.amount} credit`;
    return { kind: 'accept', text, reasons: [text.slice('accepted: '.length), trustReason] };
  }

  // Counter at the reservation price when the gap is small enough and a counter is legal.
  const counterRange = rule(view, 'aiCounterRangePct') * 100;
  const payable = paysGood === null ? ledger.creditFree : ledger.spare[paysGood];
  if (counterRange > 0 && ratioBp >= reservation - counterRange && ledger.open < rule(view, 'maxOpenOffersPerNation')) {
    // Keep what they give; pay only what the reservation allows, never more than we can.
    const payPrice = view.prices[pays.resource];
    const affordable = Math.min(payable, Math.floor((vGets * 10_000) / reservation / payPrice));
    const payAmount = Math.min(pays.amount - 1, affordable);
    if (payAmount >= 1) {
      const give: ResourceAmount = { resource: pays.resource, amount: payAmount };
      const get: ResourceAmount = { resource: gets.resource, amount: gets.amount };
      const legal = isFair(view, give, get) || view.self.private.policy.hardBargains;
      if (legal && view.self.private.stocks[give.resource] >= give.amount) {
        const gapPct = Math.floor((reservation - ratioBp) / 100);
        return {
          kind: 'counter',
          give,
          get,
          text: `countered: for ${show(gets)} I give ${payAmount} ${pays.resource}, not ${pays.amount} (your terms are ${gapPct}% under my price)`,
          reasons: [`your terms are ${gapPct}% under my price`, trustReason],
        };
      }
    }
  }

  if (!canPay) {
    const why = paysGood === null ? `I have ${ledger.creditFree} credit free, you ask ${pays.amount}` : `I can spare ${ledger.spare[paysGood]} ${paysGood}, you ask ${pays.amount}`;
    return { kind: 'reject', text: `declined: ${why}`, reasons: [why] };
  }
  const gapPct = Math.floor((reservation - ratioBp) / 100);
  return {
    kind: 'reject',
    text: `declined: your terms are ${gapPct}% under my price`,
    reasons: [`you offer ${Math.floor(ratioBp / 100)}% of what you ask in value`, trustReason],
  };
}
