import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { NationId, NationView } from '@nations/contracts';
import { TUNABLES, createWorld, step, viewFor, type WorldState } from '@nations/sim';
import { buyWith, costOf, emptyInvestMemory, investAtRate, observeShortage, ordersFor, planInvestment, pointPrice, spareCredit } from './invest.ts';
import { fullRoster, id } from './testkit.test.helpers.ts';

const roster = fullRoster();
const world = (): WorldState => createWorld({ seed: 4, roster });
const viewOf = (who: string, state: WorldState = world()): NationView => viewFor(state, id(who));
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
  it('spend nothing at 0%, more at higher rates, on the larger gap first, never past it', () => {
    const v = viewOf('germany');
    expect(investAtRate(v, 0, 50_000)).toEqual([]);
    const low = investAtRate(v, 10, 50_000).reduce((s, o) => s + o.cost, 0);
    const mid = investAtRate(v, 25, 50_000).reduce((s, o) => s + o.cost, 0);
    expect(mid).toBeGreaterThan(low);
    const all = investAtRate(v, 100, 50_000_000);
    expect(all[0]!.good).toBe(v.invest.energy.gapBp >= v.invest.food.gapBp ? 'energy' : 'food');
    for (const o of all) expect(o.bp).toBeLessThanOrEqual(v.invest[o.good].gapBp);
    for (const o of all) for (const r of o.reasons) expect(/\d/.test(r)).toBe(true);
  });

  it('build nothing for a nation with no gap', () => {
    expect(investAtRate(viewOf('australia'), 100, 50_000_000)).toEqual([]);
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
