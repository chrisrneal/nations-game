import { describe, expect, it } from 'vitest';
import type { WarehouseEvent, WarehouseState, WmsAction } from '@warehouse/contracts';
import { warehouseCommandProblem } from '../commands.ts';
import { createWarehouse } from '../state.ts';
import { advanceMany, step } from '../step.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { warehouseView } from '../view.ts';

/** Every SKU's allocated stock is exactly what its waiting and picking lines hold. */
function allocationsBalance(s: WarehouseState): boolean {
  const held = s.wms.inventory.map(() => 0);
  for (const o of s.wms.orders) for (const l of o.lines) if (l.status === 'ALLOCATED' || l.status === 'PICKING') held[l.sku] = (held[l.sku] ?? 0) + l.allocated;
  return s.wms.inventory.every((x) => x.allocated === held[x.sku]);
}

/** One tick with a WMS command. */
function act(s: WarehouseState, payload: WmsAction): { state: WarehouseState; events: readonly WarehouseEvent[] } {
  return step(s, [{ tick: s.tick, type: 'wms', payload }]);
}

function rejected(events: readonly WarehouseEvent[]): string | null {
  const r = events.find((e) => e.type === 'rejected');
  return r?.type === 'rejected' ? r.payload.reason : null;
}

function codes(s: WarehouseState, order: number): string[] {
  return s.wms.events.filter((e) => e.order === order).map((e) => e.code);
}

/** A new warehouse a few ticks in: its sample orders are still NEW (the first wave is at 30 s). */
const fresh = (): WarehouseState => advanceMany(createWarehouse({ seed: 21 }), 8);
/** The same warehouse a minute in: released, allocated, pickers busy. */
const busy = (): WarehouseState => advanceMany(createWarehouse({ seed: 21 }), T.wmsFirstWaveTicks.value + 40);

