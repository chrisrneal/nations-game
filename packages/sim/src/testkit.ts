import type { Command, ControllerSlot, NationId } from '@nations/contracts';
import { createWorld, nationId, type WorldState } from './world.ts';

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

export function ping(from: NationId, to: NationId, tick: number): Command {
  return { nationId: from, tick, type: 'ping', payload: { target: to } };
}

export function setController(who: NationId, controller: ControllerSlot, tick: number): Command {
  return { nationId: who, tick, type: 'setController', payload: { controller } };
}

/** Recursively freezes a value, so any mutation in the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
