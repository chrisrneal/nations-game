import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Command } from '@nations/contracts';
import { hashState } from './hash.ts';
import { step } from './step.ts';
import { TUNABLES } from './tunables.ts';
import { A, B, C, D, deepFreeze, ping, setController, world } from './testkit.ts';

describe('step', () => {
  it('advances the tick by exactly one, with or without commands', () => {
    const s0 = world();
    expect(step(s0, []).state.tick).toBe(1);
    expect(step(step(s0, []).state, [ping(A, B, 1)]).state.tick).toBe(2);
  });

  it('applies the placeholder ping: sender private count, target public count, no RNG draw of its own', () => {
    const { state, events } = step(world(), [ping(A, B, 0)]);
    expect(state.nations[A]?.private.pingsSent).toBe(1);
    expect(state.nations[B]?.public.pingsReceived).toBe(1);
    // The only draw is the monthly pandemic roll (RULES 4.2), made with or without the ping.
    expect(state.rng).toEqual(step(world(), []).state.rng);
    expect(events.filter((e) => e.type === 'pinged')).toEqual([{ tick: 0, type: 'pinged', payload: { from: A, to: B }, audience: [A, B] }]);
  });

  it('switches a controller slot mid-game with a public event', () => {
    const { state, events } = step(world(), [setController(C, 'caretaker', 0)]);
    expect(state.controllers[C]).toBe('caretaker');
    expect(events[0]).toMatchObject({ type: 'controllerChanged', audience: [] });
    const back = step(state, [setController(C, 'human', 1)]).state;
    expect(back.controllers[C]).toBe('human');
  });

  it('rejects invalid commands with a private event and leaves state alone', () => {
    const bad: Command[] = [
      ping(A, B, 5),
      ping(A, A, 0),
      { nationId: A, tick: 0, type: 'conquer', payload: {} },
      { nationId: 'ZZZ' as never, tick: 0, type: 'ping', payload: { target: B } },
      { nationId: A, tick: 0, type: 'ping', payload: null },
      { nationId: A, tick: 0, type: 'setController', payload: { controller: 'god' } },
    ];
    const s0 = world();
    const { state, events } = step(s0, bad);
    expect(events.map((e) => e.type)).toEqual(Array(bad.length).fill('commandRejected'));
    expect(events.find((e) => (e.payload as { reason: string }).reason === 'wrong tick')?.audience).toEqual([A]);
    expect(hashState(state)).toBe(hashState(step(s0, []).state));
  });

  it('enforces the per-nation per-tick command limit', () => {
    const limit = TUNABLES.maxCommandsPerNationPerTick.value;
    const commands = Array.from({ length: limit + 2 }, () => ping(A, B, 0));
    const { state, events } = step(world(), commands);
    expect(state.nations[A]?.private.pingsSent).toBe(limit);
    expect(events.filter((e) => e.type === 'commandRejected')).toHaveLength(2);
  });

  it('does not depend on arrival order across nations', () => {
    const cmds = [ping(A, B, 0), ping(C, D, 0), ping(B, A, 0), ping(D, C, 0), ping(A, C, 0)];
    const reversed = [...cmds].reverse();
    // Reversing also flips A's two pings; keep each nation's own order intact.
    const acrossOnly = [cmds[1], cmds[3], cmds[0], cmds[2], cmds[4]] as Command[];
    expect(hashState(step(world(), cmds).state)).toBe(hashState(step(world(), acrossOnly).state));
    expect(step(world(), reversed).state.tick).toBe(1);
  });

  it('never mutates its inputs (property)', () => {
    const ids = [A, B, C, D];
    const commandArb = fc.oneof(
      fc.record({ from: fc.constantFrom(...ids), to: fc.constantFrom(...ids) }).map(({ from, to }) => ping(from, to, 0)),
      fc
        .record({ who: fc.constantFrom(...ids), slot: fc.constantFrom('human', 'ai', 'caretaker') as fc.Arbitrary<'human' | 'ai' | 'caretaker'> })
        .map(({ who, slot }) => setController(who, slot, 0)),
    );
    fc.assert(
      fc.property(fc.integer(), fc.array(commandArb, { maxLength: 30 }), (seed, commands) => {
        const s0 = deepFreeze(world(seed));
        const before = hashState(s0);
        deepFreeze(commands);
        const { state } = step(s0, commands);
        expect(hashState(s0)).toBe(before);
        for (const id of ids) {
          expect(state.nations[id]?.private.pingsSent).toBeGreaterThanOrEqual(0);
          expect(state.nations[id]?.public.pingsReceived).toBeGreaterThanOrEqual(0);
        }
        const sent = ids.reduce((sum, id) => sum + (state.nations[id]?.private.pingsSent ?? 0), 0);
        const received = ids.reduce((sum, id) => sum + (state.nations[id]?.public.pingsReceived ?? 0), 0);
        expect(sent).toBe(received);
      }),
    );
  });
});
