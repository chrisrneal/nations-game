import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { NationId, NationView } from '@nations/contracts';
import { TUNABLES, createWorld, step, viewFor, type WorldState } from '@nations/sim';
import { buyWith, costOf, emptyInvestMemory, investAtRate, observeShortage, ordersFor, planInvestment, pointPrice, spareCredit, tradeShare, tradeShareOf, tradeTerms, type InvestMemory } from './invest.ts';
import { fullRoster, id } from './testkit.test.helpers.ts';

const roster = fullRoster();
const world = (): WorldState => createWorld({ seed: 4, roster });
/** The tests read the plan's logic, not the tuning: Credit is cheap to the AI (payback 10%) and capacity has no upkeep. */
const viewOf = (who: string, state: WorldState = world()): NationView => {
  const v = viewFor(state, id(who));
  return { ...v, rules: { ...v.rules, aiInvestPaybackPct: 10, investUpkeepBpPer10: 0 } };
};
const pct = (bp: number): number => Math.floor(bp / 100);

describe('what the AI has seen (RULES 7.5)', () => {
  it('starts from the gap times what it expects trade not to cover, then follows what it suffers', () => {
    const v = viewOf('egypt');
    const mem = emptyInvestMemory();
    observeShortage(mem, v);
    const prior = 100 - TUNABLES.aiInvestCoverPriorPct.value;
    expect(mem.seen.food).toBe(Math.floor((v.invest.food.gapBp * prior) / 100));
    expect(mem.seen.energy).toBe(Math.floor((v.invest.energy.gapBp * prior) / 100));

    // A month later Egypt actually went 50% short of food: the average moves a smoothing step towards it.
    const before = mem.seen.food!;
    const next = { ...v, tick: 1, self: { ...v.self, private: { ...v.self.private, last: { ...v.self.private.last, unmetFood: Math.floor(v.self.public.food.demand / 2) } } } };
    observeShortage(mem, next);
    const smooth = TUNABLES.aiInvestSmoothTicks.value;
    expect(mem.seen.food).toBe(before + Math.trunc((Math.floor((next.self.private.last.unmetFood * 10_000) / v.self.public.food.demand) - before) / smooth));
  });

  it('counts a tick once however often it is asked', () => {
    const v = viewOf('egypt');
    const mem = emptyInvestMemory();
    observeShortage(mem, v);
    const once = { ...mem.seen };
    observeShortage(mem, v);
    expect(mem.seen).toEqual(once);
  });
});

describe('the plan (RULES 7.5)', () => {
  const memoryFor = (v: NationView): ReturnType<typeof emptyInvestMemory> => {
    const m = emptyInvestMemory();
    observeShortage(m, v);
    return m;
  };

  it('plans nothing for a nation with nothing to close', () => {
    for (const who of ['australia', 'canada', 'united-states', 'russia']) {
      const v = viewOf(who);
      expect(planInvestment(v, memoryFor(v)), who).toBeNull();
    }
  });

  it('plans to build in the good a shortage-hit nation lacks, and prices it at the sim\'s cost', () => {
    const v = viewOf('egypt');
    const plan = planInvestment(v, memoryFor(v));
    expect(plan).not.toBeNull();
    expect(plan!.net).toBeGreaterThan(0);
    const esc = TUNABLES.investEscalationPct.value;
    let cost = 0;
    for (const g of ['food', 'energy'] as const) cost += plan!.needs[g] > 0 ? costOf(v.invest.basePointCost, 0, plan!.needs[g], esc) : 0;
    expect(plan!.cost).toBe(cost);
  });

  it('a deep importer only pays back if it clears the dead zone at the shortfall cap, so it plans both goods', () => {
    for (const who of ['japan', 'korea', 'turkiye']) {
      const dear = viewOf(who);
      // Points at half the price, so that the plan can pay back at all: the test is about what the plan contains, not about tuning.
      const v = { ...dear, invest: { ...dear.invest, basePointCost: Math.floor(dear.invest.basePointCost / 2) } };
      const plan = planInvestment(v, memoryFor(v));
      expect(plan, who).not.toBeNull();
      expect(plan!.needs.food, who).toBeGreaterThan(0);
      expect(plan!.needs.energy, who).toBeGreaterThan(0);
      // Japan and Korea see a shortage that already pushes the penalty past the cap (Turkiye's, at the prior, sits just under it).
      if (who !== 'turkiye') expect(plan!.deadPoints, who).toBeGreaterThan(0);
    }
  });

  it('stops planning once too little of the game is left for the capacity to pay', () => {
    const v = viewOf('germany');
    const mem = memoryFor(v);
    expect(planInvestment(v, mem)).not.toBeNull();
    const late = { ...v, tick: v.rules.gameLengthTicks! - v.invest.lagTicks };
    expect(planInvestment(late, mem)).toBeNull();
  });

  it('a stricter payback test only ever shrinks the plan', () => {
    const v = viewOf('mexico');
    const mem = memoryFor(v);
    const easy = planInvestment(v, mem);
    const hard = planInvestment({ ...v, rules: { ...v.rules, aiInvestPaybackPct: 200 } }, mem);
    expect(easy).not.toBeNull();
    if (hard !== null) expect(hard.cost).toBeLessThanOrEqual(easy!.cost);
  });
});

