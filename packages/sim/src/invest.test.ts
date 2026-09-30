import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Command, NationEndowment, NationId } from '@nations/contracts';
import { flowsFor, mulDiv, potentialOutput, structuralCover } from './economy.ts';
import { hashState } from './hash.ts';
import { investBase, investBuy, investCost, pointPrice } from './invest.ts';
import { step } from './step.ts';
import { A, B, C, D, TRADE_ROSTER, amt, offer, policy, tradeWorld } from './testkit.ts';
import { TUNABLES } from './tunables.ts';
import { viewFor } from './view.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

const invest = (who: NationId, good: 'food' | 'energy', bp: number, tick: number): Command => ({ nationId: who, tick, type: 'invest', payload: { good, bp } });
const T = TUNABLES;
const nation = (s: WorldState, id: NationId) => s.nations[id]!;
const run = (s: WorldState, ticks: number, commandsAt: (tick: number) => Command[] = () => []): WorldState => {
  let cur = s;
  for (let t = 0; t < ticks; t++) cur = step(cur, commandsAt(cur.tick)).state;
  return cur;
};
/** No standing investment anywhere, so only commands invest. */
const noStanding = (ids: NationId[] = [A, B, C, D]): Command[] => ids.map((id) => policy(id, { investBp: 0 }, 0));

describe('the cost curve (RULES 2.9)', () => {
  it('prices the first point at investCostBp of potential output and each later point investEscalationPct dearer', () => {
    expect(investBase(1_000)).toBe(Math.floor((1_000 * T.investCostBp.value) / 10_000));
    expect(investBase(0)).toBe(1);
    const base = 100;
    expect(pointPrice(base, 0)).toBe(100);
    expect(pointPrice(base, 10)).toBe(100 + T.investEscalationPct.value * 10);
    expect(pointPrice(base, 30)).toBeGreaterThan(pointPrice(base, 29));
  });

  it('costs a whole point at the price of its band and a part-point pro rata, rounded up', () => {
    const base = 100;
    expect(investCost(base, 0, 100)).toBe(100);
    expect(investCost(base, 0, 1)).toBe(1);
    expect(investCost(base, 0, 200)).toBe(100 + pointPrice(base, 1));
    // Half of band 0 and half of band 1.
    expect(investCost(base, 50, 100)).toBe(50 + Math.ceil((50 * pointPrice(base, 1)) / 100));
    expect(investCost(base, 0, 0)).toBe(0);
  });

  it('is never cheaper to buy the same points later, and splitting a purchase costs at most a Credit or two more', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000 }), fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 1, max: 1_500 }), fc.integer({ min: 1, max: 1_500 }), (base, at, x, y) => {
        expect(investCost(base, at + 100, x)).toBeGreaterThanOrEqual(investCost(base, at, x) - 1);
        const whole = investCost(base, at, x + y);
        const parts = investCost(base, at, x) + investCost(base, at + x, y);
        expect(parts).toBeGreaterThanOrEqual(whole);
        expect(parts - whole).toBeLessThanOrEqual(2);
      }),
    );
  });

  it('investBuy buys the most it can afford and never more than the ceiling asks for', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_000 }), fc.integer({ min: 0, max: 6_000 }), fc.integer({ min: 0, max: 200_000 }), fc.integer({ min: 0, max: 6_000 }), (base, at, credit, cap) => {
        const bought = investBuy(base, at, credit, cap);
        expect(bought.bp).toBeGreaterThanOrEqual(0);
        expect(bought.bp).toBeLessThanOrEqual(cap);
        expect(bought.cost).toBe(investCost(base, at, bought.bp));
        expect(bought.cost).toBeLessThanOrEqual(credit);
        if (bought.bp < cap) expect(investCost(base, at, bought.bp + 1)).toBeGreaterThan(credit);
      }),
    );
  });
});

