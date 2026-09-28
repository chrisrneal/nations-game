import type {
  Command,
  ForeignNation,
  NationId,
  NationView,
  Prices,
  Resource,
  ResourceAmount,
  TradeOffer,
} from '@nations/contracts';

/**
 * The greedy trader (Phase 1 AI). Reads only its View (seam 6), never State,
 * and swaps what it has spare for what it lacks:
 *
 * 1. Answer offers made to it: accept fair ones that cover a need or buy its
 *    surplus, reject the rest (rejecting is free; ignoring costs trust).
 * 2. Sell: offer spare food or energy to nations with a structural deficit,
 *    asking for their spare resource in a swap when they have one, else Credit.
 * 3. Buy: ask nations with a structural surplus for what it still lacks, for Credit.
 *
 * Every number it uses comes from `view.rules` (packages/sim/src/tunables.ts),
 * and every decision carries a numeric reason (RULES 7.4). Deterministic:
 * noise is a hash of (seed, tick, nation, partner), never Math.random (D5).
 */
export interface Decision {
  readonly commands: readonly Command[];
  /** One sentence per command, built from numbers only. */
  readonly reasons: readonly string[];
}

/** Knobs the balance harness's bots turn. The greedy trader uses the defaults. */
export interface TraderStyle {
  /** Offer spare food and energy to others. The hoarder sets this false. */
  readonly sells: boolean;
  /** Accept offers that ask it to pay food or energy. The hoarder sets this false. */
  readonly paysGoods: boolean;
  /** Percent added to the reference price when selling. Above the fair band is a hard bargain. */
  readonly markupPct: number;
  /** Offer the same spare amount to this many partners at once (above 1 over-commits). */
  readonly sellFanout: number;
}

export const GREEDY: TraderStyle = { sells: true, paysGoods: true, markupPct: 0, sellFanout: 1 };

const GOODS = ['food', 'energy'] as const;
type Good = (typeof GOODS)[number];

function mix(input: number): number {
  let z = input | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return z >>> 0;
}

function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function rule(view: NationView, id: string): number {
  const value = view.rules[id];
  if (value === undefined) throw new Error(`View has no rule "${id}"`);
  return value;
}

/** Reference value in thousandths of a Credit. */
function value(prices: Prices, a: ResourceAmount): number {
  return prices[a.resource] * a.amount;
}

function fair(view: NationView, give: ResourceAmount, get: ResourceAmount): boolean {
  const band = rule(view, 'priceBandPct');
  const vGive = value(view.prices, give);
  const vGet = value(view.prices, get);
  return vGet * 100 <= vGive * (100 + band) && vGet * 100 >= vGive * (100 - band);
}

/** Structural surplus (+) or deficit (-) per tick, from public data. */
function balance(n: Pick<ForeignNation, 'public'>, good: Good): number {
  return n.public[good].production - n.public[good].demand;
}

/** Credit asked or paid for `amount` of a good at reference price plus markup; at least 1. */
function creditFor(view: NationView, good: Good, amount: number, markupPct: number): number {
  return Math.max(1, Math.floor((amount * view.prices[good] * (100 + markupPct)) / 100_000));
}

/** The amount of `good` worth `other` at reference prices. */
function goodsFor(view: NationView, good: Good, other: ResourceAmount, markupPct: number): number {
  return Math.floor((value(view.prices, other) * 100) / ((100 + markupPct) * view.prices[good]));
}