describe('the trade gain a builder gives up (RULES 7.5, prompt 17b)', () => {
  const withLoss = (v: NationView, lossPct: number): NationView => ({ ...v, rules: { ...v.rules, aiInvestTradeLossPct: lossPct } });
  const memoryFor = (v: NationView): InvestMemory => {
    const m = emptyInvestMemory();
    observeShortage(m, v);
    return m;
  };
  const seenOf = (food: number, energy: number): InvestMemory => ({ seen: { food, energy }, at: 0 });

  it('at loss 0 the plan is exactly prompt 17\'s: no trade term, net is monthly gain less cost', () => {
    // Nets, costs and gains pinned from prompt 17's planner (git 5fb24a3) at this seed.
    const pinned: Record<string, [number, number]> = { china: [22151, 29021], japan: [11372, 10320], korea: [5738, 5298], egypt: [2319, 2904], germany: [4739, 5398] };
    for (const [who, [cost, net]] of Object.entries(pinned)) {
      const v = withLoss(viewOf(who), 0);
      const plan = planInvestment(v, memoryFor(v))!;
      expect(plan.tradeGainGiven, who).toBe(0);
      expect(plan.cost, who).toBe(cost);
      expect(plan.net, who).toBe(net);
      expect(plan.net, who).toBe(plan.monthlyGain * plan.months - Math.floor((plan.cost * 10) / 100));
    }
  });

  it('a deep importer that stays above its fair share gives up nothing, but must build 1/(1-k) points per point of shortage it closes', () => {
    for (const who of ['japan', 'korea', 'saudi-arabia']) {
      const v = viewOf(who);
      for (const seen of [100, 300, 1000]) {
        const mem = seenOf(seen, seen);
        const t = tradeTerms(v, mem);
        expect(tradeShareOf(t, t.bought), who).toBe(10_000);
        const off = planInvestment(withLoss(v, 0), mem)!;
        const on = planInvestment(withLoss(v, 100), mem);
        expect(on, who).not.toBeNull();
        expect(on!.tradeGainGiven, who).toBe(0);
        for (const g of ['food', 'energy'] as const) {
          if (off.needs[g] === 0) continue;
          const k = t.cover[g];
          expect(on!.needs[g], `${who} ${g}`).toBe(Math.min(v.invest[g].roomBp, v.invest[g].gapBp, Math.ceil((off.needs[g] * 10_000) / (10_000 - k))));
          expect(on!.needs[g], who).toBeGreaterThanOrEqual(off.needs[g]);
        }
      }
    }
  });

  it('a nation at its fair share that builds its whole deficit gives up about its whole monthly trade gain', () => {
    // A nation that buys exactly its fair share, and a world that covers it fully (k = 100%): every unit built is a unit not bought.
    const terms = { clearable: 10_000, surplusValue: 0, bought: { food: 100, energy: 0 }, price: { food: 100, energy: 100 }, cover: { food: 10_000, energy: 10_000 } };
    expect(tradeShareOf(terms, terms.bought)).toBe(10_000);
    expect(tradeShareOf(terms, { food: 0, energy: 0 })).toBe(0);
    // Half built: half the share.
    expect(tradeShareOf(terms, { food: 50, energy: 0 })).toBe(5_000);
  });

  it('China builds less than prompt 17 did, from the fresh world and mid-game with a small shortage seen', () => {
    const v = viewOf('china');
    const fresh = memoryFor(v);
    const small = seenOf(300, 600);
    for (const mem of [fresh, small]) {
      const free = planInvestment(withLoss(v, 0), mem)!;
      const priced = planInvestment(withLoss(v, 100), mem);
      expect(free).not.toBeNull();
      if (priced !== null) {
        expect(priced.net).toBeLessThan(free.net);
        // Closed shortage is what benefit counts: less than the plan built.
        expect(priced.monthlyGain).toBeLessThanOrEqual(free.monthlyGain);
      }
    }
    // With a small shortage the plan is null or smaller than prompt 17's in closed terms.
    const freeSmall = planInvestment(withLoss(v, 0), small)!;
    const pricedSmall = planInvestment(withLoss(v, 100), small);
    expect(pricedSmall === null || pricedSmall.net < freeSmall.net).toBe(true);
  });

  it('the trade gain given up is non-decreasing in the points built', () => {
    const v = withLoss(viewOf('china'), 100);
    const mem = memoryFor(v);
    let last = -1;
    for (const pts of [0, 200, 500, 1000, 1500, 2250]) {
      // Units the plan builds come off what it buys (loss 100%): recompute the share as the plan does.
      const t = tradeTerms(v, mem);
      const built = Math.floor((pts * v.self.public.energy.demand) / 10_000);
      const given = t.bought.food * t.price.food + Math.max(0, t.bought.energy - built) * t.price.energy;
      expect(tradeShareOf(t, { food: t.bought.food, energy: Math.max(0, t.bought.energy - built) })).toBe(Math.min(10_000, Math.floor((given * 10_000) / t.clearable)));
      const lost = 10_000 - tradeShareOf(t, { food: t.bought.food, energy: Math.max(0, t.bought.energy - built) });
      expect(lost).toBeGreaterThanOrEqual(last);
      last = lost;
    }
  });

  it('the share helper is capped at 100% and is 100% whenever it buys its fair share', () => {
    for (const who of ['china', 'japan', 'germany', 'saudi-arabia', 'australia']) {
      const v = viewOf(who);
      const mem = memoryFor(v);
      const t = tradeTerms(v, mem);
      expect(tradeShare(v, mem)).toBeLessThanOrEqual(10_000);
      // Buying ten times as much as it does is still 100%.
      expect(tradeShareOf(t, { food: t.bought.food * 10 + 1_000_000, energy: t.bought.energy * 10 + 1_000_000 })).toBe(10_000);
      // Buying nothing clears only what it sells.
      const none = tradeShareOf(t, { food: 0, energy: 0 });
      expect(none).toBeLessThanOrEqual(tradeShareOf(t, t.bought));
    }
    // Purchases at its fair share clear everything.
    const v = viewOf('china');
    const t = tradeTerms(v, seenOf(0, 0));
    expect(tradeShareOf(t, t.bought)).toBe(10_000);
    expect(tradeShareOf(t, { food: 0, energy: 0 })).toBeLessThan(10_000);
  });

  it('lists the trade gain given up in an order reason, with a number', () => {
    const v = viewOf('china');
    const mem = memoryFor(v);
    const plan = planInvestment(v, mem);
    expect(plan).not.toBeNull();
    const orders = ordersFor(v, plan!, mem, 1_000_000);
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) {
      expect(o.reasons.some((r) => r.includes('trade gain given up'))).toBe(true);
      for (const r of o.reasons) expect(/\d/.test(r), r).toBe(true);
    }
  });

  it('property: pricing trade never raises the net and never builds past the room or the gap', () => {
    const nations = ['china', 'japan', 'korea', 'egypt', 'germany', 'india', 'mexico', 'turkiye', 'saudi-arabia', 'brazil'];
    fc.assert(
      fc.property(fc.constantFrom(...nations), fc.integer({ min: 0, max: 9_000 }), fc.integer({ min: 0, max: 9_000 }), fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (who, food, energy, tick, a, b) => {
        const v = { ...viewOf(who), tick };
        const mem = seenOf(food, energy);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const low = planInvestment(withLoss(v, lo), mem);
        const high = planInvestment(withLoss(v, hi), mem);
        if (high !== null) {
          expect(low).not.toBeNull();
          expect(high.net).toBeLessThanOrEqual(low!.net);
          expect(high.tradeGainGiven).toBeGreaterThanOrEqual(0);
        }
        if (high !== null) for (const g of ['food', 'energy'] as const) expect(high.needs[g]).toBeLessThanOrEqual(Math.min(v.invest[g].roomBp, v.invest[g].gapBp));
      }),
      { numRuns: 300 },
    );
  });
});