describe('the invest command', () => {
  it('spends Credit now, queues capacity for investLagTicks later, and produces nothing until then', () => {
    const s0 = tradeWorld();
    const a0 = nation(s0, A);
    const e = s0.endowments[A]!;
    const base = investBase(potentialOutput(e, a0.private.capacityE4));
    const cost = investCost(base, 0, 500);
    const lag = T.investLagTicks.value;
    const { state: s1, events } = step(s0, [...noStanding(), invest(A, 'energy', 500, 0)]);
    const a1 = nation(s1, A);
    expect(a1.private.builds).toEqual([{ good: 'energy', bp: 500, readyTick: lag }]);
    expect(a1.private.home.energy).toBe(0);
    expect(a1.private.stocks.credit).toBe(a0.private.stocks.credit + a1.private.last.income - cost - a1.private.last.contributed - a1.private.last.resilienceSpent);
    expect(a1.private.last.invested).toBe(cost);
    expect(s1.ledger.creditSpentInvestment).toBe(cost);
    const made = events.filter((ev) => ev.type === 'investmentMade');
    expect(made).toHaveLength(1);
    expect(made[0]!.audience).toEqual([A]);
    expect(made[0]!.payload).toMatchObject({ nationId: A, good: 'energy', bp: 500, cost, readyTick: lag, by: 'command' });

    // Nothing changes in production until the build is ready, then it adds exactly 5% of demand.
    const structural = (s: WorldState) => flowsFor(s.endowments[A]!, nation(s, A).private.capacityE4);
    let cur = s1;
    while (cur.tick < lag) {
      expect(nation(cur, A).public.energy.production).toBe(structural(cur).energy.production);
      expect(nation(cur, A).private.builds).toHaveLength(1);
      cur = step(cur, []).state;
    }
    const done = nation(cur, A);
    expect(cur.tick).toBe(lag);
    expect(done.private.builds).toEqual([]);
    expect(done.private.home.energy).toBe(500);
    expect(done.public.energy.production).toBe(structural(cur).energy.production + mulDiv(done.public.energy.demand, 500, 10_000));
  });

  it('counts pending capacity as committed: the next point costs more, and the ceiling includes it', () => {
    const s0 = tradeWorld();
    const { state: s1 } = step(s0, [...noStanding(), invest(A, 'food', 1_000, 0)]);
    const v = viewFor(s1, A).invest;
    expect(v.food.pendingBp).toBe(1_000);
    expect(v.food.onlineBp).toBe(0);
    expect(v.food.roomBp).toBe(T.investMaxPct.value * 100 - 1_000);
    expect(v.food.nextPointCost).toBe(pointPrice(v.basePointCost, 10));
    expect(v.energy.pendingBp).toBe(0);
    expect(v.energy.nextPointCost).toBe(pointPrice(v.basePointCost, 0));
  });

  it('refuses what it cannot pay for, the ceiling, background regions and malformed orders', () => {
    const s0 = tradeWorld();
    const reasons = (cmd: Command): string => {
      const ev = step(s0, [cmd]).events.find((e) => e.type === 'commandRejected');
      return ev === undefined ? '' : (ev.payload as { reason: string }).reason;
    };
    const room = T.investMaxPct.value * 100;
    expect(reasons(invest(A, 'food', room, 0))).toMatch(/not enough credit/);
    expect(reasons(invest(D, 'food', 100, 0))).toMatch(/standing/);
    expect(reasons(invest(A, 'food', room + 1, 0))).toMatch(/ceiling/);
    expect(reasons(invest(A, 'food', 0, 0))).toMatch(/positive whole number/);
    expect(reasons(invest(A, 'food', 1.5, 0))).toMatch(/positive whole number/);
    expect(reasons({ nationId: A, tick: 0, type: 'invest', payload: { good: 'credit', bp: 100 } })).toMatch(/food or energy/);
    expect(reasons(invest(A, 'food', 100, 0))).toBe('');
  });

  it('cannot pass the ceiling across several orders either', () => {
    const rich = (s: WorldState): WorldState => ({ ...s, nations: { ...s.nations, [A]: { ...nation(s, A), private: { ...nation(s, A).private, stocks: { ...nation(s, A).private.stocks, credit: 10_000_000 } } } } });
    let s = rich(tradeWorld());
    const room = T.investMaxPct.value * 100;
    s = step(s, [...noStanding(), invest(A, 'food', room - 100, 0)]).state;
    const ev = step(s, [invest(A, 'food', 101, 1)]).events.find((e) => e.type === 'commandRejected');
    expect((ev!.payload as { reason: string }).reason).toMatch(/ceiling/);
    expect(step(s, [invest(A, 'food', 100, 1)]).events.some((e) => e.type === 'commandRejected')).toBe(false);
  });
});

