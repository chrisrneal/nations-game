import type { HomeGood, NationView } from '@nations/contracts';
import { GOODS, clamp, rule, type Good } from './util.ts';

/**
 * Home investment, as the AI decides it (docs/RULES.md section 7.5).
 *
 * Reads the View alone: its own quote (`view.invest`), its own reports and the
 * public rules. Nothing here writes State or reads a baseline. Every order it
 * returns carries the numbers behind it, for the command's `why` (RULES 7.4).
 * Integers throughout (S5).
 *
 * The price arithmetic below is the sim's (`packages/sim/src/invest.ts`), which
 * the AI may not import; packages/harness/src/invest-parity.test.ts fails if the
 * two ever disagree.
 */

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);
const mulDiv = (a: number, b: number, c: number): number => Math.floor(a / c) * b + Math.floor(((a % c) * b) / c);

/** Credit for one whole point in band `band` (the whole points already committed). */
export function pointPrice(base: number, band: number, escalationPct: number): number {
  return Math.max(1, mulDiv(base, 100 + escalationPct * band, 100));
}

/** Cost of `addBp` more capacity from `committedBp`. */
export function costOf(base: number, committedBp: number, addBp: number, escalationPct: number): number {
  let cost = 0;
  let at = committedBp;
  let left = addBp;
  while (left > 0) {
    const inBand = Math.min(left, 100 - (at % 100));
    cost += ceilDiv(inBand * pointPrice(base, Math.floor(at / 100), escalationPct), 100);
    at += inBand;
    left -= inBand;
  }
  return cost;
}

/** The most capacity (at most `maxBp`) that `credit` buys from `committedBp`, and what it costs. */
export function buyWith(base: number, committedBp: number, credit: number, maxBp: number, escalationPct: number): { readonly bp: number; readonly cost: number } {
  let bp = 0;
  let cost = 0;
  let at = committedBp;
  while (bp < maxBp) {
    const price = pointPrice(base, Math.floor(at / 100), escalationPct);
    const inBand = Math.min(maxBp - bp, 100 - (at % 100), Math.floor(((credit - cost) * 100) / price));
    if (inBand <= 0) break;
    cost += ceilDiv(inBand * price, 100);
    bp += inBand;
    at += inBand;
  }
  return { bp, cost };
}

/** What an AI nation remembers about the shortage it has suffered, in basis points of demand. */
export interface InvestMemory {
  seen: Record<Good, number | null>;
  /** The last tick observed, so observing twice in a tick counts once. */
  at: number;
}

export function emptyInvestMemory(): InvestMemory {
  return { seen: { food: null, energy: null }, at: -1 };
}

/**
 * Folds the last month's shortage into a running average (RULES 7.5): first
 * seen at the gap times what it expects trade not to cover, then
 * `seen += (unmet / demand - seen) / aiInvestSmoothTicks`, truncating.
 */
export function observeShortage(memory: InvestMemory, view: NationView): void {
  if (memory.at >= view.tick) return;
  memory.at = view.tick;
  const smooth = Math.max(1, rule(view, 'aiInvestSmoothTicks'));
  const prior = 100 - rule(view, 'aiInvestCoverPriorPct');
  const last = view.self.private.last;
  for (const good of GOODS) {
    const flow = view.self.public[good];
    if (flow.demand <= 0) {
      memory.seen[good] = 0;
      continue;
    }
    const current = memory.seen[good];
    if (current === null) {
      memory.seen[good] = Math.floor((view.invest[good].gapBp * prior) / 100);
      continue;
    }
    const unmet = good === 'food' ? last.unmetFood : last.unmetEnergy;
    const observed = Math.floor((unmet * 10_000) / flow.demand);
    memory.seen[good] = current + Math.trunc((observed - current) / smooth);
  }
}

/** Credit an AI may spend on building: the treasury less what open offers promise and less its reserve. */
export function spareCredit(view: NationView, promisedCredit: number): number {
  const reserve = rule(view, 'aiInvestReserveTicks') * view.self.private.last.income;
  return Math.max(0, view.self.private.stocks.credit - promisedCredit - reserve);
}

export interface InvestOrder {
  readonly good: HomeGood;
  readonly bp: number;
  readonly cost: number;
  /** One short sentence, lower case, starting with the verb. */
  readonly text: string;
  /** Up to three reasons, each carrying a number. */
  readonly reasons: readonly string[];
}