describe('this month\'s orders', () => {
  const setup = (who: string) => {
    const v = viewOf(who);
    const mem = emptyInvestMemory();
    observeShortage(mem, v);
    return { v, mem, plan: planInvestment(v, mem)! };
  };

  it('spends at most aiInvestSharePct of the spare Credit, never past the plan, with a number in every reason', () => {
    const { v, mem, plan } = setup('germany');
    const spare = 20_000;
    const orders = ordersFor(v, plan, mem, spare);
    expect(orders.length).toBeGreaterThan(0);
    const spent = orders.reduce((s, o) => s + o.cost, 0);
    expect(spent).toBeLessThanOrEqual(Math.floor((spare * TUNABLES.aiInvestSharePct.value) / 100));
    for (const o of orders) {
      expect(o.bp).toBeLessThanOrEqual(plan.needs[o.good]);
      expect(o.cost).toBe(costOf(v.invest.basePointCost, 0, o.bp, TUNABLES.investEscalationPct.value));
      expect(/\d/.test(o.text)).toBe(true);
      expect(o.reasons.length).toBeGreaterThan(0);
      for (const r of o.reasons) expect(/\d/.test(r), r).toBe(true);
    }
  });

  it('spends nothing with nothing spare', () => {
    const { v, mem, plan } = setup('germany');
    expect(ordersFor(v, plan, mem, 0)).toEqual([]);
  });

  it('spare Credit is the treasury less what open offers promise and less the reserve', () => {
    const v = viewOf('germany');
    const income = 500;
    const withIncome = { ...v, self: { ...v.self, private: { ...v.self.private, last: { ...v.self.private.last, income }, stocks: { ...v.self.private.stocks, credit: 10_000 } } } };
    expect(spareCredit(withIncome, 1_000)).toBe(10_000 - 1_000 - TUNABLES.aiInvestReserveTicks.value * income);
    expect(spareCredit(withIncome, 50_000)).toBe(0);
  });
});

