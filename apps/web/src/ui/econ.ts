import type { Command, Crisis, CrisisKind, ForeignNation, NationView, PoolKind, Resource, ResourceAmount, StandingPolicy, TradeOffer } from '@nations/contracts';

/**
 * Pure helpers that turn the player's View into numbers the screens show and
 * Commands they send. Reads only the View (seam 6); every rule number comes
 * from `view.rules`, the same tunables the sim uses.
 */

export type Good = 'food' | 'energy';
export const GOODS: readonly Good[] = ['food', 'energy'];
export const RESOURCES: readonly Resource[] = ['food', 'energy', 'credit'];
export const ICON: Readonly<Record<Resource, string>> = { food: '🌾', energy: '⚡', credit: '💰' };
export const LABEL: Readonly<Record<Resource, string>> = { food: 'Food', energy: 'Energy', credit: 'Credit' };

export function rule(view: NationView, id: string): number {
  return view.rules[id] ?? 0;
}

/** Whole numbers with thousands separators, for chips and sheets. */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function amountText(a: ResourceAmount): string {
  return `${fmt(a.amount)} ${a.resource}`;
}

/** Reference value in thousandths of a Credit. */
export function valueMilli(view: NationView, a: ResourceAmount): number {
  return view.prices[a.resource] * a.amount;
}

/** The sim's fair-price rule (RULES 3.2), from the maker's side. */
export function isFair(view: NationView, give: ResourceAmount, get: ResourceAmount): boolean {
  const band = rule(view, 'priceBandPct');
  const vGive = valueMilli(view, give);
  const vGet = valueMilli(view, get);
  return vGet * 100 <= vGive * (100 + band) && vGet * 100 >= vGive * (100 - band);
}

/** How much of `resource` is worth the same as `other` at reference prices (at least 1). */
export function fairAmount(view: NationView, other: ResourceAmount, resource: Resource): number {
  return Math.max(1, Math.round(valueMilli(view, other) / view.prices[resource]));
}

/** Price difference against reference, in whole percent, from the maker's side: + means the maker asks more. */
export function priceGapPct(view: NationView, give: ResourceAmount, get: ResourceAmount): number {
  const vGive = valueMilli(view, give);
  return vGive === 0 ? 0 : Math.round(((valueMilli(view, get) - vGive) * 100) / vGive);
}

/** Structural surplus (+) or deficit (-) per month. */
export function balance(n: Pick<ForeignNation, 'public'>, good: Good): number {
  return n.public[good].production - n.public[good].demand;
}

/** Next month for one good: what is in store, what arrives, what is needed, and the gap (+ = short). */
export function outlook(view: NationView, good: Good): { stock: number; production: number; demand: number; gap: number } {
  const stock = view.self.private.stocks[good];
  const { production, demand } = view.self.public[good];
  return { stock, production, demand, gap: demand - production - stock };
}

/** Last month's output as a percent of last month's baseline output: one month only, not the score. */
export function lastMonthPct(n: Pick<ForeignNation, 'public'>): number {
  return n.public.baselineOutput <= 0 ? 0 : Math.round((n.public.output * 1000) / n.public.baselineOutput) / 10;
}

/** The sim's score for one playable nation, from the View (RULES 5); undefined for a background region. */
export function scoreOf(view: NationView, id: string): { ownPct: number; finalScore: number } | undefined {
  const n = view.scores.nations.find((x) => x.id === id);
  return n === undefined ? undefined : { ownPct: Math.round(n.ownScoreBp / 10) / 10, finalScore: n.finalScore };
}

/** The shared world multiplier from the View, as a two-decimal string (RULES 5.2). */
export function multiplierText(view: NationView): string {
  return (view.scores.multiplierBp / 10_000).toFixed(2);
}

/** A proposed trade: what the player gives and what they ask for, to one partner. */
export interface TradeDraft {
  readonly to: string;
  readonly give: ResourceAmount;
  readonly get: ResourceAmount;
}

function partnersBusy(view: NationView): Set<string> {
  return new Set(view.offers.filter((o) => o.from === view.selfId).map((o) => o.to as string));
}

/**
 * Buy `amount` of a good for Credit from the nation with the largest surplus
 * that has no open offer from the player yet. Priced at reference, rounded so
 * it is fair.
 */
export function buyDraft(view: NationView, good: Good, amount: number): TradeDraft | null {
  const busy = partnersBusy(view);
  const seller = view.others
    .filter((o) => o.public.kind === 'playable' && balance(o, good) > 0 && !busy.has(o.id))
    .sort((a, b) => balance(b, good) - balance(a, good))[0];
  if (seller === undefined) return null;
  const get: ResourceAmount = { resource: good, amount: Math.max(1, Math.min(amount, balance(seller, good))) };
  return { to: seller.id, give: { resource: 'credit', amount: fairAmount(view, get, 'credit') }, get };
}

/** Sell up to `amount` of a spare good for Credit to the nation short of it by the most (regions included). */
export function sellDraft(view: NationView, good: Good, amount: number): TradeDraft | null {
  const busy = partnersBusy(view);
  const buyer = view.others
    .filter((o) => balance(o, good) < 0 && !busy.has(o.id))
    .sort((a, b) => balance(a, good) - balance(b, good))[0];
  if (buyer === undefined) return null;
  const give: ResourceAmount = { resource: good, amount: Math.max(1, Math.min(amount, -balance(buyer, good))) };
  return { to: buyer.id, give, get: { resource: 'credit', amount: fairAmount(view, give, 'credit') } };
}