/** What trade is worth to a nation, read from its View (RULES 7.5, prompt 17b). Prices in thousandths of a Credit. */
export interface TradeTerms {
  /** What a month of trade can clear: the surplus it can sell plus its fair share of each deficit. */
  readonly clearable: number;
  /** Value of the surplus it can sell. */
  readonly surplusValue: number;
  /** Units of each good it buys now: the deficit less what it grows itself and what it still goes short of. */
  readonly bought: Readonly<Record<Good, number>>;
  /** Reference price of each good. */
  readonly price: Readonly<Record<Good, number>>;
  /** The share of each deficit the world can cover (RULES 2.8), in basis points, as this nation reads it. */
  readonly cover: Readonly<Record<Good, number>>;
}

/**
 * The trade a nation does, worked out from its View alone (RULES 7.5).
 *
 * Every nation's public flow includes its home capacity (RULES 2.9), and the
 * AI cannot see the capacity of the others, only its own. The world cover
 * therefore counts the others' flows as they are shown: an approximation that
 * slightly overstates other builders' surpluses. Its own flow is taken bare
 * (less its online home units), as the sim does.
 */
export function tradeTerms(view: NationView, memory: InvestMemory): TradeTerms {
  const coverShare = rule(view, 'structuralCoverSharePct');
  const bought: Record<Good, number> = { food: 0, energy: 0 };
  const price: Record<Good, number> = { food: view.prices.food, energy: view.prices.energy };
  const coverBp: Record<Good, number> = { food: 0, energy: 0 };
  let surplusValue = 0;
  let fairValue = 0;
  for (const g of GOODS) {
    const flow = view.self.public[g];
    const homeUnits = Math.floor((flow.demand * view.invest[g].onlineBp) / 10_000);
    const barePro = flow.production - homeUnits;
    let surplus = 0;
    let deficit = 0;
    const add = (balance: number): void => {
      if (balance > 0) surplus += balance;
      else deficit -= balance;
    };
    add(barePro - flow.demand);
    for (const o of view.others) add(o.public[g].production - o.public[g].demand);
    const cover = deficit <= 0 ? 10_000 : Math.min(10_000, Math.floor((mulDiv(surplus, coverShare, 100) * 10_000) / deficit));
    coverBp[g] = cover;
    const own = barePro - flow.demand;
    const ownDeficit = Math.max(0, -own);
    const fair = mulDiv(ownDeficit, cover, 10_000);
    surplusValue += Math.max(0, own) * price[g];
    fairValue += fair * price[g];
    const grown = Math.floor(((memory.seen[g] ?? 0) * flow.demand) / 10_000);
    bought[g] = Math.max(0, ownDeficit - homeUnits - grown);
  }
  return { clearable: surplusValue + fairValue, surplusValue, bought, price, cover: coverBp };
}

/** The share of its imbalance a nation clears, in basis points, capped at 10,000, for the units it buys. */
export function tradeShareOf(terms: TradeTerms, bought: Readonly<Record<Good, number>>): number {
  if (terms.clearable <= 0) return 10_000;
  let value = terms.surplusValue;
  for (const g of GOODS) value += bought[g] * terms.price[g];
  return Math.min(10_000, Math.floor((value * 10_000) / terms.clearable));
}

/** `tradeShareOf`, from the View: `boughtAfter` defaults to what it buys now. */
export function tradeShare(view: NationView, memory: InvestMemory, boughtAfter?: Readonly<Record<Good, number>>): number {
  const t = tradeTerms(view, memory);
  return tradeShareOf(t, boughtAfter ?? t.bought);
}

/** A plan: which goods to close and how much of each shortage, with what it costs and returns. */
export interface InvestPlan {
  readonly needs: Readonly<Record<Good, number>>;
  readonly cost: number;
  /** Output recovered per month once every point is online, in Credit. */
  readonly monthlyGain: number;
  /** Months the capacity would be online before the game ends. */
  readonly months: number;
  readonly net: number;
  /** Points of shortage the plan spends clearing the shortfall cap's dead zone (RULES 7.5). */
  readonly deadPoints: number;
  /** Output the plan costs in trade gain it stops earning (RULES 7.5, prompt 17b), already taken off `net`. */
  readonly tradeGainGiven: number;
}

const fmtPts = (bp: number): string => (bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(1));

/**
 * The plan with the highest positive net return (RULES 7.5): each of none,
 * food, energy and both, at full, three quarters and half of the shortage still
 * worth building against. Null when nothing pays.
 */
