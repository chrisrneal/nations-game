import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Command, NationEndowment, NationId, Resource } from '@nations/contracts';
import { flowsFor, isFair, potentialOutput, shortfallPenaltyBp, startingCapacityE4 } from './economy.ts';
import { hashState } from './hash.ts';
import { scoreboard } from './score.ts';
import { step } from './step.ts';
import { startingTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';
import { A, B, C, D, amt, tradeWorld } from './testkit.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

const IDS = [A, B, C, D];
const RES: Resource[] = ['food', 'energy', 'credit'];

function endow(over: Partial<NationEndowment>): NationEndowment {
  return { ...NEUTRAL_ENDOWMENT, id: 'x', name: 'x', ...over };
}

describe('economy formulas (RULES section 2)', () => {
  it('reproduces the RULES worked examples for output and food', () => {
    // Output per tick = PPP GDP x 833 / 10,000: the United States 3,139 (RULES 2.1).
    expect(potentialOutput(endow({}), startingCapacityE4(37_678))).toBe(3_138);
    const us = flowsFor(endow({ population: 355_600_000, foodSelfSufficiency: 66 }), startingCapacityE4(37_678));
    expect(us.food).toEqual({ demand: 356, production: 469 });
    const australia = flowsFor(endow({ population: 27_800_000, foodSelfSufficiency: 100 }), startingCapacityE4(2_451));
    expect(australia.food).toEqual({ demand: 28, production: 56 });
    const egypt = flowsFor(endow({ population: 127_000_000, foodSelfSufficiency: 19 }), startingCapacityE4(3_369));
    expect(egypt.food).toEqual({ demand: 127, production: 48 });
  });

  it('energy follows output; an index of 5 produces a tenth of demand; minerals add at most 1%', () => {
    const japan = flowsFor(endow({ energySelfSufficiency: 5 }), startingCapacityE4(8_000));
    expect(japan.energy.production).toBe(Math.floor(japan.energy.demand / 10));
    const plain = flowsFor(endow({ energySelfSufficiency: 100 }), startingCapacityE4(8_000));
    const rich = flowsFor(endow({ energySelfSufficiency: 100, mineralsEndowment: 100 }), startingCapacityE4(8_000));
    expect(rich.energy.production).toBe(Math.floor((plain.energy.production * 10_100) / 10_000));
  });

  it('shortfall penalty: 10% unmet costs 10 x shortfallPenaltyBpPerPct; both resources together cap at 30%', () => {
    const flow = { demand: 1_000, production: 0 };
    expect(shortfallPenaltyBp(100, flow, 0, flow)).toBe(10 * TUNABLES.shortfallPenaltyBpPerPct.value);
    expect(shortfallPenaltyBp(1_000, flow, 1_000, flow)).toBe(TUNABLES.maxShortfallPenaltyPct.value * 100);
  });

  it('fair price band (RULES 3.2)', () => {
    const prices = { food: 100, energy: 50, credit: 1000 };
    expect(isFair(prices, amt('food', 100), amt('energy', 200))).toBe(true);
    expect(isFair(prices, amt('food', 100), amt('energy', 270))).toBe(true);
    expect(isFair(prices, amt('food', 100), amt('energy', 271))).toBe(false);
    expect(isFair(prices, amt('food', 100), amt('credit', 6))).toBe(false);
  });

  it('starting trust reproduces the RULES section 6 arithmetic', () => {
    const japan = endow({ id: 'japan', blocs: ['g7', 'g20', 'apec', 'cptpp'], alliances: ['us-japan'], topTradePartners: ['china', 'united-states'] });
    const us = endow({ id: 'united-states', blocs: ['g7', 'g20', 'apec'], alliances: ['us-japan', 'nato'], topTradePartners: ['canada'] });
    const nigeria = endow({ id: 'nigeria', blocs: ['ecowas'], topTradePartners: ['india'] });
    expect(startingTrust(japan, us)).toBe(TUNABLES.trustMax.value);
    expect(startingTrust(us, japan)).toBe(startingTrust(japan, us));
    expect(startingTrust(nigeria, japan)).toBe(25);
  });

  it('a self-sufficient nation left alone grows exactly on its baseline and scores 1.00', () => {
    const roster: RosterEntry[] = [
      { id: 'p', name: 'P', endowment: { ...NEUTRAL_ENDOWMENT, baselineGrowthBp: 600, foodSelfSufficiency: 60, energySelfSufficiency: 60 } },
      { id: 'q', name: 'Q', endowment: { ...NEUTRAL_ENDOWMENT, foodSelfSufficiency: 60, energySelfSufficiency: 60 } },
    ];
    let s = createWorld({ seed: 1, roster });
    const start = s.nations['p' as NationId]!.public.output;
    for (let t = 0; t < 60; t++) s = step(s, []).state;
    const p = s.nations['p' as NationId]!;
    expect(p.private.capacityE4).toBe(p.private.baselineE4);
    expect(p.public.output).toBe(p.public.baselineOutput);
    expect(p.public.output).toBeGreaterThan(Math.floor((start * 102) / 100));
    expect(scoreboard(s).nations.map((n) => n.ownScoreBp)).toEqual([10_000, 10_000]);
  });

  it('funds resilience up to the policy floor out of Credit', () => {
    let s = tradeWorld();
    s = step(s, [{ nationId: A, tick: 0, type: 'setPolicy', payload: { resilienceFloor: 80 } }]).state;
    const a = s.nations[A]!;
    expect(a.private.resilience).toBeLessThanOrEqual(80);
    expect(a.private.last.resilienceSpent).toBeGreaterThan(0);
    expect(a.private.last.resilienceSpent % TUNABLES.resilienceCostPerPoint.value).toBe(0);
  });
});

/** Random, often invalid, commands from any nation: the property tests throw everything at the step. */
function commandArb(tick: number): fc.Arbitrary<Command> {
  const id = fc.constantFrom(...IDS);
  const res = fc.constantFrom(...RES);
  const amount = fc.integer({ min: 1, max: 400 });
  const offerId = fc.integer({ min: 1, max: 40 });
  return fc.oneof(
    fc.record({ n: id, to: id, g: res, ga: amount, w: res, wa: amount }).map(({ n, to, g, ga, w, wa }) => ({
      nationId: n,
      tick,
      type: 'makeOffer',
      payload: { to, give: amt(g, ga), get: amt(w, wa) },
    })),
    fc.record({ n: id, o: offerId, t: fc.constantFrom('acceptOffer', 'rejectOffer', 'withdrawOffer') }).map(({ n, o, t }) => ({
      nationId: n,
      tick,
      type: t,
      payload: { offerId: o },
    })),
    fc.record({ n: id, o: offerId, g: res, ga: amount, w: res, wa: amount }).map(({ n, o, g, ga, w, wa }) => ({
      nationId: n,
      tick,
      type: 'counterOffer',
      payload: { offerId: o, give: amt(g, ga), get: amt(w, wa) },
    })),
    fc.record({ n: id, hb: fc.boolean(), rj: fc.boolean(), tr: fc.boolean(), fl: fc.integer({ min: 0, max: 100 }) }).map(({ n, hb, rj, tr, fl }) => ({
      nationId: n,
      tick,
      type: 'setPolicy',
      payload: { hardBargains: hb, rejectAll: rj, acceptTrusted: tr, resilienceFloor: fl },
    })),
    fc.record({ n: id, p: fc.integer({ min: 1, max: 30 }) }).map(({ n, p }) => ({ nationId: n, tick, type: 'fundResilience', payload: { points: p } })),
  );
}

const scriptArb = fc.array(fc.array(fc.integer({ min: 0, max: 1_000 }), { maxLength: 12 }), { minLength: 5, maxLength: 30 });

/** Deterministically turns fast-check integers into a tick's commands via a sampled pool. */
function commandsFor(pool: Command[][], tick: number, picks: number[]): Command[] {
  const bucket = pool[tick % pool.length] ?? [];
  return picks.map((p) => bucket[p % Math.max(1, bucket.length)]).filter((c): c is Command => c !== undefined).map((c) => ({ ...c, tick }));
}

function totals(s: WorldState): Record<Resource, number> {
  const t = { food: 0, energy: 0, credit: 0 };
  for (const id of s.nationOrder) {
    const st = s.nations[id]!.private.stocks;
    t.food += st.food;
    t.energy += st.energy;
    t.credit += st.credit;
  }
  return t;
}

const poolArb = fc.array(fc.array(commandArb(0), { minLength: 1, maxLength: 20 }), { minLength: 3, maxLength: 6 });
const endowArb = fc.record({
  f: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 4, maxLength: 4 }),
  e: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 4, maxLength: 4 }),
  g: fc.array(fc.integer({ min: 100, max: 40_000 }), { minLength: 4, maxLength: 4 }),
});

