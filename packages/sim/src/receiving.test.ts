import type { WarehouseCommand, WarehouseEvent, WarehouseState, Levels } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { createWarehouse } from './state.ts';
import { step } from './step.ts';
import { poUnitsFor, receiveMilliAt, shelfCapMilliAt, upgradeCost } from './rules.ts';
import { estimate, warehouseView } from './view.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

/** Purchase orders and the shelves (RULES 3a): POs are put away onto the shelves; every order picked takes a unit. */

function run(state: WarehouseState, ticks: number, commands: (s: WarehouseState) => WarehouseCommand[] = () => []): { state: WarehouseState; events: WarehouseEvent[] } {
  const events: WarehouseEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(current, commands(current));
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

const tweak = (s: WarehouseState, patch: Partial<WarehouseState>): WarehouseState => ({ ...s, ...patch });
const withLevels = (s: WarehouseState, levels: Partial<Levels>): WarehouseState => tweak(s, { levels: { ...s.levels, ...levels } });
/** No orders picked: an empty backlog and no new orders (staging full), so only receiving moves the shelves. */
const quietFloor = (s: WarehouseState): WarehouseState => tweak(s, { backlog: 0, staged: 40_000, docks: s.docks.map((g) => ({ ...g, turn: 100_000, turnMax: 100_000 })) });

describe('purchase orders and the shelves (RULES 3a)', () => {
  it('a new warehouse has 60 units on 120 units of shelves and PO 1 of 40 units at the dock', () => {
    const s = createWarehouse({ seed: 1 });
    expect(s.stock).toBe(60_000);
    expect(shelfCapMilliAt(0)).toBe(120_000);
    expect(receiveMilliAt(0)).toBe(500);
    expect(poUnitsFor(500)).toBe(40);
    expect(s.po).toEqual({ id: 1, units: 40, received: 0 });
    expect(s.receiveRush).toBe(0);
  });

  it('puts away 2 units a second; a finished PO is counted and the next one arrives at once', () => {
    const s = quietFloor(createWarehouse({ seed: 1 }));
    const half = run(s, 40).state;
    expect(half.stock - s.stock).toBe(40 * 500);
    expect(half.po).toEqual({ id: 1, units: 40, received: 20_000 });
    const { state, events } = run(half, 40);
    expect(events.filter((e) => e.type === 'received')).toEqual([{ tick: 79, type: 'received', payload: { po: 1, units: 40 } }]);
    expect(state.po).toEqual({ id: 2, units: 40, received: 0 });
    expect(state.run.pos).toBe(1);
    expect(state.run.received).toBe(40);
    expect(state.life.received).toBe(40);
  });

  it('full shelves hold the PO at the dock', () => {
    const s = quietFloor(tweak(createWarehouse({ seed: 1 }), { stock: 119_000 }));
    const { state } = run(s, 10);
    expect(state.stock).toBe(120_000);
    expect(state.po.received).toBe(1000);
  });

  it('each order picked takes a unit; empty shelves hold the pickers to what receiving puts away', () => {
    const s0 = createWarehouse({ seed: 1 });
    const s = tweak(s0, { stock: 300, staged: 0, backlog: 10_000, docks: s0.docks.map((g) => ({ ...g, turn: 100_000, turnMax: 100_000 })) });
    // 0.3 units on the shelf plus 0.5 put away this tick: the pickers' full 0.6 a tick, a unit each.
    const one = step(s, []).state;
    expect(one.staged).toBe(600);
    expect(one.stock).toBe(200);
    expect(one.backlog).toBe(10_000 + 400 - 600);
    // Then the shelves are empty: the pickers get only what receiving puts away.
    const three = run(one, 2).state;
    expect(three.stock).toBe(0);
    expect(three.staged).toBe(3 * 600);
    const four = step(three, []).state;
    expect(four.stock).toBe(0);
    expect(four.staged - three.staged).toBe(500);
    expect(four.backlog).toBe(three.backlog + 400 - 500);
  });

  it('a tap sends extra hands: 2.5x put-away for 2.5 s, and All hands does the same', () => {
    const s = quietFloor(createWarehouse({ seed: 1 }));
    const tapped = step(s, [{ tick: 0, type: 'tapReceive', payload: {} }]).state;
    expect(tapped.stock - s.stock).toBe(1250);
    expect(tapped.receiveRush).toBe(T.rushTicksPerTap.value - 1);
    expect(tapped.run.taps).toBe(1);
    const hands = quietFloor(tweak(createWarehouse({ seed: 1 }), { boosts: { ...s.boosts, allHands: { left: 10, recharge: 100 } } }));
    expect(step(hands, []).state.stock - hands.stock).toBe(1250);
  });

  it('Receiving bay costs $20, then x1.8 a level: +50% put-away, shelves and PO size', () => {
    expect(upgradeCost('receiving', 0)).toBe(2000);
    expect(upgradeCost('receiving', 2)).toBe(6480);
    expect(receiveMilliAt(1)).toBe(750);
    expect(shelfCapMilliAt(1)).toBe(180_000);
    expect(poUnitsFor(750)).toBe(60);
    const view = warehouseView(createWarehouse({ seed: 1 }));
    expect(view.upgrades.find((u) => u.id === 'receiving')).toMatchObject({ name: 'Receiving bay', level: 0, cost: 2000, unit: 'ordersPerSec', now: 2000, next: 3000 });
    const s = tweak(createWarehouse({ seed: 1 }), { cash: 2000 });
    const after = step(s, [{ tick: 0, type: 'buy', payload: { upgrade: 'receiving' } }]);
    expect(after.state.levels.receiving).toBe(1);
    // The PO at the dock keeps its size; the next one is bigger.
    expect(after.state.po.units).toBe(40);
  });

  it('the view shows the shelves, the rate and the PO', () => {
    const s = tweak(createWarehouse({ seed: 1 }), { stock: 33_000, receiveRush: 2 });
    expect(warehouseView(s).receiving).toEqual({ stock: 33_000, shelfCap: 120_000, ratePerTick: 1250, baseRatePerTick: 500, rushed: true, po: { id: 1, units: 40, received: 0 } });
  });
});

describe('the bottleneck names the shelves (RULES 8)', () => {
  const starved = withLevels(createWarehouse({ seed: 1 }), { sales: 6, picking: 6, docks: 4, loading: 10, truck: 1 });

  it('more orders than receiving can stock: the shelves are running empty, fixed by Receiving bay', () => {
    const est = estimate(starved);
    expect(est.bottleneck).toEqual({ kind: 'stock', text: 'The shelves are running empty.', fix: ['receiving'] });
    // Throughput is receiving's 2 a second.
    expect(est.ordersPerSec).toBe(2000);
    expect(warehouseView(starved).boosts.find((b) => b.helps)?.id).toBe('allHands');
  });

  it('the estimate matches a measured warehouse held back by stock within 5%', () => {
    let s = tweak(createWarehouse({ seed: 3 }), { cash: 10 ** 12 });
    for (const [upgrade, times] of [['sales', 6], ['picking', 6], ['docks', 2], ['loading', 10], ['truck', 1], ['receiving', 1]] as const) {
      for (let i = 0; i < times; i++) s = step(s, [{ tick: s.tick, type: 'buy', payload: { upgrade } }]).state;
    }
    expect(estimate(s).bottleneck.kind).toBe('stock');
    const warm = run(s, 2400).state;
    const end = run(warm, 4800).state;
    const measured = ((end.run.earned - warm.run.earned) / 4800) * 4;
    const est = estimate(s).incomePerSec;
    expect(Math.abs(measured - est) / est).toBeLessThan(0.05);
  });
});