export function planInvestment(view: NationView, memory: InvestMemory): InvestPlan | null {
  const inv = view.invest;
  const months = rule(view, 'gameLengthTicks') - view.tick - inv.lagTicks;
  if (months <= 0) return null;
  const perPct = rule(view, 'shortfallPenaltyBpPerPct');
  const upkeep = rule(view, 'investUpkeepBpPer10');
  const esc = rule(view, 'investEscalationPct');
  const capBp = rule(view, 'maxShortfallPenaltyPct') * 100;
  const payback = rule(view, 'aiInvestPaybackPct');
  const lossPct = clamp(rule(view, 'aiInvestTradeLossPct'), 0, 100);
  const gainCbp = rule(view, 'gainsFromTradeBp') * 100;
  const terms = lossPct > 0 ? tradeTerms(view, memory) : null;
  const shareNow = terms === null ? 10_000 : tradeShareOf(terms, terms.bought);
  const kOf = (g: Good): number => (terms === null ? 0 : Math.floor((terms.cover[g] * lossPct) / 100));
  const span = (months * (months + 1)) / 2;

  const seen = (g: Good): number => memory.seen[g] ?? 0;
  const eff = (g: Good): number => Math.max(0, seen(g) - inv[g].pendingBp);
  // Shortage worth building against: what it suffers, never more than the gap or the room left.
  const need = (g: Good): number => Math.min(inv[g].gapBp, eff(g), inv[g].roomBp);
  // Penalty it would pay on the shortage it sees, before the cap; above the cap the first points recover nothing.
  const rawBp = Math.floor(((eff('food') + eff('energy')) * perPct) / 100);
  const deadSum = rawBp > capBp ? Math.ceil(((rawBp - capBp) * 100) / perPct) : 0;

  const subsets: readonly (readonly Good[])[] = [['food'], ['energy'], ['food', 'energy']];
  let best: InvestPlan | null = null;
  for (const goods of subsets) {
    for (const scale of [100, 75, 50]) {
      // What it means to close, then what it must build to close it: each unit built takes k of a unit off what it buys (RULES 7.5, prompt 17b).
      const closes: Record<Good, number> = { food: 0, energy: 0 };
      for (const g of GOODS) if (goods.includes(g)) closes[g] = Math.floor((need(g) * scale) / 100);
      if (closes.food + closes.energy <= 0) continue;
      const needs: Record<Good, number> = { food: 0, energy: 0 };
      const closed: Record<Good, number> = { food: 0, energy: 0 };
      for (const g of GOODS) {
        if (closes[g] <= 0) continue;
        const k = kOf(g);
        needs[g] = Math.min(inv[g].roomBp, inv[g].gapBp, Math.ceil((closes[g] * 10_000) / (10_000 - k)));
        closed[g] = Math.min(closes[g], Math.floor((needs[g] * (10_000 - k)) / 10_000));
      }
      const built = needs.food + needs.energy;
      const sum = closed.food + closed.energy;
      if (built <= 0 || sum <= 0) continue;
      const cost = GOODS.reduce((c, g) => c + (needs[g] > 0 ? costOf(inv.basePointCost, inv.maxBp - inv[g].roomBp, needs[g], esc) : 0), 0);
      // Penalty recovered on the shortage closed, less the output the new capacity's upkeep takes every month (both in basis points of output).
      const recoveredBp = Math.floor((Math.max(0, sum - deadSum) * perPct) / 100);
      const upkeepBp = Math.floor((built * upkeep) / 1_000);
      const monthlyGain = Math.floor((inv.potentialOutput * (recoveredBp - upkeepBp)) / 10_000);
      let tradeGainGiven = 0;
      if (terms !== null) {
        const after: Record<Good, number> = { food: 0, energy: 0 };
        for (const g of GOODS) {
          const units = Math.floor((needs[g] * view.self.public[g].demand) / 10_000);
          after[g] = terms.bought[g] - Math.min(terms.bought[g], Math.floor((units * kOf(g)) / 10_000));
        }
        const lostCbp = Math.floor((gainCbp * (shareNow - tradeShareOf(terms, after))) / 10_000);
        tradeGainGiven = Math.floor((inv.potentialOutput * lostCbp * span) / 1_000_000);
      }
      const net = monthlyGain * months - tradeGainGiven - Math.floor((cost * payback) / 100);
      if (net > 0 && (best === null || net > best.net)) best = { needs, cost, monthlyGain, months, net, deadPoints: Math.min(sum, deadSum) / 100, tradeGainGiven };
    }
  }
  return best;
}

/**
 * This month's orders for a plan: spend up to `aiInvestSharePct` of spare
 * Credit, a chunk of at most one point at a time on whichever planned good has
 * the cheaper next point, never past what the plan still needs.
 */
