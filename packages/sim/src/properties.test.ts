import type { WarehouseCommand, WarehouseState, WmsAction } from '@warehouse/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash.ts';
import { WarehouseSession } from './session.ts';
import { createWarehouse } from './state.ts';
import { advanceMany, step } from './step.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { WMS_FIRST_ORDER_NO } from './wms/catalog.ts';

/**
 * The invariants of RULES 12, as properties over random play: random WMS
 * actions (release, priority, hold, assign, cancel, expedite, plan, hire,
 * door in and out) at random ticks, from random seeds and starting cash.
 */
const orderNo = fc.integer({ min: WMS_FIRST_ORDER_NO, max: WMS_FIRST_ORDER_NO + 45 });
const action: fc.Arbitrary<WmsAction> = fc.oneof(
  fc.record({ action: fc.constant('release' as const), orders: fc.array(orderNo, { minLength: 1, maxLength: 5 }) }),
  fc.record({ action: fc.constant('priority' as const), order: orderNo, priority: fc.constantFrom(1 as const, 2 as const, 3 as const) }),
  fc.record({ action: fc.constant('hold' as const), order: orderNo }),
  fc.record({ action: fc.constant('unhold' as const), order: orderNo }),
  fc.record({ action: fc.constant('assign' as const), picker: fc.integer({ min: 1, max: 24 }), order: orderNo, line: fc.integer({ min: 1, max: 5 }) }),
  fc.record({ action: fc.constant('cancelLine' as const), order: orderNo, line: fc.integer({ min: 1, max: 5 }) }),
  fc.record({ action: fc.constant('expedite' as const), order: orderNo }),
  fc.record({
    action: fc.constant('policy' as const),
    policy: fc.record({ pick: fc.constantFrom('priority' as const, 'cutoff' as const, 'nearest' as const), release: fc.constantFrom('waves' as const, 'continuous' as const, 'manual' as const), pickers: fc.integer({ min: 1, max: 20 }) }),
  }),
  fc.record({ action: fc.constant('hire' as const), role: fc.constantFrom('pick' as const, 'receive' as const) }),
  fc.constantFrom({ action: 'door' as const }, { action: 'door' as const, side: 'out' as const }),
);
const move = fc.record({ at: fc.nat(600), action });

interface Game {
  seed: number;
  cash: number;
  moves: { at: number; action: WmsAction }[];
}

const game: fc.Arbitrary<Game> = fc.record({
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
  cash: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 5_000_000 })),
  moves: fc.array(move, { maxLength: 40 }),
});

function commandFor(m: Game['moves'][number]): WarehouseCommand {
  return { tick: m.at, type: 'wms', payload: m.action };
}

function start(g: Game): WarehouseState {
  return { ...createWarehouse({ seed: g.seed }), cash: g.cash };
}

function byTick(moves: Game['moves']): Map<number, WarehouseCommand[]> {
  const map = new Map<number, WarehouseCommand[]>();
  for (const m of moves) map.set(m.at, [...(map.get(m.at) ?? []), commandFor(m)]);
  return map;
}

function play(g: Game, ticks: number, check?: (s: WarehouseState) => void): WarehouseState {
  const cmds = byTick(g.moves);
  let s = start(g);
  for (let i = 0; i < ticks; i++) {
    s = step(s, cmds.get(s.tick) ?? []).state;
    check?.(s);
  }
  return s;
}

