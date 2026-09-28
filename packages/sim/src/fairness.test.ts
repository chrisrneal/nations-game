import { describe, expect, it } from 'vitest';
import type { NationId, NationRecord } from '@nations/contracts';
import {
  baselineOutputFor,
  fairShareDeficit,
  flowsFor,
  potentialOutput,
  shortfallPenaltyBp,
  structuralCover,
  structuralPenaltyBp,
} from './economy.ts';
import { ownScoreBp, scoreboard, smoothTowards } from './score.ts';
import { step } from './step.ts';
import { answer, amt, offer } from './testkit.ts';
import { curvePpm, gainSharePpm, tradeGainBases } from './trade.ts';
import { TUNABLES } from './tunables.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/**
 * The top-scorer fairness rule (prompt 09, RULES 2.8, 3.3 and 5.1):
 * - the baseline expects the shortfall the world's structure implies;
 * - each side of a trade gains by the share of its own imbalance it cleared,
 *   through a payout curve, with a floor on a small import base (prompt 13);
 * - ownScore is read from a smoothed path, not one month.
 */
const id = (raw: string): NationId => raw as NationId;
const X = id('xx');
const Y = id('yy');
const Z = id('zz');

// 100 M people each, so food demand is 100 a month and an index of 50 is balanced.
const base = { ...NEUTRAL_ENDOWMENT, population: 100_000_000, gdpPppBn: 1_200 };
/** X exports food; Y is a small food importer; Z a large one; R a background region short of food. */
const ROSTER: RosterEntry[] = [
  { id: 'xx', name: 'X', endowment: { ...base, foodSelfSufficiency: 100 } },
  { id: 'yy', name: 'Y', endowment: { ...base, foodSelfSufficiency: 30 } },
  { id: 'zz', name: 'Z', endowment: { ...base, foodSelfSufficiency: 5, gdpPppBn: 12_000 } },
  { id: 'rr', name: 'R', endowment: { ...base, kind: 'aggregate', foodSelfSufficiency: 40 } },
];
const fresh = (): WorldState => createWorld({ seed: 7, roster: ROSTER });
const nation = (s: WorldState, n: NationId): NationRecord => s.nations[n] as NationRecord;
const share = TUNABLES.structuralCoverSharePct.value;

describe('structural cover (RULES 2.8)', () => {
  it('is the share of the world deficit the world surplus could cover, over every nation including regions', () => {
    const s = fresh();
    // Surplus: X 100. Deficits: Y 40, Z 90, R 20 = 150.
    expect(structuralCover(s).food).toBe(Math.floor((Math.floor((100 * share) / 100) * 10_000) / 150));
    // Energy is balanced everywhere: nobody is short, so cover is full.
    expect(structuralCover(s).energy).toBe(10_000);
  });

  it('reads baseline paths only, so nothing a player does moves it', () => {
    const s = fresh();
    const x = nation(s, X);
    const boosted: WorldState = {
      ...s,
      nations: { ...s.nations, [X]: { ...x, private: { ...x.private, capacityE4: x.private.capacityE4 * 3 } } },
    };
    expect(structuralCover(boosted)).toEqual(structuralCover(s));
  });

  it('caps at full cover when the world has more than enough', () => {
    const rich = createWorld({
      seed: 1,
      roster: [
        { id: 'a', name: 'A', endowment: { ...base, foodSelfSufficiency: 100 } },
        { id: 'b', name: 'B', endowment: { ...base, foodSelfSufficiency: 45 } },
      ],
    });
    expect(structuralCover(rich).food).toBe(10_000);
  });
});