/** Spare amount of a good the player can sell without going short next month, net of open offers. */
export function spare(view: NationView, good: Good): number {
  const promised = view.offers.filter((o) => o.from === view.selfId && o.give.resource === good).reduce((s, o) => s + o.give.amount, 0);
  const { stock, production, demand } = outlook(view, good);
  return Math.max(0, Math.min(stock, stock + production - demand) - promised);
}

/**
 * What the player's standing policy will do with an offer if they do not
 * answer (mirrors the sim's policyAnswer, RULES 3.4): it accepts or declines
 * on the offer's last month; nothing is left to lapse (Phase 2 prompt 09).
 */
export function policyWill(view: NationView, offer: TradeOffer): 'accept' | 'reject' {
  const policy: StandingPolicy = view.self.private.policy;
  if (policy.rejectAll) return 'reject';
  const pays = offer.get;
  const keep = pays.resource === 'credit' ? 0 : view.self.public[pays.resource].demand;
  if (view.self.private.stocks[pays.resource] - pays.amount < keep) return 'reject';
  const trust = view.self.private.trust[offer.from] ?? 0;
  if (policy.acceptTrusted && trust >= rule(view, 'autoAcceptTrustThreshold')) return 'accept';
  const gets = offer.give.resource;
  if (policy.acceptFairDeficit && isFair(view, offer.give, offer.get) && gets !== 'credit') {
    const deficit = -balance(view.self, gets);
    if (deficit > 0 && view.self.private.stocks[gets] < deficit) return 'accept';
  }
  return 'reject';
}

/** Command builders: the only things the interface ever sends. `tick` is stamped at send time. */
export const commands = {
  offer: (view: NationView, draft: TradeDraft) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'makeOffer',
    payload: { to: draft.to, give: draft.give, get: draft.get },
  }),
  counter: (view: NationView, offerId: number, draft: TradeDraft) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'counterOffer',
    payload: { offerId, give: draft.give, get: draft.get },
  }),
  answer: (view: NationView, type: 'acceptOffer' | 'rejectOffer' | 'withdrawOffer', offerId: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type,
    payload: { offerId },
  }),
  policy: (view: NationView, payload: Partial<StandingPolicy>) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'setPolicy',
    payload,
  }),
  contribute: (view: NationView, pool: PoolKind, amount: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'contribute',
    payload: { pool, amount },
  }),
  pledge: (view: NationView, pool: PoolKind, amount: number, deadlineTick: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'pledge',
    payload: { pool, amount, deadlineTick },
  }),
  declineAppeal: (view: NationView, crisisId: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'declineAppeal',
    payload: { crisisId },
  }),
  withdrawPledge: (view: NationView, pledgeId: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'withdrawPledge',
    payload: { pledgeId },
  }),
  fundResilience: (view: NationView, points: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'fundResilience',
    payload: { points },
  }),
};

/** A pool's name in plain words. */
export const POOL_NAME: Readonly<Record<PoolKind, string>> = { adaptation: 'climate adaptation', health: 'health' };
export const CRISIS_NAME: Readonly<Record<CrisisKind, string>> = { climate: 'Climate', pandemic: 'Pandemic' };

/** How much of its target a crisis pool holds now, whole percent. */
export function fundedPct(view: NationView, crisis: Crisis): number {
  const pool = view.crises.pools.find((p) => p.kind === crisis.pool);
  return crisis.target <= 0 || pool === undefined ? 100 : Math.floor((pool.balance * 100) / crisis.target);
}

/** What the player still owes of their share of an open crisis: share less what they paid into its pool this round (the sim's rule). */
export function owedShare(view: NationView, crisis: Crisis): { share: number; paid: number; owed: number } {
  const share = crisis.shares[view.selfId] ?? 0;
  const paid = view.crises.pools.find((p) => p.kind === crisis.pool)?.round[view.selfId] ?? 0;
  return { share, paid, owed: Math.max(0, share - paid) };
}

/** One row of the final table: every playable nation's result against its own baseline. */
export interface Standing {
  readonly id: string;
  readonly name: string;
  /** ownScore as a percent: smoothed output over smoothed baseline (RULES 5.1). */
  readonly vsBaselinePct: number;
  readonly score: number;
}

/**
 * Final standings, read straight from the sim's scoreboard in the View: the
 * interface never recomputes a score, so the table ranks exactly as the sim does.
 */
export function standings(view: NationView): Standing[] {
  const names = new Map<string, string>([[view.selfId as string, view.self.name], ...view.others.map((o) => [o.id as string, o.name] as [string, string])]);
  return view.scores.nations
    .map((n) => ({ id: n.id as string, name: names.get(n.id) ?? n.id, vsBaselinePct: Math.round(n.ownScoreBp / 10) / 10, score: n.finalScore }))
    // Stable sort on the score alone: a tie keeps the sim's nation order, as the scoreboard does.
    .sort((a, b) => b.score - a.score);
}

/** One sentence on what a baseline is (RULES 2.8, 5.1), for your own nation or another. */
export function baselineNote(own: boolean): string {
  return own
    ? 'Your baseline is the growth the IMF projects for you, less the shortfall your geography makes normal: in a world short of food and energy, a big importer is expected to go a little short.'
    : 'A baseline is the growth the IMF projects for a nation, less the shortfall its geography makes normal in a world short of food and energy.';
}

/** One sentence on the world multiplier, with its range from the rules (RULES 5.2). */
export function multiplierNote(view: NationView): string {
  const lo = (rule(view, 'collectiveFloorBp') / 10_000).toFixed(2);
  const hi = (rule(view, 'collectiveCeilingBp') / 10_000).toFixed(2);
  return `How well the world did together: nations at their baseline and food and energy demand met. It multiplies every score the same way, from ${lo} to ${hi}.`;
}