export function ordersFor(view: NationView, plan: InvestPlan, memory: InvestMemory, spare: number): InvestOrder[] {
  const inv = view.invest;
  const esc = rule(view, 'investEscalationPct');
  let budget = Math.floor((spare * rule(view, 'aiInvestSharePct')) / 100);
  const committed: Record<Good, number> = { food: inv.maxBp - inv.food.roomBp, energy: inv.maxBp - inv.energy.roomBp };
  const left: Record<Good, number> = { ...plan.needs };
  const bought: Record<Good, { bp: number; cost: number }> = { food: { bp: 0, cost: 0 }, energy: { bp: 0, cost: 0 } };
  for (let guard = 0; guard < 400 && budget > 0; guard++) {
    const options = GOODS.filter((g) => left[g] > 0).sort((a, b) => pointPrice(inv.basePointCost, Math.floor(committed[a] / 100), esc) - pointPrice(inv.basePointCost, Math.floor(committed[b] / 100), esc) || (a < b ? -1 : 1));
    const good = options[0];
    if (good === undefined) break;
    const step = buyWith(inv.basePointCost, committed[good], budget, Math.min(left[good], 100 - (committed[good] % 100)), esc);
    if (step.bp <= 0) break;
    committed[good] += step.bp;
    left[good] -= step.bp;
    budget -= step.cost;
    bought[good].bp += step.bp;
    bought[good].cost += step.cost;
  }
  const orders: InvestOrder[] = [];
  const cover = rule(view, 'aiInvestReserveTicks');
  for (const good of GOODS) {
    const b = bought[good];
    if (b.bp <= 0) continue;
    const ready = view.tick + inv.lagTicks + 1;
    const seenPct = Math.floor((memory.seen[good] ?? 0) / 100);
    const planPts = fmtPts(plan.needs.food + plan.needs.energy);
    orders.push({
      good,
      bp: b.bp,
      cost: b.cost,
      text: `invest ${fmtPts(b.bp)} points of ${good} for ${b.cost} credit, online in month ${ready}`,
      reasons: [
        `short ${seenPct}% of ${good} demand lately, ${Math.floor(inv[good].gapBp / 100)}% still uncovered at home`,
        `plan: ${planPts} points for ${plan.cost} credit returns about ${plan.monthlyGain} a month for ${plan.months} months, less ${plan.tradeGainGiven} of trade gain given up`,
        `spending ${rule(view, 'aiInvestSharePct')}% of ${spare} spare credit, keeping ${cover} months of income back`,
      ],
    });
  }
  return orders;
}

/**
 * The harness's fixed-rate strategies (docs/balance/gate2-prompt17.md): each
 * month spend `ratePct`% of last month's income, out of the spare Credit it
 * has (a flat budget, like the dial), on home capacity: the good with the
 * larger gap, then the one with less committed. It has no plan, no memory and no
 * payback test, and it does not stop when a gap closes: it stops only at the
 * ceiling. That is what makes a rate a rate: too little leaves a shortage
 * standing, too much keeps building capacity nobody needs and pays its upkeep.
 */
export function investAtRate(view: NationView, ratePct: number, spare: number): InvestOrder[] {
  const inv = view.invest;
  const esc = rule(view, 'investEscalationPct');
  const income = view.self.private.last.income;
  let budget = Math.min(spare, Math.floor((income * clamp(ratePct, 0, 100)) / 100));
  if (budget <= 0) return [];
  const orders: InvestOrder[] = [];
  const committedOf = (g: Good): number => inv.maxBp - inv[g].roomBp;
  const ranked = GOODS.map((g) => ({ g, gap: inv[g].gapBp })).sort((a, b) => b.gap - a.gap || committedOf(a.g) - committedOf(b.g) || (a.g < b.g ? -1 : 1));
  for (const { g, gap } of ranked) {
    if (budget <= 0) continue;
    const bought = buyWith(inv.basePointCost, committedOf(g), budget, inv[g].roomBp, esc);
    if (bought.bp <= 0) continue;
    budget -= bought.cost;
    orders.push({
      good: g,
      bp: bought.bp,
      cost: bought.cost,
      text: `invest ${fmtPts(bought.bp)} points of ${g} for ${bought.cost} credit, online in month ${view.tick + inv.lagTicks + 1}`,
      reasons: [`fixed rate: ${ratePct}% of last month's ${income} income, ${spare} credit spare`, `${Math.floor(gap / 100)}% of ${g} demand is still uncovered at home, ${Math.floor(inv[g].roomBp / 100)} points of room left`],
    });
  }
  return orders;
}
