import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { NationId } from '@nations/contracts';
import { step } from './step.ts';
import { viewFor } from './view.ts';
import { A, B, C, D, ping, world } from './testkit.ts';
import type { WorldState } from './world.ts';

const IDS = [A, B, C, D];

/** Every key path in a value, e.g. "others.0.public.pingsReceived". */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return [path, ...keyPaths(item, path)];
  });
}

function assertNoForeignPrivate(state: WorldState, selfId: NationId): void {
  const view = viewFor(state, selfId);
  const paths = keyPaths(view);
  // The only `private` object in a View is the viewer's own.
  expect(paths.filter((p) => p.endsWith('private'))).toEqual(['self.private']);
  for (const other of view.others) {
    expect(Object.keys(other).sort()).toEqual(['id', 'name', 'public']);
  }
  expect(view.others.map((o) => o.id)).not.toContain(selfId);
}

describe('per-nation View', () => {
  it('shows the viewer its own private fields', () => {
    const state = step(world(), [ping(A, B, 0)]).state;
    const view = viewFor(state, A);
    expect(view.self.private.pingsSent).toBe(1);
    expect(view.selfController).toBe('ai');
    expect(view.knownNations).toEqual([B, C, D]);
    expect(view.tick).toBe(1);
  });

  it('never contains another nation\'s private fields, in any reachable state (property)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(fc.tuple(fc.constantFrom(...IDS), fc.constantFrom(...IDS)), { maxLength: 40 }),
        (seed, pairs) => {
          let state = world(seed);
          for (const [from, to] of pairs) state = step(state, [ping(from, to, state.tick)]).state;
          for (const id of IDS) assertNoForeignPrivate(state, id);
        },
      ),
    );
  });

  it('does not leak a secret value even through the serialized View', () => {
    // Give every other nation a unique, recognisable secret and search the JSON.
    const base = world(5);
    const nations = { ...base.nations };
    IDS.forEach((id, i) => {
      const n = nations[id];
      if (n !== undefined) nations[id] = { ...n, private: { ...n.private, stocks: { ...n.private.stocks, credit: 7_770_000 + i } } };
    });
    const state: WorldState = { ...base, nations };
    for (const [i, id] of IDS.entries()) {
      const json = JSON.stringify(viewFor(state, id));
      IDS.forEach((_, j) => {
        expect(json.includes(String(7_770_000 + j))).toBe(i === j);
      });
    }
  });

  it('is a copy: changing it cannot touch State', () => {
    const state = world();
    const view = viewFor(state, A) as unknown as { self: { private: { pingsSent: number } } };
    view.self.private.pingsSent = 99;
    expect(state.nations[A]?.private.pingsSent).toBe(0);
  });

  it('refuses an unknown nation', () => {
    expect(() => viewFor(world(), 'ZZZ' as NationId)).toThrow();
  });
});
