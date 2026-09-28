import { describe, expect, it } from 'vitest';
import type { Command, Event, TradeOffer } from '@nations/contracts';
import { step } from './step.ts';
import { TUNABLES } from './tunables.ts';
import { viewFor } from './view.ts';
import { A, B, C, D, amt, answer, counter, offer, policy, tradeWorld } from './testkit.ts';
import type { WorldState } from './world.ts';

/** Steps once per entry, each entry being that tick's commands. Returns final state and all events. */
function run(state: WorldState, ticks: Command[][]): { state: WorldState; events: Event[] } {
  const events: Event[] = [];
  let s = state;
  for (const commands of ticks) {
    const result = step(s, commands);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

const types = (events: readonly Event[]): string[] => events.map((e) => e.type);
const rejections = (events: readonly Event[]): string[] =>
  events.filter((e) => e.type === 'commandRejected').map((e) => (e.payload as { reason: string }).reason);
const trust = (s: WorldState, holder: typeof A, other: typeof A): number => s.nations[holder]?.private.trust[other] ?? -1;
const stock = (s: WorldState, id: typeof A) => s.nations[id]?.private.stocks ?? { food: -1, energy: -1, credit: -1 };

/** Fair terms at tick-0 prices: Alpha's 100 food for Bravo's energy of equal value. */
function fairFoodForEnergy(s: WorldState, food = 100): { give: ReturnType<typeof amt>; get: ReturnType<typeof amt> } {
  return { give: amt('food', food), get: amt('energy', Math.floor((food * s.prices.food) / s.prices.energy)) };
}

describe('trade offers are State objects with an expiry tick (seam 8)', () => {
  it('makeOffer stores an open offer both parties can see, and nobody else', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const { state, events } = run(s0, [[offer(A, B, give, get, 0)]]);
    expect(state.offers).toHaveLength(1);
    const o = state.offers[0] as TradeOffer;
    expect(o).toMatchObject({ id: 1, from: A, to: B, createdTick: 0, expiryTick: TUNABLES.offerLifeTicks.value, hardBargain: false, counterOf: null });
    expect(types(events)).toContain('offerMade');
    expect(events.find((e) => e.type === 'offerMade')?.audience).toEqual([A, B]);
    expect(viewFor(state, A).offers.map((x) => x.id)).toEqual([1]);
    expect(viewFor(state, B).offers.map((x) => x.id)).toEqual([1]);
    expect(viewFor(state, C).offers).toEqual([]);
  });

  it('accept settles at once: stocks move both ways and trust rises on both sides', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const quiet = run(s0, [[], []]).state;
    const { state, events } = run(s0, [[offer(A, B, give, get, 0)], [answer('acceptOffer', B, 1, 1)]]);
    expect(state.offers).toEqual([]);
    expect(types(events)).toContain('offerSettled');
    expect(stock(state, A).food).toBe(stock(quiet, A).food - give.amount);
    expect(stock(state, A).energy).toBeGreaterThanOrEqual(stock(quiet, A).energy);
    expect(stock(state, B).food).toBeGreaterThanOrEqual(stock(quiet, B).food);
    expect(trust(state, A, B)).toBe(trust(quiet, A, B) + TUNABLES.trustPerTrade.value);
    expect(trust(state, B, A)).toBe(trust(quiet, B, A) + TUNABLES.trustPerTrade.value);
    expect(state.nations[A]?.private.tradesSettled).toBe(1);
    expect(state.ledger.tradesSettled).toBe(1);
  });

  it('reject closes the offer with no trust cost', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const quiet = run(s0, [[], []]).state;
    const { state, events } = run(s0, [[offer(A, B, give, get, 0)], [answer('rejectOffer', B, 1, 1)]]);
    expect(state.offers).toEqual([]);
    expect(events.find((e) => e.type === 'offerRejected')?.payload).toMatchObject({ by: 'command' });
    expect(trust(state, A, B)).toBe(trust(quiet, A, B));
  });

  it('counter closes the original and opens a new offer the other way, which can be accepted', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const countered = run(s0, [[offer(A, B, give, get, 0)], [counter(B, 1, amt('energy', get.amount - 10), amt('food', 100), 1)]]);
    expect(countered.state.offers).toHaveLength(1);
    expect(countered.state.offers[0]).toMatchObject({ id: 2, from: B, to: A, counterOf: 1, createdTick: 1 });
    expect(types(countered.events)).toContain('offerCountered');
    const settled = run(countered.state, [[answer('acceptOffer', A, 2, 2)]]);
    expect(types(settled.events)).toContain('offerSettled');
    expect(settled.state.offers).toEqual([]);
  });

  it('only the maker may withdraw', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const made = run(s0, [[offer(A, B, give, get, 0)]]).state;
    const byOther = step(made, [answer('withdrawOffer', B, 1, 1)]);
    expect(rejections(byOther.events)).toEqual(['only the maker can withdraw an offer']);
    const byMaker = step(made, [answer('withdrawOffer', A, 1, 1)]);
    expect(types(byMaker.events)).toContain('offerWithdrawn');
    expect(byMaker.state.offers).toEqual([]);
  });

  it('an unanswered offer expires on its expiry tick and the ignorer loses the maker\'s trust', () => {
    const s0 = run(tradeWorld(), [[policy(B, { acceptFairDeficit: false }, 0)]]).state;
    const { give, get } = fairFoodForEnergy(s0);
    const life = TUNABLES.offerLifeTicks.value;
    const quiet = run(s0, Array.from({ length: life }, () => [])).state;
    const ticks: Command[][] = [[offer(A, B, give, get, 1)], ...Array.from({ length: life - 1 }, () => [])];
    const before = run(s0, ticks.slice(0, life - 1));
    expect(before.state.offers).toHaveLength(1);
    const { state, events } = run(s0, ticks);
    expect(state.tick).toBe(1 + life);
    expect(state.offers).toEqual([]);
    const expired = events.find((e) => e.type === 'offerExpired');
    expect(expired?.tick).toBe(life);
    expect(trust(state, A, B)).toBe(trust(quiet, A, B) - TUNABLES.trustPerIgnoredOffer.value);
    expect(state.ledger.offersExpired).toBe(1);
  });
});