describe('the fixed-rate strategies', () => {
  /** A View a month in, so there is an income to take a share of. */
  const inMonth = (who: string): NationView => {
    const v = viewOf(who);
    return { ...v, self: { ...v.self, private: { ...v.self.private, last: { ...v.self.private.last, income: v.self.public.output } } } };
  };

  it('spend nothing at 0%, a share of last month\'s income at higher rates, on the larger gap first', () => {
    const v = inMonth('germany');
    expect(investAtRate(v, 0, 50_000)).toEqual([]);
    const low = investAtRate(v, 10, 50_000).reduce((s, o) => s + o.cost, 0);
    const mid = investAtRate(v, 25, 50_000).reduce((s, o) => s + o.cost, 0);
    expect(mid).toBeGreaterThan(low);
    expect(low).toBeLessThanOrEqual(Math.floor(v.self.public.output / 10));
    expect(investAtRate(v, 100, 3)[0]!.cost).toBeLessThanOrEqual(3);
    const all = investAtRate(v, 100, 50_000_000);
    expect(all[0]!.good).toBe(v.invest.energy.gapBp >= v.invest.food.gapBp ? 'energy' : 'food');
    for (const o of all) for (const r of o.reasons) expect(/\d/.test(r)).toBe(true);
  });

  it('do not stop when a gap closes: they build to the ceiling in both goods, and no further', () => {
    // Australia has no gap in either good; a flat rate still builds, which is why too high a rate costs (upkeep) and 0 is best for it.
    const v = inMonth('australia');
    // Give it an income big enough to fill both goods.
    const rich = { ...v, self: { ...v.self, private: { ...v.self.private, last: { ...v.self.private.last, income: 100_000_000 } } } };
    const orders = investAtRate(rich, 100, 500_000_000);
    expect(orders.map((o) => o.good).sort()).toEqual(['energy', 'food']);
    for (const o of orders) expect(o.bp).toBe(v.invest[o.good].roomBp);
    // A nation with nothing spare builds nothing.
    expect(investAtRate(v, 100, 0)).toEqual([]);
  });
});

describe('the price arithmetic', () => {
  it('buys the most it can afford, as the sim does', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_000 }), fc.integer({ min: 0, max: 6_000 }), fc.integer({ min: 0, max: 200_000 }), fc.integer({ min: 0, max: 6_000 }), fc.integer({ min: 0, max: 10 }), (base, at, credit, cap, esc) => {
        const bought = buyWith(base, at, credit, cap, esc);
        expect(bought.cost).toBe(costOf(base, at, bought.bp, esc));
        expect(bought.cost).toBeLessThanOrEqual(credit);
        expect(bought.bp).toBeLessThanOrEqual(cap);
        expect(pointPrice(base, 3, esc)).toBeGreaterThanOrEqual(pointPrice(base, 2, esc));
      }),
    );
  });

  it('uses only public data: the gap it reads is the sim\'s own remaining-gap quote', () => {
    const state = step(world(), []).state;
    const v = viewFor(state, id('japan') as NationId);
    expect(pct(v.invest.energy.gapBp)).toBeGreaterThan(50);
    expect(pct(v.invest.food.gapBp)).toBeGreaterThan(20);
  });
});