export function greedyDecide(view: NationView, seed: number, style: TraderStyle = GREEDY): Decision {
  const self = view.self;
  if (self.public.kind === 'aggregate') return { commands: [], reasons: [] };
  const commands: Command[] = [];
  const reasons: string[] = [];
  const maxCommands = rule(view, 'maxCommandsPerNationPerTick');
  const buffer = rule(view, 'aiStockBufferTicks');
  const cap = rule(view, 'maxOpenOffersPerNation');
  const noiseBp = rule(view, 'aiNoiseBp');
  const push = (command: Command, reason: string): boolean => {
    if (commands.length >= maxCommands) return false;
    commands.push({ ...command, nationId: view.selfId, tick: view.tick });
    reasons.push(reason);
    return true;
  };

  const stocks = { ...self.private.stocks };
  const mine = view.offers.filter((o) => o.from === view.selfId);
  const incoming = view.offers.filter((o) => o.to === view.selfId);

  // What is still needed this tick, and what can be spared, net of my own open offers.
  const need = { food: 0, energy: 0 };
  const spare = { food: 0, energy: 0 };
  for (const good of GOODS) {
    const flow = self.public[good];
    const pendingIn = mine.filter((o) => o.get.resource === good).reduce((sum, o) => sum + o.get.amount, 0);
    const pendingOut = mine.filter((o) => o.give.resource === good).reduce((sum, o) => sum + o.give.amount, 0);
    need[good] = Math.max(0, flow.demand - flow.production - stocks[good] - pendingIn);
    spare[good] = Math.max(0, Math.min(stocks[good], stocks[good] + flow.production - flow.demand * buffer) - pendingOut);
  }
  const creditFree = (): number => stocks.credit - mine.filter((o) => o.give.resource === 'credit').reduce((s, o) => s + o.give.amount, 0);

  // 1. Answer offers made to me, my cover priority first.
  const priority = self.private.policy.coverPriority;
  const ordered = [...incoming].sort((a, b) => Number(b.give.resource === priority) - Number(a.give.resource === priority) || a.id - b.id);
  for (const offer of ordered) {
    const gets = offer.give;
    const pays = offer.get;
    const payable =
      pays.resource === 'credit'
        ? creditFree() >= pays.amount
        : style.paysGoods && spare[pays.resource as Good] >= pays.amount;
    const useful = gets.resource === 'credit' ? pays.resource !== 'credit' : need[gets.resource as Good] > 0;
    const acceptable = fair(view, offer.give, offer.get) || value(view.prices, gets) >= value(view.prices, pays);
    if (payable && useful && acceptable) {
      const reason =
        gets.resource === 'credit'
          ? `selling ${pays.amount} ${pays.resource} from a spare ${spare[pays.resource as Good]} for ${gets.amount} credit`
          : `my ${gets.resource} need is ${need[gets.resource as Good]} and this brings ${gets.amount}`;
      if (!push({ nationId: view.selfId, tick: view.tick, type: 'acceptOffer', payload: { offerId: offer.id } }, reason)) break;
      stocks[pays.resource] -= pays.amount;
      if (pays.resource !== 'credit') spare[pays.resource as Good] -= pays.amount;
      if (gets.resource !== 'credit') need[gets.resource as Good] = Math.max(0, need[gets.resource as Good] - gets.amount);
    } else {
      const why = !payable ? `cannot spare ${pays.amount} ${pays.resource}` : !useful ? `no need for ${gets.amount} ${gets.resource}` : `price is outside the ${rule(view, 'priceBandPct')}% band`;
      if (!push({ nationId: view.selfId, tick: view.tick, type: 'rejectOffer', payload: { offerId: offer.id } }, why)) break;
    }
  }

  let open = mine.length;
  const busy = new Set<NationId>(mine.map((o) => o.to));
  const jitter = (partner: NationId): number => mix(seed ^ hashText(view.selfId) ^ Math.imul(view.tick + 1, 0x9e3779b9) ^ hashText(partner)) % (noiseBp + 1);

  // 2. Sell spare goods to nations short of them.
  if (style.sells) {
    for (const good of GOODS) {
      if (spare[good] <= 0) continue;
      const buyers = view.others
        .filter((o) => balance(o, good) < 0 && !busy.has(o.id))
        .map((o) => ({ o, score: -balance(o, good) * (10_000 + jitter(o.id)) }))
        .sort((a, b) => b.score - a.score || (a.o.id < b.o.id ? -1 : 1));
      let fanout = 0;
      let left = spare[good];
      for (const { o } of buyers) {
        if (open >= cap || left <= 0 || fanout >= style.sellFanout * 3) break;
        const amount = Math.min(left, -balance(o, good));
        if (amount <= 0) continue;
        const other: Good = good === 'food' ? 'energy' : 'food';
        // Swap for their spare in my deficit when they have one (a region cannot pay in goods it lacks).
        const theirSpare = balance(o, other);
        let get: ResourceAmount;
        if (need[other] > 0 && theirSpare > 0) {
          get = { resource: other, amount: Math.max(1, Math.min(theirSpare, need[other], goodsFor(view, other, { resource: good, amount }, -style.markupPct))) };
        } else {
          get = { resource: 'credit', amount: creditFor(view, good, amount, style.markupPct) };
        }
        const give: ResourceAmount = { resource: good, amount: get.resource === 'credit' ? amount : Math.min(amount, Math.max(1, goodsFor(view, good, get, style.markupPct))) };
        if (!fair(view, give, get) && !self.private.policy.hardBargains) continue;
        const reason = `your ${good} deficit is ${-balance(o, good)} and my spare is ${spare[good]}`;
        if (!push({ nationId: view.selfId, tick: view.tick, type: 'makeOffer', payload: { to: o.id, give, get } }, reason)) break;
        open++;
        busy.add(o.id);
        fanout++;
        if (get.resource !== 'credit') need[get.resource as Good] = Math.max(0, need[get.resource as Good] - get.amount);
        // Over-committing sellers offer the same goods again; honest ones count them as promised.
        if (fanout % style.sellFanout === 0) left -= give.amount;
      }
    }
  }

  // 3. Buy what is still missing from nations with a structural surplus.
  for (const good of [priority, priority === 'food' ? 'energy' : 'food'] as Good[]) {
    if (need[good] <= 0) continue;
    const sellers = view.others
      .filter((o) => o.public.kind === 'playable' && balance(o, good) > 0 && !busy.has(o.id))
      .map((o) => ({ o, score: balance(o, good) * (10_000 + jitter(o.id)) }))
      .sort((a, b) => b.score - a.score || (a.o.id < b.o.id ? -1 : 1));
    for (const { o } of sellers) {
      if (open >= cap || need[good] <= 0) break;
      const amount = Math.min(need[good], balance(o, good));
      const pay = creditFor(view, good, amount, 0);
      if (creditFree() < pay) break;
      const give: ResourceAmount = { resource: 'credit', amount: pay };
      const get: ResourceAmount = { resource: good, amount };
      if (!fair(view, give, get)) continue;
      const reason = `my ${good} need is ${need[good]} and your surplus is ${balance(o, good)}`;
      if (!push({ nationId: view.selfId, tick: view.tick, type: 'makeOffer', payload: { to: o.id, give, get } }, reason)) break;
      stocks.credit -= pay;
      open++;
      busy.add(o.id);
      need[good] -= amount;
    }
  }

  return { commands, reasons };
}

/** Open offers this nation has made, for callers that want to inspect them. */
export function openOffersBy(view: NationView): readonly TradeOffer[] {
  return view.offers.filter((o) => o.from === view.selfId);
}

export type { Resource };