describe('standing policies answer when nobody is online', () => {
  it('a fair offer covering a deficit is accepted by policy on its last tick, not before', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    const life = TUNABLES.offerLifeTicks.value;
    const early = run(s0, [[offer(A, B, give, get, 0)], ...Array.from({ length: life - 2 }, () => [])]);
    expect(early.state.offers).toHaveLength(1);
    const { events } = run(early.state, [[]]);
    const settled = events.find((e) => e.type === 'offerSettled');
    expect(settled?.payload).toMatchObject({ by: 'policy' });
    expect(settled?.tick).toBe(life - 1);
  });

  it('rejectAll rejects on the last tick; a non-deficit offer is left to expire', () => {
    const s0 = run(tradeWorld(), [[policy(B, { rejectAll: true }, 0)]]).state;
    const { give, get } = fairFoodForEnergy(s0);
    const life = TUNABLES.offerLifeTicks.value;
    const r = run(s0, [[offer(A, B, give, get, 1)], ...Array.from({ length: life - 1 }, () => [])]);
    expect(r.events.find((e) => e.type === 'offerRejected')?.payload).toMatchObject({ by: 'policy' });
    // Charlie is balanced in food, so a food offer covers no deficit of Charlie's.
    const c = run(tradeWorld(), [[offer(A, C, amt('food', 10), amt('credit', 1), 0)], ...Array.from({ length: life - 1 }, () => [])]);
    expect(types(c.events)).toContain('offerExpired');
  });

  it('the trusted-partner policy accepts even a hard bargain from a trusted maker', () => {
    const s0 = run(tradeWorld(), [[policy(A, { hardBargains: true }, 0), policy(B, { acceptTrusted: true }, 0)]]).state;
    expect(trust(s0, B, A)).toBeGreaterThanOrEqual(TUNABLES.autoAcceptTrustThreshold.value);
    const life = TUNABLES.offerLifeTicks.value;
    const hard = { give: amt('food', 50), get: amt('energy', 150) };
    const r = run(s0, [[offer(A, B, hard.give, hard.get, 1)], ...Array.from({ length: life - 1 }, () => [])]);
    expect(r.events.find((e) => e.type === 'offerMade')?.payload).toMatchObject({ offer: { hardBargain: true } });
    expect(r.events.find((e) => e.type === 'offerSettled')?.payload).toMatchObject({ by: 'policy' });
  });

  it('a background region answers the tick an offer arrives', () => {
    const s0 = tradeWorld();
    const credit = Math.floor((50 * s0.prices.food) / 1000);
    const r = step(s0, [offer(A, D, amt('food', 50), amt('credit', credit), 0)]);
    expect(r.events.find((e) => e.type === 'offerSettled')?.payload).toMatchObject({ by: 'policy' });
    expect(r.state.offers).toEqual([]);
  });

  it('with no commands at all, every offer is resolved within its life', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0);
    let s = step(s0, [offer(A, B, give, get, 0), offer(B, C, amt('energy', 20), amt('credit', 1), 0), offer(A, C, amt('food', 20), amt('credit', 2), 0)]).state;
    for (let t = 1; t < TUNABLES.offerLifeTicks.value + 1; t++) s = step(s, []).state;
    expect(s.offers).toEqual([]);
  });
});