describe('structural baseline (RULES 2.8, 5.1)', () => {
  it('an exporter expects no shortfall, so its baseline is its baseline potential', () => {
    const s = fresh();
    const cover = structuralCover(s);
    const e = s.endowments[X]!;
    expect(structuralPenaltyBp(e, nation(s, X).private.baselineE4, cover)).toBe(0);
    expect(baselineOutputFor(e, nation(s, X).private.baselineE4, cover)).toBe(potentialOutput(e, nation(s, X).private.baselineE4));
  });

  it('an importer expects the penalty on the part of its deficit the world cannot cover', () => {
    const s = fresh();
    const cover = structuralCover(s);
    const e = s.endowments[Y]!;
    const b = nation(s, Y).private.baselineE4;
    const f = flowsFor(e, b);
    const deficit = f.food.demand - f.food.production;
    const unmet = deficit - fairShareDeficit(f.food, cover.food);
    expect(fairShareDeficit(f.food, cover.food)).toBe(Math.floor((deficit * cover.food) / 10_000));
    const penalty = shortfallPenaltyBp(unmet, f.food, 0, f.energy);
    expect(penalty).toBeGreaterThan(0);
    expect(structuralPenaltyBp(e, b, cover)).toBe(penalty);
    expect(baselineOutputFor(e, b, cover)).toBe(Math.floor((potentialOutput(e, b) * (10_000 - penalty)) / 10_000));
  });

  it('the sim publishes that baseline every month', () => {
    const s1 = step(fresh(), []).state;
    const s0 = fresh();
    const cover = structuralCover(s0);
    expect(nation(s1, Y).public.baselineOutput).toBe(baselineOutputFor(s0.endowments[Y]!, nation(s0, Y).private.baselineE4, cover));
  });

  it('an importer left alone pays for its whole deficit against a baseline that expects only the uncovered part', () => {
    let alone = fresh();
    for (let t = 0; t < 24; t++) alone = step(alone, []).state;
    const y = nation(alone, Y);
    const full = shortfallPenaltyBp(y.private.last.unmetFood, y.public.food, 0, y.public.energy);
    const expected = structuralPenaltyBp(alone.endowments[Y]!, y.private.baselineE4, structuralCover(alone));
    expect(full).toBeGreaterThan(expected);
    expect(y.private.last.penaltyPct).toBe(Math.floor(full / 100));
    expect(ownScoreBp(y)).toBe(Math.floor((y.public.output * 10_000) / y.public.baselineOutput));
    expect(ownScoreBp(y)).toBeLessThan(10_000);
    // An exporter left alone neither gains nor loses: exactly its baseline.
    expect(ownScoreBp(nation(alone, X))).toBe(10_000);
  });
});