function randomWorld(seed: number, e: { f: number[]; e: number[]; g: number[] }): WorldState {
  const roster: RosterEntry[] = ['AAA', 'BBB', 'CCC', 'DDD'].map((id, i) => ({
    id,
    name: id,
    endowment: {
      ...NEUTRAL_ENDOWMENT,
      kind: i === 3 ? 'aggregate' : 'playable',
      foodSelfSufficiency: e.f[i] ?? 50,
      energySelfSufficiency: e.e[i] ?? 50,
      gdpPppBn: e.g[i] ?? 1_000,
      baselineGrowthBp: 100 * i,
      mineralsRefining: 25 * i,
      mineralsEndowment: 30 * i,
    },
  }));
  return createWorld({ seed, roster });
}

describe('Gate 1 invariants (property tests)', () => {
  it('conservation: every unit of every resource is accounted for, every tick, exactly', () => {
    fc.assert(
      fc.property(fc.integer(), endowArb, poolArb, scriptArb, (seed, e, pool, script) => {
        let s = randomWorld(seed, e);
        for (const picks of script) {
          const before = totals(s);
          let produced = { food: 0, energy: 0 };
          for (const id of s.nationOrder) {
            produced = {
              food: produced.food + s.nations[id]!.public.food.production,
              energy: produced.energy + s.nations[id]!.public.energy.production,
            };
          }
          const { state, events } = step(s, commandsFor(pool, s.tick, picks));
          const after = totals(state);
          let consumedFood = 0;
          let consumedEnergy = 0;
          let income = 0;
          let spent = 0;
          for (const id of state.nationOrder) {
            const last = state.nations[id]!.private.last;
            consumedFood += last.consumedFood;
            consumedEnergy += last.consumedEnergy;
            income += last.income;
            spent += last.resilienceSpent;
          }
          for (const ev of events) if (ev.type === 'resilienceFunded') spent += (ev.payload as { cost: number }).cost;
          expect(after.food).toBe(before.food + produced.food - consumedFood);
          expect(after.energy).toBe(before.energy + produced.energy - consumedEnergy);
          expect(after.credit).toBe(before.credit + income - spent);
          const dl = (k: keyof WorldState['ledger']): number => state.ledger[k] - s.ledger[k];
          expect(dl('foodProduced') - dl('foodConsumed')).toBe(after.food - before.food);
          expect(dl('energyProduced') - dl('energyConsumed')).toBe(after.energy - before.energy);
          expect(dl('creditIncome') - dl('creditSpentResilience')).toBe(after.credit - before.credit);
          s = state;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('no negative stocks, trust stays in band, offers always expire in time', () => {
    fc.assert(
      fc.property(fc.integer(), endowArb, poolArb, scriptArb, (seed, e, pool, script) => {
        let s = randomWorld(seed, e);
        for (const picks of script) {
          s = step(s, commandsFor(pool, s.tick, picks)).state;
          for (const id of s.nationOrder) {
            const n = s.nations[id]!;
            for (const r of RES) expect(n.private.stocks[r]).toBeGreaterThanOrEqual(0);
            expect(n.private.resilience).toBeGreaterThanOrEqual(0);
            expect(n.private.resilience).toBeLessThanOrEqual(TUNABLES.resilienceMax.value);
            expect(n.public.output).toBeGreaterThanOrEqual(0);
            for (const v of Object.values(n.private.trust)) {
              expect(v).toBeGreaterThanOrEqual(TUNABLES.trustMin.value);
              expect(v).toBeLessThanOrEqual(TUNABLES.trustMax.value);
            }
          }
          for (const o of s.offers) {
            expect(o.expiryTick).toBeGreaterThan(s.tick - 1);
            expect(o.expiryTick - o.createdTick).toBe(TUNABLES.offerLifeTicks.value);
          }
          expect(() => hashState(s)).not.toThrow();
        }
      }),
      { numRuns: 150 },
    );
  });

  it('never mutates its input and is deterministic', () => {
    fc.assert(
      fc.property(fc.integer(), endowArb, poolArb, scriptArb, (seed, e, pool, script) => {
        let s = randomWorld(seed, e);
        for (const picks of script) {
          const commands = commandsFor(pool, s.tick, picks);
          const before = hashState(s);
          const a = step(s, commands);
          const b = step(s, commands);
          expect(hashState(s)).toBe(before);
          expect(hashState(a.state)).toBe(hashState(b.state));
          s = a.state;
        }
      }),
      { numRuns: 60 },
    );
  });
});