describe('WMS player actions (slice 7)', () => {
  it('releases the chosen NEW orders as one wave, leaving the rest NEW', () => {
    const s = fresh();
    const [a, b, c] = s.wms.orders.map((o) => o.no) as [number, number, number];
    const { state, events } = act(s, { action: 'release', orders: [a, c] });
    expect(rejected(events)).toBeNull();
    expect(state.wms.orders.filter((o) => o.wave === 1).map((o) => o.no)).toEqual([a, c]);
    expect(state.wms.orders.find((o) => o.no === b)?.status).toBe('NEW');
    expect(codes(state, a)).toContain('WAVE REL');
    expect(events.some((e) => e.type === 'wms' && e.payload.action === 'release')).toBe(true);
    expect(rejected(act(state, { action: 'release', orders: [a] }).events)).toBe('No NEW orders chosen');
  });

  it('changes priority and logs PRIO', () => {
    const s = fresh();
    const o = s.wms.orders.find((x) => x.priority !== 1);
    if (o === undefined) throw new Error('needs a non-P1 order');
    const { state } = act(s, { action: 'priority', order: o.no, priority: 1 });
    expect(state.wms.orders.find((x) => x.no === o.no)?.priority).toBe(1);
    expect(state.wms.events.at(-1)).toMatchObject({ code: 'PRIO', order: o.no, qty: 1 });
    expect(rejected(act(state, { action: 'priority', order: o.no, priority: 1 }).events)).toBe('Already P1');
  });

  it('a hold takes the pickers off the order and stops it; releasing the hold puts it back', () => {
    const s = busy();
    const p = s.wms.pickers.find((x) => x.order > 0);
    if (p === undefined) throw new Error('needs a busy picker');
    let state = act(s, { action: 'hold', order: p.order }).state;
    const held = state.wms.orders.find((o) => o.no === p.order);
    expect(held).toMatchObject({ status: 'ON HOLD', held: 'PICKING' });
    expect(state.wms.pickers.some((x) => x.order === p.order)).toBe(false);
    expect(held?.lines.some((l) => l.status === 'PICKING')).toBe(false);
    state = advanceMany(state, 80);
    expect(state.wms.orders.find((o) => o.no === p.order)?.status).toBe('ON HOLD');
    state = act(state, { action: 'unhold', order: p.order }).state;
    expect(state.wms.orders.find((o) => o.no === p.order)).toMatchObject({ status: 'ALLOCATED', held: null });
    expect(codes(state, p.order)).toEqual(expect.arrayContaining(['HOLD', 'UNHOLD']));
  });

  it('puts a picker on a chosen line; the line it left waits again', () => {
    const s = busy();
    const picker = s.wms.pickers.find((x) => x.order > 0);
    const target = s.wms.orders.flatMap((o) => o.lines.filter((l) => l.status === 'ALLOCATED').map((l) => ({ o, l })))[0];
    if (picker === undefined || target === undefined) throw new Error('needs a busy picker and a waiting line');
    const { state, events } = act(s, { action: 'assign', picker: picker.id, order: target.o.no, line: target.l.no });
    expect(rejected(events)).toBeNull();
    expect(state.wms.pickers.find((x) => x.id === picker.id)).toMatchObject({ order: target.o.no, line: target.l.no });
    const left = state.wms.orders.find((o) => o.no === picker.order)?.lines.find((l) => l.no === picker.line);
    // Its count undone; it waits again, unless an idle picker took it up in the same step.
    expect(left).toMatchObject({ picked: 0 });
    expect(['ALLOCATED', 'PICKING']).toContain(left?.status);
    expect(state.wms.pickers.some((x) => x.id === picker.id && x.order === picker.order && x.line === picker.line)).toBe(false);
    expect(codes(state, target.o.no)).toEqual(expect.arrayContaining(['ASSIGN', 'PICK START']));
  });

  it('cancelling a line gives its stock back; cancelling every line cancels the order', () => {
    let s = busy();
    const o = s.wms.orders.find((x) => x.status === 'ALLOCATED' || x.status === 'PICKING');
    if (o === undefined) throw new Error('needs an allocated order');
    const first = o.lines[0];
    if (first === undefined) throw new Error('order without lines');
    s = act(s, { action: 'cancelLine', order: o.no, line: first.no }).state;
    expect(s.wms.orders.find((x) => x.no === o.no)?.lines[0]?.status).toBe('CANCELLED');
    expect(s.wms.orders.find((x) => x.no === o.no)?.lines[0]).toMatchObject({ allocated: 0, picked: 0, short: 0 });
    expect(allocationsBalance(s)).toBe(true);
    for (const line of o.lines.slice(1)) s = act(s, { action: 'cancelLine', order: o.no, line: line.no }).state;
    expect(s.wms.orders.find((x) => x.no === o.no)?.status).toBe('CANCELLED');
    expect(codes(s, o.no).filter((c) => c === 'CANCEL')).toHaveLength(o.lines.length + 1);
    expect(s.wms.pickers.some((p) => p.order === o.no)).toBe(false);
    expect(allocationsBalance(s)).toBe(true);
  });

  it('an expedite costs cash, makes the order P1 with a later truck, and is allowed once', () => {
    const s0 = { ...fresh(), cash: 1_000_000 };
    const cost = warehouseView(s0).wms.expediteCost;
    const o = s0.wms.orders[0];
    if (o === undefined) throw new Error('no orders');
    const { state, events } = act(s0, { action: 'expedite', order: o.no });
    expect(rejected(events)).toBeNull();
    expect(cost).toBe(warehouseView(s0).pay * T.wmsExpediteCostOrders.value);
    expect(state.cash).toBeLessThanOrEqual(s0.cash - cost + 10_000);
    expect(events.find((e) => e.type === 'wms')).toMatchObject({ payload: { action: 'expedite', order: o.no, cents: cost } });
    expect(state.wms.orders[0]).toMatchObject({ priority: 1, expedited: true, shipBy: o.shipBy + T.wmsExpediteLeadTicks.value });
    expect(rejected(act(state, { action: 'expedite', order: o.no }).events)).toBe('Already expedited');
    expect(rejected(act({ ...fresh(), cash: 0 }, { action: 'expedite', order: o.no }).events)).toBe('Not enough cash');
  });

  it('refuses malformed WMS commands before the step sees them', () => {
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'release', orders: [] } })).toBe('bad orders');
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'priority', order: 1, priority: 4 } })).toBe('bad priority');
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'fly' } })).toBe('unknown WMS action');
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'assign', order: 1, line: 1, picker: 0 } })).toBe('bad assignment');
  });
});