describe('trade gains by own imbalance cleared (RULES 3.3)', () => {
  const bpCbp = TUNABLES.gainsFromTradeBp.value * 100;
  const sellCurve = TUNABLES.tradeGainSellCurve.value;
  const buyCurve = TUNABLES.tradeGainBuyCurve.value;
  /** The payout curve in plain floating point, for expectations: 1 - (1 - share)^power. */
  const curve = (share: number, power: number): number => 1 - (1 - Math.min(1, share)) ** power;
  const sell = (s: WorldState, to: NationId, units: number, tick = 0) => {
    const credit = Math.max(1, Math.floor((units * s.prices.food) / 1000));
    const made = step(s, [offer(X, to, amt('food', units), amt('credit', credit), tick)]).state;
    return step(made, [answer('acceptOffer', to, made.nextOfferId - 1, tick + 1)]).state;
  };
  const bases = (s: WorldState, n: NationId) => tradeGainBases(nation(s, n), s.endowments[n]!, s.prices, structuralCover(s));

  it('the seller gains by the gentle curve on the share of its own surplus sold, whatever the size of the buyer', () => {
    const s = fresh();
    const surplus = nation(s, X).public.food.production - nation(s, X).public.food.demand;
    expect(surplus).toBe(100);
    const toSmall = sell(s, Y, 20);
    const toLarge = sell(s, Z, 20);
    // 20 of a 100 surplus, to a small or a ten-times-larger buyer alike.
    const expected = bpCbp * curve(0.2, sellCurve);
    expect(Math.abs(nation(toSmall, X).private.last.tradeGainCbp - expected)).toBeLessThanOrEqual(2);
    expect(nation(toLarge, X).private.last.tradeGainCbp).toBe(nation(toSmall, X).private.last.tradeGainCbp);
  });

  it('the buyer gains by the steep curve on the share of its import base covered: the first units pay most', () => {
    const s = fresh();
    const base = bases(s, Y).importMilli;
    const units = Math.floor(base / 2 / s.prices.food);
    const some = sell(s, Y, units);
    const share = (units * s.prices.food) / base;
    const got = nation(some, Y).private.last.tradeGainCbp;
    expect(Math.abs(got - bpCbp * curve(share, buyCurve))).toBeLessThanOrEqual(2);
    // Diminishing returns: half the base covered earns well over half the gain.
    expect(got).toBeGreaterThan(bpCbp * share);
  });

  it('the import base is the fair share, raised to a floor of own output, never above the whole deficit', () => {
    const s = fresh();
    const cover = structuralCover(s);
    const floorOf = (n: NationId): number =>
      Math.floor((potentialOutput(s.endowments[n]!, nation(s, n).private.capacityE4) * 1000 * TUNABLES.tradeGainImportFloorBp.value) / 10_000);
    // An exporter: its whole surplus, no import base.
    expect(bases(s, X)).toEqual({ exportMilli: 100 * s.prices.food, importMilli: 0 });
    // Y's fair share is under the floor and its deficit above it: the floor.
    const yFood = nation(s, Y).public.food;
    expect(fairShareDeficit(yFood, cover.food) * s.prices.food).toBeLessThan(floorOf(Y));
    expect((yFood.demand - yFood.production) * s.prices.food).toBeGreaterThan(floorOf(Y));
    expect(bases(s, Y)).toEqual({ exportMilli: 0, importMilli: floorOf(Y) });
    // Z is a ten-times-larger economy whose whole deficit is under the floor: its whole deficit.
    const zFood = nation(s, Z).public.food;
    expect(bases(s, Z)).toEqual({ exportMilli: 0, importMilli: (zFood.demand - zFood.production) * s.prices.food });
  });

  it('never pays more than the full rate in a month, however much is sold', () => {
    const s = fresh();
    // X sells 200 food in one month, twice its surplus: 90 covers Z's whole deficit, 40 of the next 100 covers Y's.
    const credit = Math.floor((100 * s.prices.food) / 1000);
    const made = step(s, [
      offer(X, Z, amt('food', 100), amt('credit', credit), 0),
      offer(X, Y, amt('food', 100), amt('credit', credit), 0),
    ]).state;
    const done = step(made, [answer('acceptOffer', Y, 2, 1), answer('acceptOffer', Z, 1, 1)]);
    expect(done.events.filter((e) => e.type === 'offerSettled')).toHaveLength(2);
    expect(nation(done.state, X).private.last.tradeGainCbp).toBe(bpCbp);
    expect(nation(done.state, Y).private.last.tradeGainCbp).toBe(bpCbp);
    expect(nation(done.state, Z).private.last.tradeGainCbp).toBe(bpCbp);
  });

  it('curve 1 and no floor are exactly the prompt 09 rule: the share of everything the nation could clear', () => {
    const b = { exportMilli: 6_000, importMilli: 2_000 };
    expect(gainSharePpm(b, 3_000, 1_000, 1, 1)).toBe(500_000);
    expect(gainSharePpm(b, 6_000, 2_000, 1, 1)).toBe(1_000_000);
    expect(gainSharePpm(b, 0, 0, 3, 3)).toBe(0);
    // A curve pays more for the same partial clear, and the same for a full one.
    expect(gainSharePpm(b, 3_000, 1_000, 2, 6)).toBeGreaterThan(500_000);
    expect(gainSharePpm(b, 6_000, 2_000, 2, 6)).toBe(1_000_000);
    expect(curvePpm(500_000, 2)).toBe(750_000);
    expect(curvePpm(1_000_000, 6)).toBe(1_000_000);
    expect(curvePpm(0, 6)).toBe(0);
  });
});

