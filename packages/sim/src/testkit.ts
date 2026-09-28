import type { Command, ControllerSlot, NationEndowment, NationId, ResourceAmount, StandingPolicy } from '@nations/contracts';
import { createWorld, nationId, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/** Test helpers shared by the sim tests. Not exported from the package. */
export const ROSTER = [
  { id: 'AAA', name: 'Alpha' },
  { id: 'BBB', name: 'Bravo' },
  { id: 'CCC', name: 'Charlie' },
  { id: 'DDD', name: 'Delta' },
] as const;

export const A = nationId('AAA');
export const B = nationId('BBB');
export const C = nationId('CCC');
export const D = nationId('DDD');

export function world(seed = 1): WorldState {
  return createWorld({ seed, roster: ROSTER });
}

type Endowment = Omit<NationEndowment, 'id' | 'name'>;
const base: Endowment = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 1_200, population: 100_000_000 };

/**
 * A small trading world: Alpha grows food and lacks energy, Bravo the reverse,
 * Charlie is balanced, Delta is a background region short of both.
 */
export const TRADE_ROSTER: readonly RosterEntry[] = [
  { id: 'AAA', name: 'Alpha', endowment: { ...base, foodSelfSufficiency: 100, energySelfSufficiency: 10, blocs: ['g20', 'x'], topTradePartners: ['BBB'] } },
  { id: 'BBB', name: 'Bravo', endowment: { ...base, foodSelfSufficiency: 10, energySelfSufficiency: 100, blocs: ['g20', 'x'], topTradePartners: ['AAA'], baselineGrowthBp: 300 } },
  { id: 'CCC', name: 'Charlie', endowment: { ...base, mineralsRefining: 100, mineralsEndowment: 100 } },
  { id: 'DDD', name: 'Delta', endowment: { ...base, kind: 'aggregate', foodSelfSufficiency: 20, energySelfSufficiency: 20 } },
];

export function tradeWorld(seed = 1, controllers?: Record<string, ControllerSlot>): WorldState {
  return createWorld({ seed, roster: TRADE_ROSTER, ...(controllers ? { controllers } : {}) });
}

export function ping(from: NationId, to: NationId, tick: number): Command {
  return { nationId: from, tick, type: 'ping', payload: { target: to } };
}

export function setController(who: NationId, controller: ControllerSlot, tick: number): Command {
  return { nationId: who, tick, type: 'setController', payload: { controller } };
}

export const amt = (resource: ResourceAmount['resource'], amount: number): ResourceAmount => ({ resource, amount });

export function offer(from: NationId, to: NationId, give: ResourceAmount, get: ResourceAmount, tick: number): Command {
  return { nationId: from, tick, type: 'makeOffer', payload: { to, give, get } };
}

export function answer(type: 'acceptOffer' | 'rejectOffer' | 'withdrawOffer', who: NationId, offerId: number, tick: number): Command {
  return { nationId: who, tick, type, payload: { offerId } };
}

export function counter(who: NationId, offerId: number, give: ResourceAmount, get: ResourceAmount, tick: number): Command {
  return { nationId: who, tick, type: 'counterOffer', payload: { offerId, give, get } };
}

export function policy(who: NationId, payload: Partial<StandingPolicy>, tick: number): Command {
  return { nationId: who, tick, type: 'setPolicy', payload };
}

/** Recursively freezes a value, so any mutation in the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
