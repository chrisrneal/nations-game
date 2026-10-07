import { describe, expect, it } from 'vitest';
import type { WmsOrderStatus, WmsOrderView, WmsPickerView, WmsPoView, WmsReceiverView, WmsView } from '@warehouse/contracts';
import { GLIDE_MS, TRUCK_IN_MS, TRUCK_OUT_MS, WmsFloorModel, binCell, doorSpot, floorLayout, length, place, putawayRoute, receiverHome, route, slot, spread, zoneOf, type FloorLayout } from './floorModel.ts';

const SHAPE = { aisles: 4, bays: 20, doors: 2 };
const TICK_MS = 250;

function picker(id: number, over: Partial<WmsPickerView> = {}): WmsPickerView {
  return { id, order: 0, line: 0, at: -1, aisle: 0, bay: 0, walk: 0, picked: 0, units: 0, priority: 0, ...over };
}

function order(no: number, status: WmsOrderStatus, over: Partial<WmsOrderView> = {}): WmsOrderView {
  return { no, status, priority: 3, shortUnits: 0, lines: [{ no: 1, status: 'PICKING', picked: 0 }], ...over } as unknown as WmsOrderView;
}

/** The parts of a WMS View the floor reads. */
function view(over: { pickers?: WmsPickerView[]; orders?: WmsOrderView[]; receivers?: WmsReceiverView[]; pos?: WmsPoView[] } = {}): WmsView {
  return { pickers: over.pickers ?? [], orders: over.orders ?? [], receivers: over.receivers ?? [], pos: over.pos ?? [], stock: [] } as unknown as WmsView;
}

function model(): { m: WmsFloorModel; l: FloorLayout } {
  const m = new WmsFloorModel();
  const l = floorLayout(360, 460, SHAPE);
  m.setLayout(l);
  return { m, l };
}

/** Runs frames of 16 ms from `from` to `to`. */
function frames(m: WmsFloorModel, from: number, to: number): void {
  for (let t = from + 16; t <= to; t += 16) m.advance(t, 16);
}

describe('the WMS floor layout (W7)', () => {
  it('fits a 360 px phone: four aisles of twenty bays between the inbound and outbound bands', () => {
    const l = floorLayout(360, 460, SHAPE);
    expect(l.walk).toHaveLength(4);
    expect(l.inbound.bottom).toBeLessThan(l.rackTop[0] as number);
    expect(l.walk[3] as number).toBeLessThan(l.outbound.top);
    expect(place(l, 0, 20).x).toBeLessThanOrEqual(360 - 8);
    expect(l.bayW).toBeGreaterThan(12);
    expect(l.doors).toHaveLength(2);
    for (const r of [...l.doors, ...Object.values(l.zones)]) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(360);
    }
    expect(binCell(l, 1, 5).bottom).toBeLessThan(place(l, 1, 5).y);
  });

  it('a walk follows the sim’s route: along one aisle, or out to the front cross aisle and in', () => {
    const l = floorLayout(360, 460, SHAPE);
    expect(route(l, { aisle: 1, bay: 3 }, { aisle: 1, bay: 9 })).toEqual([place(l, 1, 3), place(l, 1, 9)]);
    const across = route(l, { aisle: 0, bay: 10 }, { aisle: 2, bay: 5 });
    expect(across).toEqual([place(l, 0, 10), place(l, 0, 0), place(l, 2, 0), place(l, 2, 5)]);
    // Its length on screen is the bays walked, as the sim counts them (the gap between aisles aside).
    expect(length(across)).toBeCloseTo(15 * l.bayW + Math.abs((l.walk[2] as number) - (l.walk[0] as number)), 5);
  });

  it('zones follow the order statuses past picking', () => {
    expect([zoneOf('PICKED'), zoneOf('SHORT'), zoneOf('PACKED'), zoneOf('STAGED'), zoneOf('LOADED'), zoneOf('PICKING'), zoneOf('SHIPPED')]).toEqual(['pack', 'pack', 'packed', 'staging', 'truck', null, null]);
  });
});