describe('a small imbalance never out-earns a large one (prompt 13)', () => {
  // Same economy for S and L (100 M people, the same GDP). S is short 10 food a month, L 90.
  // X exports 100, and a region short 100 keeps the world's cover near 40%, so both have a fair share below their deficit.
  const F: RosterEntry[] = [
    { id: 'xx', name: 'X', endowment: { ...base, foodSelfSufficiency: 100 } },
    { id: 'ss', name: 'S', endowment: { ...base, foodSelfSufficiency: 45 } },
    { id: 'll', name: 'L', endowment: { ...base, foodSelfSufficiency: 5 } },
    { id: 'rr', name: 'R', endowment: { ...base, kind: 'aggregate', foodSelfSufficiency: 0 } },
  ];
  const S = id('ss');
  const L = id('ll');
  const world = (): WorldState => createWorld({ seed: 3, roster: F });
  const gainFor = (to: NationId, units: number): number => {
    const s = world();
    const credit = Math.max(1, Math.floor((units * s.prices.food) / 1000));
    const made = step(s, [offer(X, to, amt('food', units), amt('credit', credit), 0)]).state;
    const done = step(made, [answer('acceptOffer', to, made.nextOfferId - 1, 1)]).state;
    return nation(done, to).private.last.tradeGainCbp;
  };
  const fair = (n: NationId): number => {
    const s = world();
    return fairShareDeficit(nation(s, n).public.food, structuralCover(s).food);
  };
  const deficit = (n: NationId): number => {
    const f = nation(world(), n).public.food;
    return f.demand - f.production;
  };

  it('the fixture: same economy, a small and a large deficit, fair shares both below the deficit', () => {
    const s = world();
    expect(nation(s, S).public.output).toBe(nation(s, L).public.output);
    expect(deficit(S)).toBe(10);
    expect(deficit(L)).toBe(90);
    expect(fair(S)).toBeLessThan(deficit(S));
    expect(fair(L)).toBeLessThan(deficit(L));
  });

  it('covering the same share of their fair share, the small one earns less than the large one', () => {
    // Half of each fair share.
    expect(gainFor(S, fair(S) / 2)).toBeLessThan(gainFor(L, fair(L) / 2));
  });

  it('covering the same share of their whole deficit, the small one never earns more', () => {
    for (const pct of [10, 20, 30, 50, 70, 100]) {
      const small = gainFor(S, Math.max(1, Math.floor((deficit(S) * pct) / 100)));
      const large = gainFor(L, Math.max(1, Math.floor((deficit(L) * pct) / 100)));
      expect(small, `${pct}% of the deficit`).toBeLessThanOrEqual(large);
    }
  });

  it('a tiny import cannot earn the full rate from its fair share alone; covering its whole deficit can', () => {
    const full = TUNABLES.gainsFromTradeBp.value * 100;
    expect(gainFor(S, fair(S))).toBeLessThan(full);
    expect(gainFor(S, deficit(S))).toBe(full);
    // The large importer's fair share is above the floor: its fair share is enough.
    expect(gainFor(L, fair(L))).toBe(full);
  });
});

describe('smoothed ownScore (RULES 5.1)', () => {
  it('moves a set share of the way to each new month, seeded by the first', () => {
    expect(smoothTowards(undefined, 5_000, 12)).toBe(5_000);
    expect(smoothTowards(5_000, 6_200, 12)).toBe(5_100);
    expect(smoothTowards(5_000, 3_800, 12)).toBe(4_900);
    expect(smoothTowards(5_000, 9_000, 1)).toBe(9_000);
  });

  it('the scoreboard reads the smoothed path, so one lucky final month cannot decide a game', () => {
    let s = fresh();
    for (let t = 0; t < 30; t++) s = step(s, []).state;
    const track = s.scoreTrack[Y];
    expect(track).toBeDefined();
    const y = nation(s, Y);
    const board = scoreboard(s).nations.find((n) => n.id === Y);
    expect(board?.ownScoreBp).toBe(Math.floor((track!.outputE3 * 10_000) / track!.baselineE3));
    // Pretend the last month had no shortfall at all: the snapshot jumps, the smoothed score barely moves.
    const lucky: WorldState = {
      ...s,
      nations: { ...s.nations, [Y]: { ...y, public: { ...y.public, output: y.public.baselineOutput * 2 } } },
    };
    expect(ownScoreBp(nation(lucky, Y))).toBeGreaterThan(15_000);
    expect(scoreboard(lucky).nations.find((n) => n.id === Y)?.ownScoreBp).toBe(board?.ownScoreBp);
  });

  it('regions are tracked but never scored; a world at tick 0 scores everyone at 1.00', () => {
    const s = fresh();
    expect(scoreboard(s).nations.map((n) => n.ownScoreBp)).toEqual([10_000, 10_000, 10_000]);
    const s1 = step(s, []).state;
    expect(Object.keys(s1.scoreTrack).sort()).toEqual(['rr', 'xx', 'yy', 'zz']);
    expect(scoreboard(s1).nations.map((n) => n.id)).toEqual([X, Y, Z]);
  });
});