describe('the standing rule (RULES 2.9, dial 3)', () => {
  it('starts every nation at defaultInvestBp', () => {
    for (const id of [A, B, C, D]) expect(nation(tradeWorld(), id).private.policy.investBp).toBe(T.defaultInvestBp.value);
  });

  it('invests its share of the month\'s income in the good with the larger gap, and says nothing in events', () => {
    // Alpha grows food and lacks energy: energy has the larger gap.
    const s0 = tradeWorld();
    const { state: s1, events } = step(s0, [policy(A, { investBp: 1_000 }, 0)]);
    const a = nation(s1, A);
    const spent = a.private.last.invested;
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(mulDiv(a.private.last.income, 1_000, 10_000));
    expect(a.private.builds).toHaveLength(1);
    expect(a.private.builds[0]!.good).toBe('energy');
    expect(a.private.builds[0]!.readyTick).toBe(T.investLagTicks.value);
    expect(s1.ledger.creditSpentInvestment).toBeGreaterThanOrEqual(spent);
    expect(events.some((e) => e.type === 'investmentMade')).toBe(false);
  });

  it('spends nothing at 0, and nothing for a nation with no gap to close', () => {
    const s1 = step(tradeWorld(), noStanding()).state;
    for (const id of [A, B, C, D]) expect(nation(s1, id).private.last.invested).toBe(0);
    expect(s1.ledger.creditSpentInvestment).toBe(0);
    // Charlie is balanced in both goods: the default share has nothing to buy.
    const c = step(tradeWorld(), []).state;
    expect(nation(c, C).private.last.invested).toBe(0);
    expect(nation(c, C).private.builds).toEqual([]);
  });

  it('never builds past the gap or the ceiling', () => {
    const s = run(tradeWorld(), 40, (t) => (t === 0 ? [policy(A, { investBp: 3_000 }, 0), policy(B, { investBp: 3_000 }, 0)] : []));
    for (const id of [A, B]) {
      const n = nation(s, id);
      for (const good of ['food', 'energy'] as const) {
        const committed = n.private.home[good] + n.private.builds.filter((b) => b.good === good).reduce((sum, b) => sum + b.bp, 0);
        expect(committed).toBeLessThanOrEqual(T.investMaxPct.value * 100);
        // Home capacity closes a gap and no more: production ends at demand, or where it started if it started above.
        const structural = flowsFor(s.endowments[id]!, n.private.capacityE4)[good].production;
        expect(n.public[good].production).toBeLessThanOrEqual(Math.max(n.public[good].demand, structural) + 1);
      }
    }
  });
});

describe('RULES 5.3 holds: investment is the nation\'s own', () => {
  /** A world with no crisis damage anywhere, so nothing but the investment differs between two runs. */
  const safe: Omit<NationEndowment, 'id' | 'name'> = { ...NEUTRAL_ENDOWMENT, climateExposure: 0, pandemicPreparedness: 100, gdpPppBn: 1_200 };
  const roster: RosterEntry[] = [
    { id: 'AAA', name: 'Alpha', endowment: { ...safe, foodSelfSufficiency: 100, energySelfSufficiency: 10, baselineGrowthBp: 240 } },
    { id: 'BBB', name: 'Bravo', endowment: { ...safe, foodSelfSufficiency: 10, energySelfSufficiency: 100, baselineGrowthBp: 300 } },
    { id: 'CCC', name: 'Charlie', endowment: { ...safe, mineralsRefining: 100, mineralsEndowment: 100 } },
    { id: 'DDD', name: 'Delta', endowment: { ...safe, kind: 'aggregate', foodSelfSufficiency: 20, energySelfSufficiency: 20 } },
  ];
  const world = (): WorldState => createWorld({ seed: 7, roster });

  it('moves no baseline, no structural cover and no other nation\'s private record', () => {
    const rich = (s: WorldState): WorldState => ({ ...s, nations: { ...s.nations, [A]: { ...nation(s, A), private: { ...nation(s, A).private, stocks: { food: 500, energy: 500, credit: 5_000_000 } } } } });
    const script = (t: number): Command[] => (t === 0 ? noStanding() : []);
    const buildScript = (t: number): Command[] => (t === 0 ? [...noStanding(), invest(A, 'energy', 3_000, 0), invest(A, 'food', 1_500, 0)] : t === 8 ? [invest(A, 'energy', 1_000, 8)] : []);
    let idle = rich(world());
    let built = rich(world());
    for (let t = 0; t < 40; t++) {
      idle = step(idle, script(t)).state;
      built = step(built, buildScript(t)).state;
      expect(structuralCover(built)).toEqual(structuralCover(idle));
      for (const id of idle.nationOrder) {
        expect(nation(built, id).private.baselineE4).toBe(nation(idle, id).private.baselineE4);
        expect(nation(built, id).public.baselineOutput).toBe(nation(idle, id).public.baselineOutput);
        expect(built.scoreTrack[id]!.baselineE3).toBe(idle.scoreTrack[id]!.baselineE3);
      }
      for (const id of [B, C, D]) expect(nation(built, id).private).toEqual(nation(idle, id).private);
    }
    // The builder is the only one who differs: it produces more and beats a baseline that did not move.
    expect(nation(built, A).public.energy.production).toBeGreaterThan(nation(idle, A).public.energy.production);
    expect(nation(built, A).public.output).toBeGreaterThan(nation(idle, A).public.output);
    expect(built.ledger.creditSpentInvestment).toBeGreaterThan(0);
    // Nothing was paid to anyone: every Credit that left A is in the sink.
    const credit = (s: WorldState): number => s.nationOrder.reduce((sum, id) => sum + nation(s, id).private.stocks.credit, 0);
    const pools = (s: WorldState): number => s.pools.adaptation.balance + s.pools.health.balance;
    const held = (s: WorldState): number => credit(s) + pools(s) + s.ledger.creditSpentResilience + s.ledger.creditSpentCrises + s.ledger.creditSpentInvestment;
    expect(held(built) - held(idle)).toBe(built.ledger.creditIncome - idle.ledger.creditIncome);
  });
});