describe('pickers on the WMS floor (W7)', () => {
  it('a picker walks to its line’s bin and gets there exactly when the sim says it does', () => {
    const { m, l } = model();
    m.ingest(view({ pickers: [picker(1)] }), 0, TICK_MS, 0, []);
    const start = { x: m.pickers[0]?.x, y: m.pickers[0]?.y };
    expect(start).toEqual({ x: place(l, 0, 0).x + spread(1).x, y: place(l, 0, 0).y + spread(1).y });
    // 20 ticks of walking to C-07: 5 s.
    m.ingest(view({ pickers: [picker(1, { order: 7, line: 1, at: 2 * 160 + 48, aisle: 2, bay: 7, walk: 20, units: 10, priority: 1 })] }), 4, TICK_MS, 1000, []);
    frames(m, 1000, 3500);
    const half = m.pickers[0];
    expect(half?.done).toBeGreaterThan(0);
    expect(half?.done).toBeLessThan(half?.total ?? 0);
    frames(m, 3500, 6000);
    expect({ x: m.pickers[0]?.x, y: m.pickers[0]?.y }).toEqual({ x: place(l, 2, 7).x + spread(1).x, y: place(l, 2, 7).y + spread(1).y });
  });

  it('the sim’s clock wins: a walk the sim shortens or ends is caught up', () => {
    const { m, l } = model();
    m.ingest(view({ pickers: [picker(1)] }), 0, TICK_MS, 0, []);
    m.ingest(view({ pickers: [picker(1, { order: 7, line: 1, aisle: 3, bay: 20, walk: 80 })] }), 4, TICK_MS, 0, []);
    frames(m, 0, 1000);
    m.ingest(view({ pickers: [picker(1, { order: 7, line: 1, aisle: 3, bay: 20, walk: 0 })] }), 8, TICK_MS, 1000, []);
    frames(m, 1000, 1200);
    expect(m.pickers[0]?.x).toBeCloseTo(place(l, 3, 20).x + spread(1).x, 5);
  });

  it('a confirmed line sends a tote down the conveyor to the pack bench and flashes the bin', () => {
    const { m, l } = model();
    const on = picker(2, { order: 9, line: 1, aisle: 1, bay: 4, units: 5, picked: 4, priority: 2 });
    m.ingest(view({ pickers: [on], orders: [order(9, 'PICKING')] }), 0, TICK_MS, 0, []);
    m.ingest(view({ pickers: [picker(2, { aisle: 1, bay: 4 })], orders: [order(9, 'PICKED', { lines: [{ no: 1, status: 'PICKED', picked: 5 }] as never })] }), 4, TICK_MS, 1000, []);
    expect(m.totes).toHaveLength(1);
    expect(m.totes[0]?.priority).toBe(2);
    expect(m.flashes).toEqual([{ aisle: 1, bay: 4, at: 1000, kind: 'pick' }]);
    frames(m, 1000, 6000);
    expect(m.totes).toHaveLength(0);
    // The order itself is now a carton at the pack bench.
    expect(m.cartons.map((c) => [c.order, c.zone])).toEqual([[9, 'pack']]);
    expect({ x: m.cartons[0]?.x, y: m.cartons[0]?.y }).toEqual(slot(l.zones.pack, 0));
  });

  it('a picker taken off its line (hold, reassign) sends no tote', () => {
    const { m } = model();
    m.ingest(view({ pickers: [picker(1, { order: 9, line: 1, aisle: 1, bay: 4 })], orders: [order(9, 'PICKING')] }), 0, TICK_MS, 0, []);
    m.ingest(view({ pickers: [picker(1, { aisle: 1, bay: 4 })], orders: [order(9, 'ON HOLD', { lines: [{ no: 1, status: 'ALLOCATED', picked: 0 }] as never })] }), 4, TICK_MS, 1000, []);
    expect(m.totes).toHaveLength(0);
  });
});

