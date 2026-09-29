import { describe, expect, it } from 'vitest';
import type { NationId, NationRecord } from '@nations/contracts';
import {
  baselineOutputFor,
  expectedCoverBp,
  fairShareDeficit,
  flowsFor,
  inKindFundBp,
  mulDiv,
  potentialOutput,
  shortfallPenaltyBp,
  structuralCover,
  structuralPenaltyBp,
} from './economy.ts';
import { ownScoreBp, scoreboard, smoothTowards } from './score.ts';
import { step } from './step.ts';
import { answer, amt, offer, policy } from './testkit.ts';
import { tradeImbalanceMilli } from './trade.ts';
import { TUNABLES } from './tunables.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/**
 * The top-scorer fairness rule (prompt 09, RULES 2.8, 3.3 and 5.1):
 * - the baseline expects the shortfall the world's structure implies, after
 *   the cover a nation can normally expect for how it pays (prompt 15);
 * - each side of a trade gains by the share of its own imbalance it cleared;
 * - ownScore is read from a smoothed path, not one month.
 */
const id = (raw: string): NationId => raw as NationId;
const X = id('xx');
const Y = id('yy');
const Z = id('zz');

// 100 M people each, so food demand is 100 a month and an index of 50 is balanced.
// No crisis exposure, so crisis damage (RULES 4) never blurs these economy checks.
const base = { ...NEUTRAL_ENDOWMENT, population: 100_000_000, gdpPppBn: 1_200, climateExposure: 0, pandemicPreparedness: 100 };
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

  it('an importer expects the penalty on the part of its deficit its expected cover does not reach', () => {
    const s = fresh();
    const cover = structuralCover(s);
    const e = s.endowments[Y]!;
    const b = nation(s, Y).private.baselineE4;
    const f = flowsFor(e, b);
    const deficit = f.food.demand - f.food.production;
    const unmet = deficit - mulDiv(deficit, expectedCoverBp(f, 'food', cover), 10_000);
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

type BaselineTunable = 'baselineCreditCoverPct' | 'baselineInKindCoverPct';
/** Runs `fn` with the two prompt 15 tunables set, then puts them back. */
function withCover<T>(credit: number, inKind: number, fn: () => T): T {
  const table = TUNABLES as unknown as Record<BaselineTunable, { value: number }>;
  const before = [table.baselineCreditCoverPct.value, table.baselineInKindCoverPct.value] as const;
  table.baselineCreditCoverPct.value = credit;
  table.baselineInKindCoverPct.value = inKind;
  try {
    return fn();
  } finally {
    table.baselineCreditCoverPct.value = before[0];
    table.baselineInKindCoverPct.value = before[1];
  }
}

describe('expected cover by how a deficit is paid for (RULES 2.8, prompt 15)', () => {
  // Four nations short of the same 60 food a month (index 20 of a pivot of 50, 100 M people):
  // W swaps: its spare energy is worth more than its whole food deficit.
  // P swaps part: its spare energy pays for about a fifth of it.
  // C has nothing to swap and must buy with Credit.
  // X exports 100 food, so the world's food cover is 80% of 100 / 180 = 44%.
  const E: RosterEntry[] = [
    { id: 'xx', name: 'X', endowment: { ...base, foodSelfSufficiency: 100 } },
    { id: 'ww', name: 'W', endowment: { ...base, gdpPppBn: 2_400, foodSelfSufficiency: 20, energySelfSufficiency: 100 } },
    { id: 'pp', name: 'P', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 60 } },
    { id: 'cc', name: 'C', endowment: { ...base, foodSelfSufficiency: 20 } },
  ];
  const W = id('ww');
  const P = id('pp');
  const C = id('cc');
  const world = (): WorldState => createWorld({ seed: 5, roster: E });
  const flows = (s: WorldState, n: NationId) => flowsFor(s.endowments[n]!, nation(s, n).private.baselineE4);
  const penalty = (s: WorldState, n: NationId): number => structuralPenaltyBp(s.endowments[n]!, nation(s, n).private.baselineE4, structuralCover(s));

  it('the fixture: the same food deficit, spare energy worth all of it, part of it, none of it', () => {
    const s = world();
    for (const n of [W, P, C]) expect(flows(s, n).food.demand - flows(s, n).food.production).toBe(60);
    expect(inKindFundBp(flows(s, W), 'food')).toBe(10_000);
    const pSpare = flows(s, P).energy.production - flows(s, P).energy.demand;
    const pFund = Math.floor((pSpare * TUNABLES.energyBasePriceMilli.value * 10_000) / (60 * TUNABLES.foodBasePriceMilli.value));
    expect(inKindFundBp(flows(s, P), 'food')).toBe(pFund);
    expect(pFund).toBeGreaterThan(0);
    expect(pFund).toBeLessThan(10_000);
    expect(inKindFundBp(flows(s, C), 'food')).toBe(0);
    // Nobody is short of energy, so there is no energy deficit to fund.
    expect(inKindFundBp(flows(s, W), 'energy')).toBe(0);
  });

  it('credit 100 and in-kind 0 is the prompt 09 rule: every importer expects the world\'s cover', () => {
    withCover(100, 0, () => {
      const s = world();
      const cover = structuralCover(s);
      for (const n of [W, P, C]) {
        expect(expectedCoverBp(flows(s, n), 'food', cover)).toBe(cover.food);
        const f = flows(s, n).food;
        const unmet = f.demand - f.production - fairShareDeficit(f, cover.food);
        expect(penalty(s, n)).toBe(shortfallPenaltyBp(unmet, f, 0, flows(s, n).energy));
      }
    });
  });

  it('a nation buying with Credit expects baselineCreditCoverPct of the world\'s cover', () => {
    withCover(50, 60, () => {
      const s = world();
      const cover = structuralCover(s);
      expect(expectedCoverBp(flows(s, C), 'food', cover)).toBe(Math.floor((cover.food * 50) / 100));
    });
  });

  it('spare goods that pay for the whole deficit add baselineInKindCoverPct of the rest; part of it, in proportion', () => {
    withCover(50, 60, () => {
      const s = world();
      const cover = structuralCover(s);
      const credit = Math.floor((cover.food * 50) / 100);
      expect(expectedCoverBp(flows(s, W), 'food', cover)).toBe(credit + Math.floor(((10_000 - credit) * 60) / 100));
      const fund = inKindFundBp(flows(s, P), 'food');
      expect(expectedCoverBp(flows(s, P), 'food', cover)).toBe(credit + mulDiv(10_000 - credit, 60 * fund, 1_000_000));
      const order = [W, P, C].map((n) => expectedCoverBp(flows(s, n), 'food', cover));
      expect(order[0]).toBeGreaterThan(order[1]!);
      expect(order[1]).toBeGreaterThan(order[2]!);
    });
  });

  it('so the same deficit costs a swapper a smaller expected shortfall than a Credit buyer, and never more than no cover at all', () => {
    withCover(50, 60, () => {
      const s = world();
      expect(penalty(s, W)).toBeLessThan(penalty(s, P));
      expect(penalty(s, P)).toBeLessThan(penalty(s, C));
      const f = flows(s, C);
      expect(penalty(s, C)).toBeLessThanOrEqual(shortfallPenaltyBp(f.food.demand - f.food.production, f.food, 0, f.energy));
    });
    // Under the old rule the three expected the same.
    withCover(100, 0, () => {
      const s = world();
      expect(penalty(s, W)).toBe(penalty(s, C));
    });
  });

  it('an exporter still expects no shortfall, whatever the settings', () => {
    for (const [credit, inKind] of [[100, 0], [25, 100], [50, 60]] as const) {
      withCover(credit, inKind, () => {
        const s = world();
        expect(penalty(s, X)).toBe(0);
      });
    }
  });

  it('reads baseline paths only: no nation\'s play, its own included, moves a baseline', () => {
    withCover(50, 60, () => {
      const s = world();
      const boost = (n: NationId): WorldState => {
        const r = nation(s, n);
        return { ...s, nations: { ...s.nations, [n]: { ...r, private: { ...r.private, capacityE4: r.private.capacityE4 * 3 } } } };
      };
      for (const n of [W, P, C]) {
        expect(penalty(boost(X), n)).toBe(penalty(s, n));
        expect(penalty(boost(n), n)).toBe(penalty(s, n));
      }
    });
  });

  it('the trade gain\'s yardstick is untouched: a buyer still clears against the world\'s fair share', () => {
    withCover(50, 60, () => {
      const s = world();
      const cover = structuralCover(s);
      for (const n of [W, C]) {
        const f = nation(s, n).public.food;
        const energySpare = Math.max(0, nation(s, n).public.energy.production - nation(s, n).public.energy.demand);
        expect(tradeImbalanceMilli(nation(s, n), s.prices, cover)).toBe(fairShareDeficit(f, cover.food) * s.prices.food + energySpare * s.prices.energy);
      }
    });
  });
});

describe('trade gains by own imbalance cleared (RULES 3.3)', () => {
  const bpCbp = TUNABLES.gainsFromTradeBp.value * 100;
  const sell = (s: WorldState, to: NationId, units: number, tick = 0) => {
    const credit = Math.max(1, Math.floor((units * s.prices.food) / 1000));
    const made = step(s, [offer(X, to, amt('food', units), amt('credit', credit), tick)]).state;
    return step(made, [answer('acceptOffer', to, made.nextOfferId - 1, tick + 1)]).state;
  };

  it('the seller gains by the share of its own surplus sold, whatever the size of the buyer', () => {
    const s = fresh();
    const surplus = nation(s, X).public.food.production - nation(s, X).public.food.demand;
    expect(surplus).toBe(100);
    const toSmall = sell(s, Y, 20);
    const toLarge = sell(s, Z, 20);
    // 20 of a 100 surplus: a fifth of the full monthly gain, to a small or a ten-times-larger buyer alike.
    expect(nation(toSmall, X).private.last.tradeGainCbp).toBe(bpCbp / 5);
    expect(nation(toLarge, X).private.last.tradeGainCbp).toBe(bpCbp / 5);
  });

  it('the buyer gains by the share of its fair-share deficit covered, capped at the full rate', () => {
    const s = fresh();
    const yFood = nation(s, Y).public.food;
    const fair = fairShareDeficit(yFood, structuralCover(s).food);
    const half = Math.floor(fair / 2);
    const some = sell(s, Y, half);
    expect(nation(some, Y).private.last.tradeGainCbp).toBe(Math.floor((bpCbp * half * s.prices.food) / (fair * s.prices.food)));
    // Covering the whole deficit is more than the fair share: the gain stops at the full rate.
    const all = sell(s, Y, yFood.demand - yFood.production);
    expect(nation(all, Y).private.last.tradeGainCbp).toBe(bpCbp);
  });

  it('the imbalance a nation can clear is its surplus plus its fair share of each deficit, at reference prices', () => {
    const s = fresh();
    const cover = structuralCover(s);
    expect(tradeImbalanceMilli(nation(s, X), s.prices, cover)).toBe(100 * s.prices.food);
    const yFood = nation(s, Y).public.food;
    expect(tradeImbalanceMilli(nation(s, Y), s.prices, cover)).toBe(fairShareDeficit(yFood, cover.food) * s.prices.food);
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
  });
});

describe('a small imbalance never out-earns a large one (prompt 13)', () => {
  // Same economy for S and L (100 M people, the same GDP). S is short 10 food a month, L 90.
  // X exports 100, and a region short 100 keeps the world's cover near 40%.
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
    // Small sales cannot be priced inside the fair band in whole Credits, so the seller allows hard bargains.
    const made = step(s, [policy(X, { hardBargains: true }, 0), offer(X, to, amt('food', units), amt('credit', credit), 0)]).state;
    const done = step(made, [answer('acceptOffer', to, made.nextOfferId - 1, 1)]);
    expect(done.events.some((e) => e.type === 'offerSettled')).toBe(true);
    return nation(done.state, to).private.last.tradeGainCbp;
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
    expect([deficit(S), deficit(L)]).toEqual([10, 90]);
    expect(fair(S)).toBeLessThan(deficit(S));
    expect(fair(L)).toBeLessThan(deficit(L));
  });

  it('covering the same share of their fair share, the small one never earns more than the large one', () => {
    for (const pct of [25, 50, 75, 100]) {
      const small = gainFor(S, Math.max(1, Math.floor((fair(S) * pct) / 100)));
      const large = gainFor(L, Math.max(1, Math.floor((fair(L) * pct) / 100)));
      expect(small, `${pct}% of the fair share`).toBeLessThanOrEqual(large);
    }
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
