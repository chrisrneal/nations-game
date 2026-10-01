import { describe, expect, it } from 'vitest';
import { AirportSession, advanceMany, createAirport, hashState } from '@nations/sim/airport';
import { AirportEngine, type AirportUpdate } from './engine.ts';
import { FakeClock } from './testClock.ts';

function engine(): { clock: FakeClock; engine: AirportEngine; seen: AirportUpdate[] } {
  const clock = new FakeClock();
  const e = new AirportEngine(clock);
  const seen: AirportUpdate[] = [];
  e.subscribe((u) => seen.push(u));
  return { clock, engine: e, seen };
}

describe('AirportEngine (the host clock, S4)', () => {
  it('runs a new airport by the wall clock: the first plane leaves after 5 s', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(42);
    expect(seen.at(-1)?.view.tick).toBe(0);
    for (let i = 0; i < 20; i++) clock.advance(250);
    expect(seen.at(-1)?.view.tick).toBe(20);
    expect(seen.flatMap((u) => u.events).some((ev) => ev.type === 'departed')).toBe(true);
    expect(seen.at(-1)?.view.cash).toBe(1250);
  });

  it('stamps intents for the next tick and applies them', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(1);
    e.submit({ type: 'tap', payload: { gate: 0 } });
    clock.advance(250);
    expect(seen.at(-1)?.view.gates[0]?.rush).toBeGreaterThan(0);
    expect(() => e.submit({ type: 'buy', payload: { upgrade: 'spaceport' as 'gates' } })).toThrow();
  });

  it('a late timer catches up exactly, animating only the last few ticks', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    clock.advance(3_600_000);
    const last = seen.at(-1);
    expect(last?.view.tick).toBe(14_400);
    expect(last?.fingerprint).toBe(hashState(advanceMany(createAirport({ seed: 5 }), 14_400)));
    expect(last?.events.every((ev) => ev.tick >= 14_400 - 8)).toBe(true);
  });

  it('pauses while hidden and catches up the whole gap on resume', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    e.pause();
    expect(clock.running).toBe(0);
    clock.time += 60_000;
    e.resume();
    expect(seen.at(-1)?.view.tick).toBe(240);
    expect(clock.running).toBe(1);
  });

  it('exports and imports the same airport, then owes the time since', () => {
    const { clock, engine: e } = engine();
    e.newGame(8);
    e.submit({ type: 'tap', payload: { gate: 0 } });
    clock.advance(10_000);
    const saved = e.exportGame();
    const fingerprint = e.current()?.fingerprint;
    const other = new AirportEngine(clock);
    expect(other.importGame(saved).fingerprint).toBe(fingerprint);
    clock.time += 2_500;
    const after = other.pump();
    expect(after?.view.tick).toBe(50);
    const expected = new AirportSession(createAirport({ seed: 8 }));
    expected.submit({ tick: 0, type: 'tap', payload: { gate: 0 } });
    expected.advance(50);
    expect(after?.fingerprint).toBe(hashState(expected.state));
  });
});
