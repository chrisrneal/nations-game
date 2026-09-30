import type {
  Build,
  Flow,
  HomeCapacity,
  HomeGood,
  InvestGoodView,
  InvestView,
  NationEndowment,
  NationPrivate,
  NationRecord,
} from '@nations/contracts';
import { mulDiv, potentialOutput } from './economy.ts';
import { TUNABLES } from './tunables.ts';

/**
 * Home investment: docs/RULES.md section 2.9.
 *
 * A nation spends Credit to build its own Food or Energy production. Capacity
 * is a level in basis points of the good's demand (100 = one point = 1%),
 * bought at a price that rises with every point already committed, capped by
 * a ceiling, and online only after a lag. Integers throughout (S5).
 */

export const HOME_GOODS: readonly HomeGood[] = ['food', 'energy'];

/** Numeric safety limit on one order's size in basis points, so a hostile command cannot overflow the cost. Not balance. */
export const MAX_INVEST_ORDER_BP = 1_000_000;

/** Upper end of the standing investment share: 30% of income. A safety range, not balance. */
export const MAX_INVEST_SHARE_BP = 3_000;

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/** The ceiling on committed capacity in one good, in basis points. */
export function maxCommittedBp(): number {
  return TUNABLES.investMaxPct.value * 100;
}

/** Credit for the first point, from the nation's potential output (RULES 2.9). */
export function investBase(potential: number): number {
  return Math.max(1, mulDiv(Math.max(0, potential), TUNABLES.investCostBp.value, 10_000));
}

/** Credit for one whole point in price band `band`, the band being the whole points already committed. */
export function pointPrice(base: number, band: number): number {
  return Math.max(1, mulDiv(base, 100 + TUNABLES.investEscalationPct.value * band, 100));
}

/**
 * Cost of `addBp` more capacity when `committedBp` is already committed: each
 * band's share at that band's price, a part-band pro rata, rounded up.
 */
export function investCost(base: number, committedBp: number, addBp: number): number {
  let cost = 0;
  let at = committedBp;
  let left = addBp;
  while (left > 0) {
    const inBand = Math.min(left, 100 - (at % 100));
    cost += ceilDiv(inBand * pointPrice(base, Math.floor(at / 100)), 100);
    at += inBand;
    left -= inBand;
  }
  return cost;
}

/** The most capacity (at most `maxBp`) that `credit` buys from `committedBp`, and what it costs. */
export function investBuy(base: number, committedBp: number, credit: number, maxBp: number): { readonly bp: number; readonly cost: number } {
  let bp = 0;
  let cost = 0;
  let at = committedBp;
  while (bp < maxBp) {
    const price = pointPrice(base, Math.floor(at / 100));
    const bandLeft = 100 - (at % 100);
    // The most basis points of this band that the Credit left pays for, rounding the cost up as investCost does.
    let inBand = Math.min(maxBp - bp, bandLeft, Math.floor(((credit - cost) * 100) / price));
    while (inBand > 0 && ceilDiv(inBand * price, 100) > credit - cost) inBand--;
    if (inBand <= 0) break;
    cost += ceilDiv(inBand * price, 100);
    bp += inBand;
    at += inBand;
  }
  return { bp, cost };
}

export function pendingBpOf(priv: Pick<NationPrivate, 'builds'>, good: HomeGood): number {
  let total = 0;
  for (const b of priv.builds) if (b.good === good) total += b.bp;
  return total;
}

export function committedBpOf(priv: Pick<NationPrivate, 'home' | 'builds'>, good: HomeGood): number {
  return priv.home[good] + pendingBpOf(priv, good);
}

/** Units a level of home capacity adds to a month's production. */
export function homeUnits(demand: number, homeBp: number): number {
  return mulDiv(Math.max(0, demand), Math.max(0, homeBp), 10_000);
}

/** What is still missing at home in basis points of demand, once pending capacity lands (RULES 2.9). */
export function gapBpOf(flow: Flow, pendingBp: number): number {
  if (flow.demand <= 0) return 0;
  const short = flow.demand - flow.production - homeUnits(flow.demand, pendingBp);
  return short <= 0 ? 0 : Math.floor((short * 10_000) / flow.demand);
}

/**
 * Output a nation gives up every month to run its home capacity (RULES 2.9):
 * `investUpkeepBpPer10` for every 10 points online, in basis points of output.
 */
export function upkeepBpOf(home: HomeCapacity): number {
  return Math.min(10_000, Math.floor(((home.food + home.energy) * TUNABLES.investUpkeepBpPer10.value) / 1_000));
}

