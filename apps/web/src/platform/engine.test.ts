import { describe, expect, it } from 'vitest';
import type { WarehouseIntent } from '@warehouse/contracts';
import { WarehouseSession, advanceMany, createWarehouse, hashState } from '@warehouse/sim';
import { DEFAULT_SPEED } from './clock.ts';
import { WarehouseEngine, type WarehouseUpdate } from './engine.ts';
import { FakeClock } from './testClock.ts';

/** A plan change: the WMS action these tests send. */
const PLAN: WarehouseIntent = { type: 'wms', payload: { action: 'policy', policy: { pick: 'nearest', release: 'waves', pickers: 6 } } };
/** The offline cap (8 hours) in ticks. */
const CAP = 8 * 14_400;

/** An engine on a hand-wound clock, at 1 warehouse minute a second unless a speed is given (W9). */
function engine(speed = 1): { clock: FakeClock; engine: WarehouseEngine; seen: WarehouseUpdate[] } {
  const clock = new FakeClock();
  const e = new WarehouseEngine(clock, speed);
  const seen: WarehouseUpdate[] = [];
  e.subscribe((u) => seen.push(u));
  return { clock, engine: e, seen };
}

describe('WarehouseEngine (the host clock, S4)', () => {
  it('runs a new warehouse by the wall clock: orders ship and pay within five minutes', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(42);
    expect(seen.at(-1)?.view.tick).toBe(0);
    for (let i = 0; i < 1200; i++) clock.advance(250);
    expect(seen.at(-1)?.view.tick).toBe(1200);
    const shipped = seen.flatMap((u) => u.events).filter((ev) => ev.type === 'wmsShipped');
    expect(shipped.length).toBeGreaterThan(0);
    expect(seen.at(-1)?.view.cash).toBe(shipped.reduce((n, ev) => n + (ev.type === 'wmsShipped' ? ev.payload.cents : 0), 0));
  });

  it('stamps intents for the next tick and applies them', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(1);
    e.submit(PLAN);
    clock.advance(250);
    expect(seen.at(-1)?.view.wms.policy.pick).toBe('nearest');
    expect(() => e.submit({ type: 'buy', payload: { upgrade: 'docks' } } as unknown as WarehouseIntent)).toThrow();
  });

  it('a late timer catches up exactly, animating only the last few ticks', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    clock.advance(3_600_000);
    const last = seen.at(-1);
    expect(last?.view.tick).toBe(14_400);
    expect(last?.fingerprint).toBe(hashState(advanceMany(createWarehouse({ seed: 5 }), 14_400)));
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

  it('exports and imports the same warehouse, then owes the time since', () => {
    const { clock, engine: e } = engine();
    e.newGame(8);
    e.submit(PLAN);
    clock.advance(10_000);
    const saved = e.exportGame();
    const fingerprint = e.current()?.fingerprint;
    const other = new WarehouseEngine(clock);
    expect(other.importGame(saved).fingerprint).toBe(fingerprint);
    clock.time += 2_500;
    const after = other.pump();
    expect(after?.view.tick).toBe(50);
    const expected = new WarehouseSession(createWarehouse({ seed: 8 }));
    expected.submit({ ...PLAN, tick: 0 });
    expected.advance(50);
    expect(after?.fingerprint).toBe(hashState(expected.state));
  });

  it('a short gap is played live, with no recap', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    clock.advance(30_000);
    expect(seen.at(-1)?.recap).toBeNull();
    expect(seen.at(-1)?.view.tick).toBe(120);
  });

  it('an absence of an hour is caught up in full and summed up in a recap', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    e.pause();
    clock.time += 3_600_000;
    e.resume();
    const last = seen.at(-1);
    expect(last?.view.tick).toBe(14_400);
    expect(last?.recap).toMatchObject({ awayMs: 3_600_000, ranMs: 3_600_000, capMinutes: 480, days: 2 });
    expect(last?.recap?.earned).toBe(last?.view.wms.stats.earned);
    expect(last?.recap?.shipped).toBeGreaterThan(100);
    expect(last?.recap?.otif).toBeLessThanOrEqual(last?.recap?.shipped ?? 0);
    expect(last?.recap?.pos).toBeGreaterThan(10);
    expect(e.dismissRecap().recap).toBeNull();
  });

  it('the offline cap stops the warehouse after 8 hours; the rest of the absence is lost', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(5);
    e.pause();
    clock.time += 10 * 3_600_000;
    e.resume();
    const last = seen.at(-1);
    expect(last?.view.tick).toBe(CAP);
    expect(last?.recap).toMatchObject({ awayMs: 10 * 3_600_000, ranMs: 8 * 3_600_000 });
    // The clock starts again from now, not from the end of the cap.
    clock.advance(250);
    expect(seen.at(-1)?.view.tick).toBe(CAP + 1);
  });

  it('a capped catch-up equals stepping the capped ticks (P4)', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(77);
    e.submit(PLAN);
    clock.advance(250);
    e.pause();
    clock.time += 9 * 3_600_000;
    e.resume();
    const expected = new WarehouseSession(createWarehouse({ seed: 77 }));
    expected.submit({ ...PLAN, tick: 0 });
    expected.advance(1 + CAP);
    expect(seen.at(-1)?.fingerprint).toBe(hashState(expected.state));
  });

  it('reopening a save from yesterday runs the cap and writes the recap', () => {
    const { clock, engine: e } = engine();
    e.newGame(3);
    clock.advance(1000);
    const saved = e.exportGame();
    clock.time += 24 * 3_600_000;
    const other = new WarehouseEngine(clock, 1);
    const update = other.importGame(saved);
    expect(update.recap?.ranMs).toBe(8 * 3_600_000);
    expect(update.view.tick).toBe(4 + CAP);
  });

  it('the testing skip runs the warehouse ahead exactly as catching up would, with no cap, and owes nothing after', () => {
    const { clock, engine: e, seen } = engine();
    e.newGame(8);
    const skipped = e.skip(5 * 60);
    expect(skipped.view.tick).toBe(5 * 3600 * 4);
    expect(skipped.fingerprint).toBe(hashState(advanceMany(createWarehouse({ seed: 8 }), 5 * 3600 * 4)));
    expect(skipped.recap?.ranMs).toBe(5 * 3600 * 1000);
    expect(skipped.recap?.earned).toBeGreaterThan(0);
    clock.advance(250);
    expect(seen.at(-1)?.view.tick).toBe(5 * 3600 * 4 + 1);
  });
});

