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
import { CAPACITY_CEILING_E4, isFair, mulDiv, structuralBalance } from './economy.ts';
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
  /** Gain-eligible volume already counted this tick: deficit covered, key `${nation}:${resource}`; surplus sold, key `${nation}:${resource}:sold`. */
  readonly covered: Map<string, number>;
  /** Trade gain granted this tick per nation, hundredths of a basis point. */
  readonly gainCbp: Map<NationId, number>;
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
 * Gains from trade (RULES 3.3) for one leg: `amount` moves from supplier to
 * receiver. It counts only when the supplier has a structural surplus and the
 * receiver a structural deficit of that resource, and only up to the part of
 * the receiver's monthly deficit not already covered this tick. Each side
 * earns a bonus on its own capacity times its own share: the receiver
 * `gainsFromTradeBp` x the share of its deficit covered, the supplier
 * `exportGainsBp` x the share of its surplus sold into that deficit (each
 * surplus counted once per tick). So
 * round trips and repeat deliveries cannot farm it, and an exporter with a
 * small surplus gains as much from selling all of it as a big one does.
 */
function applyGains(ctx: TradeContext, supplier: NationId, receiver: NationId, leg: ResourceAmount): void {
  if (leg.resource === 'credit') return;
  const surplus = structuralBalance(get(ctx, supplier), leg.resource);
  if (surplus <= 0) return;
  const deficit = -structuralBalance(get(ctx, receiver), leg.resource);
  if (deficit <= 0) return;
  const inKey = `${receiver}:${leg.resource}`;
  const alreadyIn = ctx.covered.get(inKey) ?? 0;
  const covered = Math.min(leg.amount, deficit - alreadyIn);
  if (covered <= 0) return;
  ctx.covered.set(inKey, alreadyIn + covered);
  const outKey = `${supplier}:${leg.resource}:sold`;
  const alreadyOut = ctx.covered.get(outKey) ?? 0;
  const sold = Math.max(0, Math.min(covered, surplus - alreadyOut));
  ctx.covered.set(outKey, alreadyOut + sold);
  grantGain(ctx, receiver, TUNABLES.gainsFromTradeBp.value, covered, deficit);
  if (sold > 0) grantGain(ctx, supplier, TUNABLES.exportGainsBp.value, sold, surplus);
}

/** Raises a nation's capacity by bp x share / whole. */
function grantGain(ctx: TradeContext, id: NationId, bp: number, share: number, whole: number): void {
  const n = get(ctx, id);
  const gainE4 = mulDiv(mulDiv(n.private.capacityE4, bp, 10_000), share, whole);
  const capacityE4 = Math.min(CAPACITY_CEILING_E4, n.private.capacityE4 + gainE4);
  ctx.nations[id] = { ...n, private: { ...n.private, capacityE4 } };
  ctx.gainCbp.set(id, (ctx.gainCbp.get(id) ?? 0) + Math.floor((bp * 100 * share) / whole));
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

/**
 * What a nation's standing policy says about an offer it received (RULES
 * 3.4): 'accept', 'reject', or null to let it run to expiry. Accepting needs
 * the nation to be able to pay while keeping a month of demand of what it pays.
 */
export function policyAnswer(ctx: TradeContext, offer: TradeOffer): 'accept' | 'reject' | null {
  const receiver = get(ctx, offer.to);
  const policy = receiver.private.policy;
  if (policy.rejectAll) return 'reject';
  const pays = offer.get;
  const keep = pays.resource === 'credit' ? 0 : receiver.public[pays.resource].demand;
  const canPay = receiver.private.stocks[pays.resource] - pays.amount >= keep;
  if (!canPay) return null;
  const trust = receiver.private.trust[offer.from] ?? 0;
  if (policy.acceptTrusted && trust >= TUNABLES.autoAcceptTrustThreshold.value) return 'accept';
  if (policy.acceptFairDeficit && isFair(ctx.prices, offer.give, offer.get)) {
    const gets = offer.give.resource;
    if (gets !== 'credit') {
      const deficit = -structuralBalance(receiver, gets);
      if (deficit > 0 && receiver.private.stocks[gets] < deficit) return 'accept';
    }
  }
  return null;
}

/**
 * Standing policies answer every offer on its last answerable tick, and
 * background regions (which have nobody to wait for) answer every offer the
 * tick it arrives. Each receiver's cover priority is served first.
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
      const answer = policyAnswer(ctx, offer);
      if (answer === 'accept') acceptOffer(ctx, offer.id, 'policy');
      else if (answer === 'reject') rejectOffer(ctx, offer.id, 'policy');
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