describe('an offer its maker can no longer pay', () => {
  it('fails cleanly when accepted by command: nothing moves, the maker reneges and loses trust', () => {
    const s0 = tradeWorld();
    const food = stock(s0, A).food;
    const credit = Math.floor((food * s0.prices.food) / 1000);
    const promised = 150;
    const energy = Math.floor((promised * s0.prices.food) / s0.prices.energy);
    // Tick 0: Alpha sells all its food to Delta (a region, which answers at once)
    // and also promises 150 food to Bravo, which it will not have at tick 1.
    const t0 = step(s0, [offer(A, D, amt('food', food), amt('credit', credit), 0), offer(A, B, amt('food', promised), amt('energy', energy), 0)]);
    expect(types(t0.events).filter((t) => t === 'offerSettled')).toHaveLength(1);
    const afterFirst = t0.state;
    expect(stock(afterFirst, A).food).toBeLessThan(promised);
    const quiet = step(afterFirst, []).state;
    const { state, events } = step(afterFirst, [answer('acceptOffer', B, 2, 1)]);
    const failed = events.find((e) => e.type === 'offerFailed');
    expect(failed?.payload).toMatchObject({ reneger: A, by: 'command' });
    expect(failed?.audience).toEqual([A, B]);
    expect(rejections(events)).toEqual([]);
    expect(state.offers).toEqual([]);
    expect(stock(state, A)).toEqual(stock(quiet, A));
    expect(stock(state, B)).toEqual(stock(quiet, B));
    expect(trust(state, B, A)).toBe(trust(quiet, B, A) - TUNABLES.trustPerRenege.value);
    expect(state.nations[A]?.private.reneges).toBe(1);
    expect(state.ledger.offersFailed).toBe(1);
  });

  it('fails cleanly when accepted by policy', () => {
    const s0 = tradeWorld();
    const { give, get } = fairFoodForEnergy(s0, 150);
    const credit = (n: number): number => Math.floor((n * s0.prices.food) / 1000);
    // Tick 0: Alpha promises 150 food to Bravo. Tick 1: it sells all its food to Delta.
    const t0 = step(s0, [offer(A, B, give, get, 0)]).state;
    const food = stock(t0, A).food;
    const t1 = step(t0, [offer(A, D, amt('food', food), amt('credit', credit(food)), 1)]);
    expect(types(t1.events)).toContain('offerSettled');
    // Tick 2 is the offer's last: Bravo's policy accepts, and Alpha cannot deliver.
    expect(t1.state.offers.map((o) => o.expiryTick)).toEqual([TUNABLES.offerLifeTicks.value]);
    const t2 = step(t1.state, []);
    expect(t2.events.find((e) => e.type === 'offerFailed')?.payload).toMatchObject({ reneger: A, by: 'policy' });
    expect(t2.state.offers).toEqual([]);
  });

  it('an accepter who cannot pay is refused at the command and the offer stays open', () => {
    const s0 = tradeWorld();
    const r = step(s0, [offer(A, B, amt('food', 10), amt('energy', 17), 0)]);
    const big = step(r.state, [counter(B, 1, amt('energy', 5), amt('food', 3), 1)]);
    expect(rejections(big.events)).toEqual([]);
    const tooMuch = step(tradeWorld(), [offer(B, A, amt('energy', 20), amt('food', 10_000), 0)]);
    expect(rejections(tooMuch.events)).toEqual(['outside the fair price band; your hard-bargains policy is off']);
    const hard = run(tradeWorld(), [[policy(B, { hardBargains: true }, 0)], [offer(B, A, amt('energy', 20), amt('food', 10_000), 1)]]);
    const accept = step(hard.state, [answer('acceptOffer', A, 1, 2)]);
    expect(rejections(accept.events)).toEqual(['not enough food to pay']);
    expect(accept.state.offers.map((o) => o.id)).toEqual([1]);
  });
});