describe('orders, the truck and inbound on the WMS floor (W7)', () => {
  it('cartons glide from zone to zone as orders pack, stage and load; the truck leaves once its orders have shipped', () => {
    const { m, l } = model();
    m.ingest(view({ orders: [order(1, 'PICKED'), order(2, 'PACKED')] }), 0, TICK_MS, 0, []);
    frames(m, 0, GLIDE_MS + 50);
    expect(m.cartons.map((c) => [c.order, c.zone])).toEqual([
      [1, 'pack'],
      [2, 'packed'],
    ]);
    m.ingest(view({ orders: [order(1, 'STAGED'), order(2, 'LOADED')] }), 20, TICK_MS, 1000, []);
    frames(m, 1000, 1000 + GLIDE_MS + 50);
    expect({ x: m.cartons[1]?.x, y: m.cartons[1]?.y }).toEqual(slot(l.zones.truck, 0));
    m.ingest(view({ orders: [order(1, 'LOADED'), order(2, 'SHIPPED')] }), 40, TICK_MS, 2000, [{ order: 2, cents: 1234 }]);
    expect(m.pops.map((p) => p.text)).toEqual(['+$12']);
    frames(m, 2000, 3000);
    // Order 1 is loaded but not shipped: the truck waits for it.
    expect(m.truckShift(3000)).toBe(0);
    m.ingest(view({ orders: [order(1, 'SHIPPED'), order(2, 'SHIPPED')] }), 60, TICK_MS, 4000, [{ order: 1, cents: 500 }]);
    frames(m, 4000, 4000 + TRUCK_OUT_MS / 2);
    expect(m.truckShift(4000 + TRUCK_OUT_MS / 2)).toBeGreaterThan(0.4);
    frames(m, 4000 + TRUCK_OUT_MS / 2, 4000 + TRUCK_OUT_MS + TRUCK_IN_MS + 50);
    expect(m.cartons).toEqual([]);
    expect(m.truckShift(4000 + TRUCK_OUT_MS + TRUCK_IN_MS + 50)).toBe(0);
  });

  it('receivers walk to the door of the PO they count; a forklift reaches the bin when the sim puts the line away', () => {
    const { m, l } = model();
    const rcv = (po: number, door: number): WmsReceiverView => ({ id: 1, po, line: po > 0 ? 1 : 0, door, received: 5, expected: 10 });
    m.ingest(view({ receivers: [rcv(0, 0)] }), 0, TICK_MS, 0, []);
    expect({ x: m.receivers[0]?.x, y: m.receivers[0]?.y }).toEqual(receiverHome(l, 1));
    m.ingest(view({ receivers: [rcv(50_001, 2)] }), 4, TICK_MS, 1000, []);
    frames(m, 1000, 2000);
    expect(m.receivers[0]?.x).toBeCloseTo(doorSpot(l, 2).x + spread(1).x * 2, 5);
    expect(m.receivers[0]?.pct).toBe(0.5);
    const po = (status: 'RECEIVED' | 'STORED'): WmsPoView => ({ no: 50_001, status: 'RECEIVING', door: 2, lines: [{ no: 1, status, putAt: 48, received: 20, aisle: 3, bay: 12 }] }) as unknown as WmsPoView;
    // Received at tick 8, in the bin at tick 48: 10 s of driving.
    m.ingest(view({ pos: [po('RECEIVED')] }), 8, TICK_MS, 2000, []);
    expect(m.forklifts).toHaveLength(1);
    expect(m.forklifts[0]?.total).toBeCloseTo(length(putawayRoute(l, 2, 3, 12)), 5);
    frames(m, 2000, 7000);
    expect(m.forklifts[0]?.done).toBeLessThan(m.forklifts[0]?.total ?? 0);
    frames(m, 7000, 12_100);
    expect(m.forklifts).toHaveLength(0);
    expect(m.flashes.some((f) => f.kind === 'put' && f.aisle === 3 && f.bay === 12)).toBe(true);
    m.ingest(view({ pos: [po('STORED')] }), 52, TICK_MS, 13_000, []);
    expect(m.forklifts).toHaveLength(0);
  });

  it('a tap finds the picker’s order, a carton’s order or the docked PO', () => {
    const { m, l } = model();
    const w = view({ pickers: [picker(1, { order: 5, line: 1, aisle: 1, bay: 6 })], orders: [order(3, 'STAGED')], pos: [{ no: 50_009, status: 'RECEIVING', door: 1, lines: [] } as unknown as WmsPoView] });
    m.ingest(w, 0, TICK_MS, 0, []);
    frames(m, 0, GLIDE_MS + 50);
    const p = m.pickers[0];
    expect(m.hit(p?.x ?? 0, p?.y ?? 0, w)).toEqual({ order: 5 });
    const s = slot(l.zones.staging, 0);
    expect(m.hit(s.x, s.y, w)).toEqual({ order: 3 });
    const d = l.doors[0];
    expect(m.hit(((d?.left ?? 0) + (d?.right ?? 0)) / 2, ((d?.top ?? 0) + (d?.bottom ?? 0)) / 2, w)).toEqual({ po: 50_009 });
  });
});