/** Credit for the first point of this nation, from its own potential output. */
export function baseCostFor(nation: Pick<NationRecord, 'private'>, e: Pick<NationEndowment, 'mineralsRefining'>): number {
  return investBase(potentialOutput(e, nation.private.capacityE4));
}

/** The nation's quote for building each good: what a card, a dial or the AI reads (seam 6). */
export function investView(nation: NationRecord, e: NationEndowment): InvestView {
  const base = baseCostFor(nation, e);
  const good = (g: HomeGood): InvestGoodView => {
    const committed = committedBpOf(nation.private, g);
    const pending = pendingBpOf(nation.private, g);
    return {
      onlineBp: nation.private.home[g],
      pendingBp: pending,
      gapBp: gapBpOf(nation.public[g], pending),
      roomBp: Math.max(0, maxCommittedBp() - committed),
      nextPointCost: pointPrice(base, Math.floor(committed / 100)),
    };
  };
  return {
    lagTicks: TUNABLES.investLagTicks.value,
    maxBp: maxCommittedBp(),
    potentialOutput: potentialOutput(e, nation.private.capacityE4),
    basePointCost: base,
    upkeepBp: upkeepBpOf(nation.private.home),
    food: good('food'),
    energy: good('energy'),
  };
}

/** Why an order of `bp` in `good` cannot be placed now, or null. Shared by the command and its validation. */
export function orderProblem(nation: NationRecord, e: NationEndowment, good: HomeGood, bp: number): string | null {
  if (nation.public.kind === 'aggregate') return 'background regions invest through their standing policy only';
  if (committedBpOf(nation.private, good) + bp > maxCommittedBp()) return `above the home-capacity ceiling of ${TUNABLES.investMaxPct.value} points`;
  const cost = investCost(baseCostFor(nation, e), committedBpOf(nation.private, good), bp);
  if (nation.private.stocks.credit < cost) return 'not enough credit';
  return null;
}

/** Puts an order in the queue and takes its cost from the treasury. Validation has already passed. */
export function placeOrder(nation: NationRecord, good: HomeGood, bp: number, cost: number, readyTick: number): NationRecord {
  const builds: readonly Build[] = [...nation.private.builds, { good, bp, readyTick }];
  return {
    ...nation,
    private: {
      ...nation.private,
      builds,
      stocks: { ...nation.private.stocks, credit: nation.private.stocks.credit - cost },
    },
  };
}

/**
 * The standing rule (RULES 2.9): `investBp` of this month's income, never more
 * than the treasury, goes to the good with the larger remaining gap (ties to
 * the cover-priority good), never above that gap or the ceiling. What it cannot
 * use stays in the treasury.
 */
export function standingInvestment(
  nation: NationRecord,
  e: NationEndowment,
  income: number,
  tick: number,
): { readonly nation: NationRecord; readonly spent: number } {
  const policy = nation.private.policy;
  let budget = Math.min(nation.private.stocks.credit, mulDiv(Math.max(0, income), policy.investBp, 10_000));
  if (budget <= 0) return { nation, spent: 0 };
  const base = baseCostFor(nation, e);
  const gaps = HOME_GOODS.map((g) => ({ good: g, gap: gapBpOf(nation.public[g], pendingBpOf(nation.private, g)) }));
  gaps.sort((a, b) => b.gap - a.gap || Number(b.good === policy.coverPriority) - Number(a.good === policy.coverPriority));
  let current = nation;
  let spent = 0;
  for (const { good, gap } of gaps) {
    if (gap <= 0 || budget <= 0) continue;
    const committed = committedBpOf(current.private, good);
    const room = Math.max(0, maxCommittedBp() - committed);
    const bought = investBuy(base, committed, budget, Math.min(gap, room));
    if (bought.bp <= 0) continue;
    current = placeOrder(current, good, bought.bp, bought.cost, tick + TUNABLES.investLagTicks.value);
    budget -= bought.cost;
    spent += bought.cost;
  }
  return { nation: current, spent };
}

/** Moves every build ready by `tick` into online capacity. */
export function arriveBuilds(priv: NationPrivate, tick: number): { readonly home: HomeCapacity; readonly builds: readonly Build[] } {
  let food = priv.home.food;
  let energy = priv.home.energy;
  const waiting: Build[] = [];
  for (const b of priv.builds) {
    if (b.readyTick > tick) waiting.push(b);
    else if (b.good === 'food') food += b.bp;
    else energy += b.bp;
  }
  return { home: { food, energy }, builds: waiting };
}