function invariants(s: WarehouseState): void {
  const w = s.wms;
  expect(s.cash).toBeGreaterThanOrEqual(0);
  expect(Number.isSafeInteger(s.cash)).toBe(true);
  for (const stock of w.inventory) {
    expect(stock.onHand).toBeGreaterThanOrEqual(0);
    expect(stock.allocated).toBeGreaterThanOrEqual(0);
    expect(stock.allocated).toBeLessThanOrEqual(stock.onHand);
  }
  // The crew (RULES 6): every worker's tasks are its own and of its role; no task is held twice.
  const held = new Set<number>();
  expect(w.workers.length).toBeLessThanOrEqual(T.wmsMaxCrew.value);
  expect(w.policy.pickers).toBe(w.workers.filter((p) => p.role === 'pick').length);
  expect(w.doors).toBeLessThanOrEqual(T.wmsMaxDoors.value);
  expect(w.shipDoors.length).toBeLessThanOrEqual(T.wmsMaxShipDoors.value);
  // Only live tasks are in `tasks`; finished ones are in the history (W10).
  for (const t of w.tasks) expect(['OPEN', 'QUEUED', 'ACTIVE']).toContain(t.status);
  for (const t of w.history) expect(['DONE', 'CANCELLED']).toContain(t.status);
  for (const p of w.workers) {
    expect(p.walk).toBeGreaterThanOrEqual(0);
    expect(p.queue.length + (p.task === 0 ? 0 : 1)).toBeLessThanOrEqual(T.wmsTaskQueue.value);
    for (const no of [p.task, ...p.queue]) {
      if (no === 0) continue;
      expect(held.has(no)).toBe(false);
      held.add(no);
      const t = w.tasks.find((x) => x.no === no);
      expect(t).toBeDefined();
      expect(t?.worker).toBe(p.id);
      expect(t?.status).toBe(no === p.task ? 'ACTIVE' : 'QUEUED');
      expect(t?.kind === 'PICK' ? 'pick' : 'receive').toBe(p.role);
    }
  }
  for (const t of w.tasks) if (t.status === 'ACTIVE' || t.status === 'QUEUED') expect(held.has(t.no)).toBe(true);
  // Outbound (W10): every staged or loaded order is at a door, and no trailer holds more than it can (one big order aside).
  const onDoor = new Map<number, number[]>();
  for (const o of w.orders) {
    const status = o.status === 'ON HOLD' ? o.held : o.status;
    if (status !== 'STAGED' && status !== 'LOADED') continue;
    expect(o.door).toBeGreaterThan(0);
    expect(o.door).toBeLessThanOrEqual(w.shipDoors.length);
    if (status === 'LOADED') onDoor.set(o.door, [...(onDoor.get(o.door) ?? []), o.lines.reduce((n, l) => n + l.picked, 0)]);
  }
  for (const p of w.workers) {
    const t = w.tasks.find((x) => x.no === p.task);
    if (t?.kind === 'LOAD') onDoor.set(-10 - t.bin, [...(onDoor.get(-10 - t.bin) ?? []), t.qty]);
  }
  for (const loads of onDoor.values()) if (loads.length > 1) expect(loads.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(T.wmsTrailerUnits.value);
  // A line being picked has exactly one active pick task.
  for (const o of w.orders) {
    for (const l of o.lines) {
      const active = w.tasks.filter((t) => t.kind === 'PICK' && t.ref === o.no && t.line === l.no && t.status === 'ACTIVE').length;
      expect(active).toBe(l.status === 'PICKING' ? 1 : 0);
      expect(l.picked).toBeLessThanOrEqual(l.ordered);
    }
  }
}

describe('warehouse invariants under random play (RULES 12)', () => {
  it('cash and stock are never negative, and every task is held by at most one worker of its role', () => {
    // The WMS changes only on its step (every wmsStepTicks), so it is checked just after each.
    const checked = (s: WarehouseState): void => {
      if (s.tick % T.wmsStepTicks.value === 1) invariants(s);
    };
    fc.assert(fc.property(game, (g) => void play(g, 700, checked)), { numRuns: 30 });
  }, 60_000);

  it('cash only moves by shipments and what the player pays for', () => {
    fc.assert(
      fc.property(game, (g) => {
        const cmds = byTick(g.moves);
        let s = start(g);
        for (let i = 0; i < 700; i++) {
          const r = step(s, cmds.get(s.tick) ?? []);
          let expected = s.cash;
          for (const e of r.events) {
            if (e.type === 'wmsShipped') expected += e.payload.cents;
            if (e.type === 'wms') expected -= e.payload.cents;
          }
          expect(r.state.cash).toBe(expected);
          s = r.state;
        }
        expect(s.cash).toBe(g.cash + s.wms.stats.earned - s.wms.stats.spent);
      }),
      { numRuns: 20 },
    );
  }, 60_000);

  it('the same seed and the same commands give the same warehouse', () => {
    fc.assert(
      fc.property(game, (g) => {
        expect(hashState(play(g, 400))).toBe(hashState(play(g, 400)));
      }),
      { numRuns: 20 },
    );
  }, 60_000);

  it('different seeds open different warehouses', () => {
    expect(hashState(createWarehouse({ seed: 1 }))).not.toBe(hashState(createWarehouse({ seed: 2 })));
  });
});

describe('catch-up equals stepping (P4)', () => {
  it('advanceMany(n) gives exactly the state of n single steps, from any reachable warehouse', () => {
    fc.assert(
      fc.property(game, fc.integer({ min: 1, max: 3000 }), (g, n) => {
        const reached = play(g, 300);
        let stepped = reached;
        for (let i = 0; i < n; i++) stepped = step(stepped, []).state;
        expect(hashState(advanceMany(reached, n))).toBe(hashState(stepped));
      }),
      { numRuns: 15 },
    );
  }, 60_000);

  it('a session catching up hours quietly equals one stepping tick by tick with events', () => {
    const quiet = new WarehouseSession({ ...createWarehouse({ seed: 9 }), cash: 1_000_000 });
    const loud = new WarehouseSession({ ...createWarehouse({ seed: 9 }), cash: 1_000_000 });
    for (const s of [quiet, loud]) {
      s.submit({ tick: 0, type: 'wms', payload: { action: 'hire', role: 'pick' } });
      s.submit({ tick: 300, type: 'wms', payload: { action: 'policy', policy: { pick: 'nearest', release: 'continuous', pickers: 6 } } });
      s.submit({ tick: 500, type: 'wms', payload: { action: 'door' } });
    }
    quiet.advance(2 * 3600, { events: false });
    loud.advance(2 * 3600);
    expect(quiet.state.tick).toBe(2 * 3600);
    expect(hashState(quiet.state)).toBe(hashState(loud.state));
    expect(quiet.state.wms.workers).toHaveLength(T.wmsStartPickers.value + T.wmsStartReceivers.value + 1);
    expect(quiet.state.wms.doors).toBe(3);
  });
});

describe('saves (S9)', () => {
  it('save, reload and continue matches an uninterrupted run', () => {
    fc.assert(
      fc.property(game, fc.integer({ min: 1, max: 599 }), fc.boolean(), (g, cut, compact) => {
        const commands = g.moves.map(commandFor);
        const straight = new WarehouseSession(start(g));
        const split = new WarehouseSession(start(g));
        for (const c of commands) {
          straight.submit(c);
          split.submit(c);
        }
        straight.advance(600);
        split.advance(cut);
        const file = JSON.parse(JSON.stringify(split.save({ compact }))) as unknown;
        const resumed = WarehouseSession.load(file);
        resumed.advance(600 - cut);
        expect(hashState(resumed.state)).toBe(hashState(straight.state));
      }),
      { numRuns: 20 },
    );
  }, 60_000);

  it('refuses a save that does not replay to its hash, or comes from a newer version', () => {
    const s = new WarehouseSession(createWarehouse({ seed: 1 }));
    s.advance(50);
    const save = s.save();
    expect(() => WarehouseSession.load({ ...save, stateHash: 'nope' })).toThrow(/does not replay/);
    expect(() => WarehouseSession.load({ ...save, schemaVersion: 99 })).toThrow(/newer game version/);
  });
});
