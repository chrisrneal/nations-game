import type { WarehouseCommand, WarehouseState, WmsAction } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { dayStartTick } from './clock.ts';
import { createWarehouse } from './state.ts';
import { advanceMany, step } from './step.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

const CREW = T.wmsStartPickers.value + T.wmsStartReceivers.value;

function act(s: WarehouseState, payload: WmsAction): ReturnType<typeof step> {
  const command: WarehouseCommand = { tick: s.tick, type: 'wms', payload };
  return step(s, [command]);
}

describe('a new warehouse (RULES 3)', () => {
  const s = createWarehouse({ seed: 1 });

  it('opens at tick 0 with no cash, the opening crew and dock doors, and sample orders', () => {
    expect(s.tick).toBe(0);
    expect(s.cash).toBe(T.startingCashCents.value);
    expect(s.wms.workers.filter((p) => p.role === 'pick')).toHaveLength(T.wmsStartPickers.value);
    expect(s.wms.workers.filter((p) => p.role === 'receive')).toHaveLength(T.wmsStartReceivers.value);
    expect(s.wms.workers.map((p) => p.id)).toEqual(Array.from({ length: CREW }, (_, i) => i + 1));
    expect(s.wms.doors).toBe(T.wmsDoors.value);
    expect(s.wms.shipDoors.map((d) => d.door)).toEqual(Array.from({ length: T.wmsShipDoors.value }, (_, i) => i + 1));
    expect(s.wms.orders.length).toBeGreaterThanOrEqual(T.wmsSampleOrdersMin.value);
    expect(s.wms.tasks).toEqual([]);
  });

  it('earns its first cash from shipments within ten minutes, and cash is what shipments paid', () => {
    const later = advanceMany(s, 10 * 240);
    expect(later.wms.stats.shipped).toBeGreaterThan(0);
    expect(later.cash).toBe(later.wms.stats.earned);
    expect(later.cash).toBeGreaterThan(0);
  });
});

describe('commands (RULES 8)', () => {
  it('refuses a command that is not a WMS action, and an action it cannot do', () => {
    const s = createWarehouse({ seed: 2 });
    const bad = step(s, [{ tick: 0, type: 'tap', payload: { dock: 0 } } as unknown as WarehouseCommand]);
    expect(bad.events).toContainEqual({ tick: 0, type: 'rejected', payload: { command: 'wms', reason: 'unknown command' } });
    const broke = act(s, { action: 'hire', role: 'pick' });
    expect(broke.events).toContainEqual({ tick: 0, type: 'rejected', payload: { command: 'wms', reason: 'Not enough cash' } });
    expect(broke.state.wms.workers).toHaveLength(CREW);
  });

  it('a hire costs its price and adds a worker in that role; each further hire costs more', () => {
    const s = { ...createWarehouse({ seed: 2 }), cash: 1_000_000 };
    const one = act(s, { action: 'hire', role: 'pick' });
    expect(one.state.cash).toBe(1_000_000 - T.wmsHireCostCents.value);
    expect(one.state.wms.workers).toHaveLength(CREW + 1);
    expect(one.state.wms.workers[CREW]).toMatchObject({ id: CREW + 1, role: 'pick', task: 0, at: -1 });
    expect(one.state.wms.policy.pickers).toBe(T.wmsStartPickers.value + 1);
    expect(one.state.wms.stats.spent).toBe(T.wmsHireCostCents.value);
    const two = act(one.state, { action: 'hire', role: 'receive' });
    expect(one.state.cash - two.state.cash).toBe((T.wmsHireCostCents.value * T.wmsHireCostGrowthBp.value) / 10_000);
    expect(two.state.wms.policy.pickers).toBe(T.wmsStartPickers.value + 1);
  });

  it('a dock door costs its price, up to the most doors', () => {
    let s: WarehouseState = { ...createWarehouse({ seed: 2 }), cash: 100_000_000 };
    s = act(s, { action: 'door' }).state;
    expect(s.wms.doors).toBe(3);
    expect(s.cash).toBe(100_000_000 - T.wmsDoorCostCents.value);
    s = act(s, { action: 'door' }).state;
    const full = act(s, { action: 'door' });
    expect(full.state.wms.doors).toBe(T.wmsMaxDoors.value);
    expect(full.events).toContainEqual({ tick: s.tick, type: 'rejected', payload: { command: 'wms', reason: 'No room for another door' } });
  });

  it('an outbound door costs its price, its trailer leaves a trailer interval later, up to the most (W10)', () => {
    let s: WarehouseState = { ...createWarehouse({ seed: 2 }), cash: 1_000_000_000 };
    const first = T.wmsShipDoors.value + 1;
    s = act(s, { action: 'door', side: 'out' }).state;
    expect(s.wms.shipDoors).toHaveLength(first);
    expect(s.wms.shipDoors[first - 1]).toEqual({ door: first, trailer: first, departs: T.wmsTrailerTicks.value });
    expect(s.wms.doors).toBe(T.wmsDoors.value);
    expect(s.cash).toBe(1_000_000_000 - T.wmsShipDoorCostCents.value);
    expect(s.wms.events.find((e) => e.code === 'DOOR')).toMatchObject({ line: 2, qty: first });
    while (s.wms.shipDoors.length < T.wmsMaxShipDoors.value) s = act(s, { action: 'door', side: 'out' }).state;
    const full = act(s, { action: 'door', side: 'out' });
    expect(full.events).toContainEqual({ tick: s.tick, type: 'rejected', payload: { command: 'wms', reason: 'No room for another outbound door' } });
  });
});

describe('the warehouse day (RULES 2)', () => {
  it('starts day 2 at midnight and keeps yesterday', () => {
    const s = advanceMany(createWarehouse({ seed: 3 }), dayStartTick(2) - 4);
    expect(s.wms.today.day).toBe(1);
    let r = step(s, []);
    for (let i = 0; i < 4 && !r.events.some((e) => e.type === 'newDay'); i++) r = step(r.state, []);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'newDay', payload: { day: 2 } }));
    expect(r.state.wms.today.day).toBe(2);
    expect(r.state.wms.yesterday?.day).toBe(1);
    expect(r.state.wms.yesterday?.shipped).toBeGreaterThan(0);
  });
});