describe('what a trade is worth is measured before home capacity (RULES 3.3)', () => {
  /** The same trade at tick 0 in two worlds: Alpha buys energy from Bravo, once with home energy built and once without. */
  function gainWith(homeEnergyBp: number): number {
    let s = tradeWorld();
    if (homeEnergyBp > 0) {
      const a = nation(s, A);
      const flows = flowsFor(s.endowments[A]!, a.private.capacityE4, { food: 0, energy: homeEnergyBp });
      s = { ...s, nations: { ...s.nations, [A]: { ...a, public: { ...a.public, food: flows.food, energy: flows.energy }, private: { ...a.private, home: { food: 0, energy: homeEnergyBp } } } } };
    }
    // Bravo offers 100 energy for its fair price in Credit at tick 0; Alpha accepts at tick 1.
    s = step(s, [...noStanding(), offer(B, A, amt('energy', 100), amt('credit', 6), 0)]).state;
    // Reference prices read real production, so a builder lowers them a little (RULES 2.9). Hold them level to see the imbalance alone.
    s = { ...s, prices: tradeWorld().prices };
    s = step(s, [{ nationId: A, tick: 1, type: 'acceptOffer', payload: { offerId: 1 } }]).state;
    return nation(s, A).private.last.tradeGainCbp;
  }

  it('pays a buyer the same gain for the same units whether or not it has built at home', () => {
    const plain = gainWith(0);
    expect(plain).toBeGreaterThan(0);
    expect(gainWith(2_000)).toBe(plain);
  });
});

describe('the View (seam 6) and determinism (S5)', () => {
  it('shows a nation its own builds and quotes, and shows others nothing about them', () => {
    const { state } = step(tradeWorld(), [...noStanding(), invest(A, 'food', 200, 0)]);
    const own = viewFor(state, A);
    expect(own.self.private.builds).toHaveLength(1);
    expect(own.invest.lagTicks).toBe(T.investLagTicks.value);
    expect(own.invest.maxBp).toBe(T.investMaxPct.value * 100);
    expect(own.invest.potentialOutput).toBe(potentialOutput(state.endowments[A]!, nation(state, A).private.capacityE4));
    const other = viewFor(state, B);
    expect(JSON.stringify(other.others)).not.toMatch(/builds|homeBp|"home"/);
    expect(other.others.find((o) => o.id === A)!.public.food.production).toBe(nation(state, A).public.food.production);
  });

  it('hashes the same for the same commands, and differently once someone builds', () => {
    const cmds = [...noStanding(), invest(A, 'energy', 300, 0)];
    expect(hashState(step(tradeWorld(), cmds).state)).toBe(hashState(step(tradeWorld(), cmds).state));
    expect(hashState(step(tradeWorld(), cmds).state)).not.toBe(hashState(step(tradeWorld(), noStanding()).state));
  });

  it('never leaves State mutated by a step', () => {
    const s = tradeWorld();
    const before = hashState(s);
    step(s, [invest(A, 'energy', 300, 0)]);
    expect(hashState(s)).toBe(before);
    expect(TRADE_ROSTER.length).toBe(4);
  });
});