describe('offer validation', () => {
  const s0 = tradeWorld();
  const reasons = (commands: Command[], s: WorldState = s0): string[] => rejections(step(s, commands).events);

  it('refuses malformed and impossible offers', () => {
    expect(reasons([offer(A, A, amt('food', 1), amt('credit', 1), 0)])).toEqual(['cannot trade with yourself']);
    expect(reasons([offer(A, B, amt('food', 1), amt('food', 1), 0)])).toEqual(['an offer must swap two different resources']);
    expect(reasons([offer(A, B, amt('food', 0), amt('credit', 1), 0)])).toEqual(['give: amount must be a positive whole number']);
    expect(reasons([offer(A, B, amt('food', 1.5), amt('credit', 1), 0)])).toEqual(['give: amount must be a positive whole number']);
    expect(reasons([offer(A, B, { resource: 'gold' as never, amount: 1 }, amt('credit', 1), 0)])).toEqual(['give: unknown resource']);
    expect(reasons([offer(A, B, amt('food', 1_000_000), amt('credit', 111_000), 0)])).toEqual(['not enough food to offer']);
    expect(reasons([offer(D, A, amt('food', 1), amt('credit', 1), 0)])).toEqual(['background regions answer offers but do not make them']);
  });

  it('caps open offers per nation', () => {
    const cap = TUNABLES.maxOpenOffersPerNation.value;
    const commands = Array.from({ length: cap + 1 }, () => offer(A, C, amt('food', 9), amt('credit', 1), 0));
    const r = step(s0, commands);
    expect(r.state.offers).toHaveLength(cap);
    expect(rejections(r.events)).toEqual(['too many open offers']);
  });

  it('refuses answers to offers that are closed, unknown or someone else\'s', () => {
    const made = step(s0, [offer(A, B, amt('food', 10), amt('energy', 17), 0)]).state;
    expect(reasons([answer('acceptOffer', C, 1, 1)], made)).toEqual(['this offer was not made to you']);
    expect(reasons([answer('acceptOffer', B, 99, 1)], made)).toEqual(['offer is no longer open']);
    expect(reasons([answer('acceptOffer', B, 1, 1), answer('rejectOffer', B, 1, 1)], made)).toEqual(['offer is no longer open']);
  });
});

describe('gains from trade (RULES 3.3)', () => {
  const capacity = (s: WorldState, id: typeof A): number => s.nations[id]?.private.capacityE4 ?? 0;

  it('a surplus-to-deficit trade raises both capacities; a credit leg adds nothing more', () => {
    const s0 = tradeWorld();
    const quiet = step(s0, []).state;
    const deficit = s0.nations[B]!.public.food.demand - s0.nations[B]!.public.food.production;
    const traded = step(s0, [offer(A, B, amt('food', deficit), amt('credit', Math.floor((deficit * s0.prices.food) / 1000)), 0), answer('acceptOffer', B, 1, 0)]);
    expect(types(traded.events)).toContain('offerSettled');
    expect(capacity(traded.state, A)).toBeGreaterThan(capacity(quiet, A));
    expect(capacity(traded.state, B)).toBeGreaterThan(capacity(quiet, B));
    expect(traded.state.nations[B]?.private.last.tradeGainCbp).toBe(TUNABLES.gainsFromTradeBp.value * 100);
  });

  it('counts each deficit once per tick, and never between two nations with no surplus', () => {
    const s0 = tradeWorld();
    const deficit = s0.nations[B]!.public.food.demand - s0.nations[B]!.public.food.production;
    const price = Math.floor((deficit * s0.prices.food) / 1000);
    const twice = step(s0, [
      offer(A, B, amt('food', deficit), amt('credit', price), 0),
      offer(A, B, amt('food', deficit), amt('credit', price), 0),
      answer('acceptOffer', B, 1, 0),
      answer('acceptOffer', B, 2, 0),
    ]);
    expect(types(twice.events).filter((t) => t === 'offerSettled')).toHaveLength(2);
    expect(twice.state.nations[B]?.private.last.tradeGainCbp).toBe(TUNABLES.gainsFromTradeBp.value * 100);
    // Charlie is exactly balanced in food: selling it to Bravo is a trade, not a gain.
    // Bravo steps before Charlie in nation order, so it answers on the next tick.
    const made = step(s0, [offer(C, B, amt('food', 10), amt('credit', 1), 0)]).state;
    const noGain = step(made, [answer('acceptOffer', B, 1, 1)]);
    expect(types(noGain.events)).toContain('offerSettled');
    expect(noGain.state.nations[C]?.private.last.tradeGainCbp).toBe(0);
    expect(noGain.state.nations[B]?.private.last.tradeGainCbp).toBe(0);
  });
});
