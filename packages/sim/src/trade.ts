import type {
  Event,
  NationEndowment,
  NationId,
  NationRecord,
  Prices,
  ResourceAmount,
  TradeOffer,
  WorldLedger,
} from '@nations/contracts';
import { CAPACITY_CEILING_E4, fairShareDeficit, isFair, mulDiv, structuralBalance, type StructuralCover } from './economy.ts';
import { adjustTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';

/**
 * The trade system, docs/RULES.md section 3: offer, accept, reject, counter,
 * withdraw, expire and settle. Every path resolves inside the step with
 * nobody online (seam 8): an unanswered offer gets its receiver's standing
 * policy on its last tick, and anything still open then expires.
 *
 * Works on the step's mutable draft (`TradeContext`), never on input State.
 */
export interface TradeContext {
  readonly tick: number;
  readonly prices: Prices;
  readonly nationOrder: readonly NationId[];
  readonly nations: Record<NationId, NationRecord>;
  readonly endowments: Readonly<Record<NationId, NationEndowment>>;
  /** Open offers, oldest first. Mutated in place. */
  readonly offers: TradeOffer[];
  nextOfferId: number;
  ledger: WorldLedger;
  readonly events: Event[];
  /**
   * Gain-eligible units already counted this tick: a receiver's deficit
   * covered, key `${nation}:${resource}:in`, and a supplier's surplus
   * cleared, key `${nation}:${resource}:out`.
   */
  readonly covered: Map<string, number>;
  /** Trade gain granted this tick per nation, hundredths of a basis point. */
  readonly gainCbp: Map<NationId, number>;
  /** This tick's structural cover (RULES 2.8), which sets each importer's fair share. */
  readonly cover: StructuralCover;
}

type AnsweredBy = 'command' | 'policy';

function get(ctx: TradeContext, id: NationId): NationRecord {
  return ctx.nations[id] as NationRecord;
}

function removeOffer(ctx: TradeContext, id: number): TradeOffer | undefined {
  const index = ctx.offers.findIndex((o) => o.id === id);
  if (index === -1) return undefined;
  const [offer] = ctx.offers.splice(index, 1);
  return offer;
}

function emit(ctx: TradeContext, type: string, offer: TradeOffer, extra: Record<string, unknown> = {}): void {
  ctx.events.push({ tick: ctx.tick, type, payload: { offer, ...extra }, audience: [offer.from, offer.to] });
}

/** Adds a new open offer. Validation happens before this is called. */
export function createOffer(
  ctx: TradeContext,
  from: NationId,
  to: NationId,
  give: ResourceAmount,
  gets: ResourceAmount,
  counterOf: number | null,
): TradeOffer {
  const offer: TradeOffer = {
    id: ctx.nextOfferId,
    from,
    to,
    give: { resource: give.resource, amount: give.amount },
    get: { resource: gets.resource, amount: gets.amount },
    createdTick: ctx.tick,
    expiryTick: ctx.tick + TUNABLES.offerLifeTicks.value,
    hardBargain: !isFair(ctx.prices, give, gets),
    counterOf,
  };
  ctx.nextOfferId += 1;
  ctx.offers.push(offer);
  emit(ctx, 'offerMade', offer);
  return offer;
}

function moveStock(nation: NationRecord, amount: ResourceAmount, sign: 1 | -1): NationRecord {
  const stocks = { ...nation.private.stocks };
  stocks[amount.resource] += sign * amount.amount;
  return { ...nation, private: { ...nation.private, stocks } };
}

/**
 * What a nation can clear by trade in a month, in thousandths of a Credit at
 * reference prices (RULES 3.3): its whole structural surplus of each good,
 * plus its fair share of each structural deficit (RULES 2.8). A nation with
 * no imbalance has nothing to clear and gains nothing from trade.
 */
export function tradeImbalanceMilli(nation: Pick<NationRecord, 'public'>, prices: Prices, cover: StructuralCover): number {
  let total = 0;
  for (const good of ['food', 'energy'] as const) {
    const flow = nation.public[good];
    const balance = flow.production - flow.demand;
    total += (balance >= 0 ? balance : fairShareDeficit(flow, cover[good])) * prices[good];
  }
  return total;
}

/**
 * Gains from trade (RULES 3.3) for one leg: `amount` moves from supplier to
 * receiver. It counts only when the supplier has a structural surplus and the
 * receiver a structural deficit of that resource: up to the part of the
 * receiver's monthly deficit not already covered this tick, and up to the
 * part of the supplier's monthly surplus not already sold, so round trips and
 * repeat deliveries cannot farm it.
 *
 * Each side gains by the share of its own imbalance the leg clears, never by
 * the other side's size: `gainsFromTradeBp` x cleared value / what it can
 * clear (`tradeImbalanceMilli`), capped at `gainsFromTradeBp` a month. A
 * nation that trades its whole surplus, or covers its fair share of a
 * deficit, grows the full rate whatever its size.
 */
function applyGains(ctx: TradeContext, supplier: NationId, receiver: NationId, leg: ResourceAmount): void {
  if (leg.resource === 'credit') return;
  const surplus = structuralBalance(get(ctx, supplier), leg.resource);
  const deficit = -structuralBalance(get(ctx, receiver), leg.resource);
  if (surplus <= 0 || deficit <= 0) return;
  const inKey = `${receiver}:${leg.resource}:in`;
  const covered = Math.min(leg.amount, deficit - (ctx.covered.get(inKey) ?? 0));
  if (covered <= 0) return;
  ctx.covered.set(inKey, (ctx.covered.get(inKey) ?? 0) + covered);
  const outKey = `${supplier}:${leg.resource}:out`;
  const sold = Math.max(0, Math.min(covered, surplus - (ctx.covered.get(outKey) ?? 0)));
  ctx.covered.set(outKey, (ctx.covered.get(outKey) ?? 0) + sold);

  const fullCbp = TUNABLES.gainsFromTradeBp.value * 100;
  for (const [id, units] of [
    [supplier, sold],
    [receiver, covered],
  ] as const) {
    const n = get(ctx, id);
    const room = fullCbp - (ctx.gainCbp.get(id) ?? 0);
    const clearable = tradeImbalanceMilli(n, ctx.prices, ctx.cover);
    if (units <= 0 || room <= 0 || clearable <= 0) continue;
    const cbp = Math.min(room, mulDiv(fullCbp, units * ctx.prices[leg.resource], clearable));
    const gainE4 = mulDiv(n.private.capacityE4, cbp, 1_000_000);
    const capacityE4 = Math.min(CAPACITY_CEILING_E4, n.private.capacityE4 + gainE4);
    ctx.nations[id] = { ...n, private: { ...n.private, capacityE4 } };
    ctx.gainCbp.set(id, (ctx.gainCbp.get(id) ?? 0) + cbp);
  }
}

/**
 * Accept an open offer and settle it at once. If either side cannot pay now,
 * nothing moves: the side that cannot pay has reneged (maker checked first),
 * and loses `trustPerRenege` of the other side's trust.
 */
export function acceptOffer(ctx: TradeContext, offerId: number, by: AnsweredBy): void {
  const offer = removeOffer(ctx, offerId);
  if (offer === undefined) return;
  const maker = get(ctx, offer.from);
  const taker = get(ctx, offer.to);
  let reneger: NationId | null = null;
  if (maker.private.stocks[offer.give.resource] < offer.give.amount) reneger = maker.id;
  else if (taker.private.stocks[offer.get.resource] < offer.get.amount) reneger = taker.id;

  if (reneger !== null) {
    const victim = reneger === offer.from ? offer.to : offer.from;
    ctx.nations[victim] = adjustTrust(get(ctx, victim), reneger, -TUNABLES.trustPerRenege.value);
    const r = get(ctx, reneger);
    ctx.nations[reneger] = { ...r, private: { ...r.private, reneges: r.private.reneges + 1 } };
    ctx.ledger = { ...ctx.ledger, offersFailed: ctx.ledger.offersFailed + 1 };
    emit(ctx, 'offerFailed', offer, { reneger, by });
    return;
  }

  let m = moveStock(moveStock(maker, offer.give, -1), offer.get, 1);
  let t = moveStock(moveStock(taker, offer.get, -1), offer.give, 1);
  m = adjustTrust(m, t.id, TUNABLES.trustPerTrade.value);
  t = adjustTrust(t, m.id, TUNABLES.trustPerTrade.value);
  m = { ...m, private: { ...m.private, tradesSettled: m.private.tradesSettled + 1 } };
  t = { ...t, private: { ...t.private, tradesSettled: t.private.tradesSettled + 1 } };
  ctx.nations[m.id] = m;
  ctx.nations[t.id] = t;
  applyGains(ctx, offer.from, offer.to, offer.give);
  applyGains(ctx, offer.to, offer.from, offer.get);
  ctx.ledger = { ...ctx.ledger, tradesSettled: ctx.ledger.tradesSettled + 1 };
  emit(ctx, 'offerSettled', offer, { by });
}

export function rejectOffer(ctx: TradeContext, offerId: number, by: AnsweredBy): void {
  const offer = removeOffer(ctx, offerId);
  if (offer !== undefined) emit(ctx, 'offerRejected', offer, { by });
}

export function withdrawOffer(ctx: TradeContext, offerId: number): void {
  const offer = removeOffer(ctx, offerId);
  if (offer !== undefined) emit(ctx, 'offerWithdrawn', offer);
}

/** The receiver answers with new terms: the original closes and a new offer runs the other way. */
export function counterOffer(ctx: TradeContext, offerId: number, give: ResourceAmount, gets: ResourceAmount): void {
  const offer = removeOffer(ctx, offerId);
  if (offer === undefined) return;
  const counter = createOffer(ctx, offer.to, offer.from, give, gets, offer.id);
  ctx.events.push({
    tick: ctx.tick,
    type: 'offerCountered',
    payload: { offer, counter },
    audience: [offer.from, offer.to],
  });
}

/** A standing policy's answer to an offer, with the numbers behind it (RULES 7.4). */
export interface PolicyAnswer {
  readonly answer: 'accept' | 'reject';
  readonly reasons: readonly string[];
}

/**
 * What a nation's standing policy says about an offer it received (RULES
 * 3.4): accept when an auto-accept condition holds and it can pay while
 * keeping a month of demand of what it pays; otherwise decline. A policy
 * answers every offer, so an absent nation never leaves one to lapse
 * (Phase 2 prompt 09).
 */
export function policyAnswer(ctx: TradeContext, offer: TradeOffer): PolicyAnswer {
  const receiver = get(ctx, offer.to);
  const policy = receiver.private.policy;
  const pays = offer.get;
  const gets = offer.give;
  if (policy.rejectAll) return { answer: 'reject', reasons: [`Trade posture closed: declines every offer, this one ${gets.amount} ${gets.resource} for ${pays.amount} ${pays.resource}.`] };
  const keep = pays.resource === 'credit' ? 0 : receiver.public[pays.resource].demand;
  const holds = receiver.private.stocks[pays.resource];
  if (holds - pays.amount < keep) {
    return { answer: 'reject', reasons: [`Paying ${pays.amount} ${pays.resource} would leave ${holds - pays.amount}, under the ${keep} a month needs.`] };
  }
  const trust = receiver.private.trust[offer.from] ?? 0;
  const threshold = TUNABLES.autoAcceptTrustThreshold.value;
  if (policy.acceptTrusted && trust >= threshold) {
    return { answer: 'accept', reasons: [`Trusted partner: trust ${trust} is at or above ${threshold}.`] };
  }
  const fair = isFair(ctx.prices, offer.give, offer.get);
  if (policy.acceptFairDeficit && fair && gets.resource !== 'credit') {
    const deficit = -structuralBalance(receiver, gets.resource);
    const stock = receiver.private.stocks[gets.resource];
    if (deficit > 0 && stock < deficit) {
      return { answer: 'accept', reasons: [`Fair price and covers a ${deficit} ${gets.resource} monthly deficit with ${stock} in store.`] };
    }
  }
  const why = !fair
    ? `Outside the fair price band of ${TUNABLES.priceBandPct.value}%.`
    : gets.resource === 'credit' || -structuralBalance(receiver, gets.resource) <= 0
      ? `No ${gets.resource} deficit to cover.`
      : `Already holds ${receiver.private.stocks[gets.resource]} ${gets.resource}, a month of the deficit.`;
  return { answer: 'reject', reasons: [`No auto-accept condition met (trust ${trust}). ${why}`] };
}

/**
 * Standing policies answer every offer on its last answerable tick, and
 * background regions (which have nobody to wait for) answer every offer the
 * tick it arrives. Each receiver's cover priority is served first. Every
 * automatic answer carries its reasons in an `explanation` event for both
 * parties.
 */
export function runPolicies(ctx: TradeContext): void {
  const due = (o: TradeOffer): boolean =>
    o.expiryTick <= ctx.tick + 1 || get(ctx, o.to).public.kind === 'aggregate';
  for (const pass of [0, 1]) {
    const batch = ctx.offers.filter((o) => {
      if (!due(o)) return false;
      const priority = get(ctx, o.to).private.policy.coverPriority === o.give.resource;
      return pass === 0 ? priority : !priority;
    });
    for (const offer of batch) {
      if (!ctx.offers.some((o) => o.id === offer.id)) continue;
      const { answer, reasons } = policyAnswer(ctx, offer);
      if (get(ctx, offer.to).public.kind === 'playable') {
        ctx.events.push({
          tick: ctx.tick,
          type: 'explanation',
          payload: { nationId: offer.to, decision: 'answerOffer', subject: offer.id, reasons, by: 'policy' },
          audience: [offer.to, offer.from],
        });
      }
      if (answer === 'accept') acceptOffer(ctx, offer.id, 'policy');
      else rejectOffer(ctx, offer.id, 'policy');
    }
  }
}

/**
 * Keep us supplied (RULES 3.4): for every nation whose standing policy has
 * `autoImport` on, send fair offers for next month's shortfall of each good
 * (priority good first), to the nations with a surplus of it it trusts most,
 * at most `autoImportOffersPerGood` a good, never to a partner it already
 * has an offer open with, and only what it can pay for. It reads public flows
 * and its own stocks only: what the nation itself could see. The offers are
 * ordinary offers, answered next month by the seller's AI or policy.
 */
export function autoImports(ctx: TradeContext): void {
  for (const id of ctx.nationOrder) {
    const buyer = get(ctx, id);
    if (buyer.public.kind !== 'playable' || buyer.private.policy.autoImport !== true || buyer.private.policy.rejectAll) continue;
    const first = buyer.private.policy.coverPriority;
    for (const good of [first, first === 'food' ? 'energy' : 'food'] as const) {
      const flow = buyer.public[good];
      const mine = ctx.offers.filter((o) => o.from === id);
      const pendingIn = mine.filter((o) => o.get.resource === good).reduce((s, o) => s + o.get.amount, 0);
      let gap = flow.demand - flow.production - get(ctx, id).private.stocks[good] - pendingIn;
      if (gap <= 0) continue;
      const busy = new Set<NationId>(mine.map((o) => o.to));
      const sellers = ctx.nationOrder
        // Playable sellers only: a background region's policy never sells.
        .filter((s) => s !== id && !busy.has(s) && get(ctx, s).public.kind === 'playable' && structuralBalance(get(ctx, s), good) > 0)
        .sort((a, b) => (buyer.private.trust[b] ?? 0) - (buyer.private.trust[a] ?? 0) || structuralBalance(get(ctx, b), good) - structuralBalance(get(ctx, a), good));
      let sent = 0;
      for (const seller of sellers) {
        if (gap <= 0 || sent >= TUNABLES.autoImportOffersPerGood.value) break;
        if (ctx.offers.filter((o) => o.from === id).length >= TUNABLES.maxOpenOffersPerNation.value) return;
        const amount = Math.min(gap, structuralBalance(get(ctx, seller), good));
        const gets: ResourceAmount = { resource: good, amount };
        const pay: ResourceAmount = { resource: 'credit', amount: Math.max(1, Math.round((ctx.prices[good] * amount) / ctx.prices.credit)) };
        if (!isFair(ctx.prices, pay, gets) || get(ctx, id).private.stocks.credit < pay.amount) continue;
        createOffer(ctx, id, seller, pay, gets, null);
        gap -= amount;
        sent += 1;
      }
    }
  }
}

/** Offers nobody answered are gone once their expiry tick arrives. Ignoring costs the receiver trust. */
export function expireOffers(ctx: TradeContext): void {
  const expired = ctx.offers.filter((o) => o.expiryTick <= ctx.tick + 1);
  for (const offer of expired) {
    removeOffer(ctx, offer.id);
    ctx.nations[offer.from] = adjustTrust(get(ctx, offer.from), offer.to, -TUNABLES.trustPerIgnoredOffer.value);
    ctx.ledger = { ...ctx.ledger, offersExpired: ctx.ledger.offersExpired + 1 };
    emit(ctx, 'offerExpired', offer);
  }
}