describe('WarehouseEngine speed (W9: the host clock runs the warehouse faster or not at all)', () => {
  it('runs at 5 warehouse minutes a second by default: a real second is 20 ticks', () => {
    const clock = new FakeClock();
    const e = new WarehouseEngine(clock);
    e.newGame(42);
    for (let i = 0; i < 4; i++) clock.advance(250);
    const last = e.current();
    expect(last?.speed).toBe(DEFAULT_SPEED);
    expect(last?.view.tick).toBe(20);
    expect(last?.view.clock.minute).toBe(6 * 60 + 5);
    expect(last?.fingerprint).toBe(hashState(advanceMany(createWarehouse({ seed: 42 }), 20)));
  });

  it('a speed change steps the time owed at the old speed first, then runs at the new one; 0 pauses', () => {
    const { clock, engine: e, seen } = engine(1);
    e.newGame(7);
    clock.time += 1000;
    expect(e.setSpeed(10).view.tick).toBe(4);
    clock.advance(1000);
    expect(seen.at(-1)?.view.tick).toBe(4 + 40);
    e.setSpeed(0);
    clock.advance(3_600_000);
    expect(seen.at(-1)?.view.tick).toBe(44);
    expect(seen.at(-1)?.speed).toBe(0);
    e.setSpeed(5);
    clock.advance(1000);
    expect(seen.at(-1)?.view.tick).toBe(44 + 20);
    expect(() => e.setSpeed(3)).toThrow(/Unknown speed/);
  });

  it('a player’s action is answered live at 10x: the step that applies it is not caught up quietly', () => {
    const { clock, engine: e, seen } = engine(10);
    e.newGame(1);
    e.submit(PLAN);
    clock.advance(250);
    expect(seen.at(-1)?.events.some((ev) => ev.type === 'wms')).toBe(true);
    expect(seen.at(-1)?.view.tick).toBe(10);
  });

  it('away time runs at the speed too, and the cap is the same ticks: at 5 it stops after 96 real minutes', () => {
    const { clock, engine: e, seen } = engine(5);
    e.newGame(5);
    e.pause();
    clock.time += 30 * 60_000;
    e.resume();
    expect(seen.at(-1)?.view.tick).toBe(30 * 60 * 20);
    expect(seen.at(-1)?.recap).toMatchObject({ awayMs: 30 * 60_000, ranMs: 30 * 60_000, capMinutes: 96 });
    e.pause();
    clock.time += 3 * 3_600_000;
    e.resume();
    expect(seen.at(-1)?.view.tick).toBe(30 * 60 * 20 + CAP);
    expect(seen.at(-1)?.recap).toMatchObject({ awayMs: 3 * 3_600_000, ranMs: 96 * 60_000, capMinutes: 96 });
  });

  it('the speed is kept with the save; a save from before speeds catches up at 1, then runs at the default', () => {
    const { clock, engine: e } = engine(10);
    e.newGame(9);
    clock.advance(250);
    const saved = e.exportGame();
    expect(saved.speed).toBe(10);
    clock.time += 1000;
    const other = new WarehouseEngine(clock, 1);
    expect(other.importGame(saved)).toMatchObject({ speed: 10, view: { tick: 10 + 40 } });
    const old = { save: saved.save, anchor: saved.anchor };
    const third = new WarehouseEngine(clock, 1);
    const resumed = third.importGame(old);
    expect(resumed.speed).toBe(DEFAULT_SPEED);
    expect(resumed.view.tick).toBe(10 + 4);
  });
});
