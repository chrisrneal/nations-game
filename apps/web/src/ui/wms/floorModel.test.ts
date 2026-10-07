import { describe, expect, it } from 'vitest';
import type { WmsOrderStatus, WmsOrderView, WmsPoView, WmsTaskView, WmsView, WmsWorkerView } from '@warehouse/contracts';
import { GLIDE_MS, TRUCK_IN_MS, TRUCK_OUT_MS, WmsFloorModel, binCell, doorSpot, floorLayout, length, place, receiverHome, route, shipSpot, slot, spread, workerRoute, workerSpot, zoneOf, zoneRect, type FloorLayout } from './floorModel.ts';

const SHAPE = { aisles: 4, bays: 20, doors: 2, shipDoors: 3 };
const TICK_MS = 250;

function task(no: number, over: Partial<WmsTaskView> = {}): WmsTaskView {
  return { no, kind: 'PICK', status: 'ACTIVE', done: 0, qty: 10, priority: 3, ...over } as WmsTaskView;
}

/** A worker as the floor reads it: a picker at the pick-and-drop point unless told otherwise. */
function worker(id: number, over: Partial<WmsWorkerView> = {}): WmsWorkerView {
  return { id, name: `W0${id}`, role: 'pick', state: 'idle', task: null, queue: [], done: [], at: -1, aisle: 0, bay: 0, walk: 0, door: 0, shipDoor: 0, pct: 0, ...over } as WmsWorkerView;
}

function order(no: number, status: WmsOrderStatus, over: Partial<WmsOrderView> = {}): WmsOrderView {
  return { no, status, priority: 3, shortUnits: 0, door: 0, lines: [{ no: 1, status: 'PICKING', picked: 0 }], ...over } as unknown as WmsOrderView;
}

/** The parts of a WMS View the floor reads. */
function view(over: { workers?: WmsWorkerView[]; orders?: WmsOrderView[]; pos?: WmsPoView[] } = {}): WmsView {
  return { workers: over.workers ?? [], orders: over.orders ?? [], pos: over.pos ?? [], stock: [] } as unknown as WmsView;
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
    expect(l.shipCols).toHaveLength(3);
    for (const r of [...l.doors, ...Object.values(l.zones), ...l.shipCols, ...l.lanes, ...l.trailers]) {
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
    expect([zoneOf('PICKED'), zoneOf('SHORT'), zoneOf('PACKED'), zoneOf('STAGED'), zoneOf('LOADED'), zoneOf('PICKING'), zoneOf('SHIPPED')]).toEqual(['pack', 'pack', 'packed', 'lane', 'truck', null, null]);
  });

  it('six outbound doors still fit a 360 px phone, each lane and trailer side by side (W10)', () => {
    const l = floorLayout(360, 460, { ...SHAPE, shipDoors: 6 });
    expect(l.trailers).toHaveLength(6);
    for (let i = 1; i < 6; i++) expect((l.shipCols[i] as { left: number }).left).toBeGreaterThanOrEqual((l.shipCols[i - 1] as { right: number }).right);
    // Room for at least three cartons across each.
    for (const r of l.trailers) expect(r.right - r.left).toBeGreaterThanOrEqual(3 * 8 + 2 * 3);
    expect((l.shipCols[5] as { right: number }).right).toBeLessThanOrEqual(360 - 8);
  });
});

describe('workers on the WMS floor (W7, W8)', () => {
  it('a picker walks to its task’s bin and gets there exactly when the sim says it does', () => {
    const { m, l } = model();
    m.ingest(view({ workers: [worker(1)] }), 0, TICK_MS, 0, []);
    const start = { x: m.workers[0]?.x, y: m.workers[0]?.y };
    expect(start).toEqual({ x: place(l, 0, 0).x + spread(1).x, y: place(l, 0, 0).y + spread(1).y });
    // 20 ticks of walking to C-07: 5 s.
    m.ingest(view({ workers: [worker(1, { task: task(4, { priority: 1 }), at: 2 * 160 + 48, aisle: 2, bay: 7, walk: 20 })] }), 4, TICK_MS, 1000, []);
    frames(m, 1000, 3500);
    const half = m.workers[0];
    expect(half?.done).toBeGreaterThan(0);
    expect(half?.done).toBeLessThan(half?.total ?? 0);
    expect(half?.priority).toBe(1);
    frames(m, 3500, 6000);
    expect({ x: m.workers[0]?.x, y: m.workers[0]?.y }).toEqual({ x: place(l, 2, 7).x + spread(1).x, y: place(l, 2, 7).y + spread(1).y });
  });

  it('the sim’s clock wins: a walk the sim shortens or ends is caught up', () => {
    const { m, l } = model();
    m.ingest(view({ workers: [worker(1)] }), 0, TICK_MS, 0, []);
    m.ingest(view({ workers: [worker(1, { task: task(4), at: 3 * 160 + 152, aisle: 3, bay: 20, walk: 80 })] }), 4, TICK_MS, 0, []);
    frames(m, 0, 1000);
    m.ingest(view({ workers: [worker(1, { task: task(4), at: 3 * 160 + 152, aisle: 3, bay: 20, walk: 0 })] }), 8, TICK_MS, 1000, []);
    frames(m, 1000, 1200);
    expect(m.workers[0]?.x).toBeCloseTo(place(l, 3, 20).x + spread(1).x, 5);
  });

  it('a finished pick task sends a tote down the conveyor to the pack bench and flashes the bin', () => {
    const { m, l } = model();
    m.ingest(view({ workers: [worker(2, { task: task(7, { priority: 2 }), at: 160 + 24, aisle: 1, bay: 4 })], orders: [order(9, 'PICKING')] }), 0, TICK_MS, 0, []);
    m.ingest(view({ workers: [worker(2, { at: 160 + 24, aisle: 1, bay: 4, done: [task(7, { status: 'DONE', done: 5 })] })], orders: [order(9, 'PICKED')] }), 4, TICK_MS, 1000, []);
    expect(m.totes).toHaveLength(1);
    expect(m.totes[0]?.priority).toBe(2);
    expect(m.flashes).toEqual([{ aisle: 1, bay: 4, at: 1000, kind: 'pick' }]);
    frames(m, 1000, 6000);
    expect(m.totes).toHaveLength(0);
    // The order itself is now a carton at the pack bench.
    expect(m.cartons.map((c) => [c.order, c.zone])).toEqual([[9, 'pack']]);
    expect({ x: m.cartons[0]?.x, y: m.cartons[0]?.y }).toEqual(slot(l.zones.pack, 0));
  });

  it('a picker taken off its task (hold, reassign) sends no tote', () => {
    const { m } = model();
    m.ingest(view({ workers: [worker(1, { task: task(7), aisle: 1, bay: 4, at: 184 })], orders: [order(9, 'PICKING')] }), 0, TICK_MS, 0, []);
    m.ingest(view({ workers: [worker(1, { aisle: 1, bay: 4, at: 184 })], orders: [order(9, 'ON HOLD')] }), 4, TICK_MS, 1000, []);
    expect(m.totes).toHaveLength(0);
  });

  it('a receiver stands at the door of the truck it counts, then drives the pallet to its bin and the bin flashes', () => {
    const { m, l } = model();
    const rcv = (over: Partial<WmsWorkerView>): WmsWorkerView => worker(1, { role: 'receive', ...over });
    m.ingest(view({ workers: [rcv({})] }), 0, TICK_MS, 0, []);
    expect({ x: m.workers[0]?.x, y: m.workers[0]?.y }).toEqual(receiverHome(l, 1));
    m.ingest(view({ workers: [rcv({ task: task(3, { kind: 'RECEIVE' }), door: 2, pct: 50 })] }), 4, TICK_MS, 1000, []);
    frames(m, 1000, 2000);
    expect(m.workers[0]?.x).toBeCloseTo(doorSpot(l, 2).x + spread(1).x * 2, 5);
    expect(m.workers[0]?.pct).toBe(0.5);
    expect(m.workers[0]?.kind).toBe('RECEIVE');
    // Put away to D-12: 40 ticks of walking (10 s), out along the dock lane, down the front and along the aisle.
    m.ingest(view({ workers: [rcv({ task: task(4, { kind: 'PUTAWAY' }), at: 3 * 160 + 88, aisle: 3, bay: 12, walk: 40 })] }), 8, TICK_MS, 2000, []);
    const route = workerRoute(l, { dock: true, aisle: 0, bay: 0 }, { dock: false, aisle: 3, bay: 12 }, doorSpot(l, 2), workerSpot(l, { id: 1, role: 'receive', at: 568, aisle: 3, bay: 12, door: 0 }));
    expect(m.workers[0]?.total).toBeGreaterThan(length(route) - 10);
    frames(m, 2000, 7000);
    expect(m.workers[0]?.done).toBeLessThan(m.workers[0]?.total ?? 0);
    frames(m, 7000, 12_100);
    const bin = workerSpot(l, { id: 1, role: 'receive', at: 568, aisle: 3, bay: 12, door: 0 });
    expect(m.workers[0]?.x).toBeCloseTo(bin.x, 5);
    expect(m.workers[0]?.y).toBeCloseTo(bin.y, 5);
    m.ingest(view({ workers: [rcv({ at: 568, aisle: 3, bay: 12, done: [task(4, { kind: 'PUTAWAY', status: 'DONE', done: 20 })] })] }), 60, TICK_MS, 13_000, []);
    expect(m.flashes.some((f) => f.kind === 'put' && f.aisle === 3 && f.bay === 12)).toBe(true);
  });

  it('a dock hand walks down to an outbound door to load: out of the aisle, down the front and along the band (W10)', () => {
    const { m, l } = model();
    const hand = (over: Partial<WmsWorkerView>): WmsWorkerView => worker(1, { role: 'receive', at: 160 + 40, aisle: 1, bay: 6, ...over });
    m.ingest(view({ workers: [hand({})] }), 0, TICK_MS, 0, []);
    m.ingest(view({ workers: [hand({ task: task(5, { kind: 'LOAD' }), at: -12, aisle: 3, bay: 0, shipDoor: 2, walk: 20 })] }), 4, TICK_MS, 1000, []);
    const p = m.workers[0];
    expect(p?.ship).toBe(2);
    expect(p?.path).toContainEqual({ x: l.x0, y: l.shipWalk });
    frames(m, 1000, 6100);
    const spot = shipSpot(l, 2);
    expect(m.workers[0]?.x).toBeCloseTo(spot.x + spread(1).x * 2, 5);
    expect(m.workers[0]?.kind).toBe('LOAD');
  });
});

describe('orders, the truck and inbound on the WMS floor (W7)', () => {
  it('cartons glide to their door’s lane and trailer; the trailer pulls out when its orders ship and the next backs in (W10)', () => {
    const { m, l } = model();
    m.ingest(view({ orders: [order(1, 'PICKED'), order(2, 'PACKED')] }), 0, TICK_MS, 0, []);
    frames(m, 0, GLIDE_MS + 50);
    expect(m.cartons.map((c) => [c.order, c.zone])).toEqual([
      [1, 'pack'],
      [2, 'packed'],
    ]);
    m.ingest(view({ orders: [order(1, 'STAGED', { door: 3 }), order(2, 'LOADED', { door: 2 })] }), 20, TICK_MS, 1000, []);
    frames(m, 1000, 1000 + GLIDE_MS + 50);
    expect({ x: m.cartons[0]?.x, y: m.cartons[0]?.y }).toEqual(slot(zoneRect(l, 'lane', 3), 0));
    expect({ x: m.cartons[1]?.x, y: m.cartons[1]?.y }).toEqual(slot(zoneRect(l, 'truck', 2), 0));
    m.ingest(view({ orders: [order(1, 'LOADED', { door: 3 }), order(2, 'SHIPPED', { door: 2 })] }), 40, TICK_MS, 2000, [{ order: 2, cents: 1234 }]);
    expect(m.pops.map((p) => p.text)).toEqual(['+$12']);
    frames(m, 2000, 2000 + TRUCK_OUT_MS / 2);
    // Door 2's trailer pulls out; door 3's waits for its own time.
    expect(m.truckShift(2, 2000 + TRUCK_OUT_MS / 2)).toBeGreaterThan(0.4);
    expect(m.truckShift(3, 2000 + TRUCK_OUT_MS / 2)).toBe(0);
    frames(m, 2000 + TRUCK_OUT_MS / 2, 2000 + TRUCK_OUT_MS + TRUCK_IN_MS + 50);
    expect(m.cartons.map((c) => c.order)).toEqual([1]);
    expect(m.truckShift(2, 2000 + TRUCK_OUT_MS + TRUCK_IN_MS + 50)).toBe(0);
  });

  it('a tap finds a worker (busy or idle), a carton’s order or the docked PO', () => {
    const { m, l } = model();
    const w = view({ workers: [worker(1, { task: task(4), at: 200, aisle: 1, bay: 6 }), worker(2)], orders: [order(3, 'STAGED', { door: 1 })], pos: [{ no: 50_009, status: 'RECEIVING', door: 1, lines: [] } as unknown as WmsPoView] });
    m.ingest(w, 0, TICK_MS, 0, []);
    frames(m, 0, GLIDE_MS + 50);
    const p = m.workers[0];
    expect(m.hit(p?.x ?? 0, p?.y ?? 0, w)).toEqual({ worker: 1 });
    const idle = m.workers[1];
    expect(m.hit(idle?.x ?? 0, idle?.y ?? 0, w)).toEqual({ worker: 2 });
    const s = slot(zoneRect(l, 'lane', 1), 0);
    expect(m.hit(s.x, s.y, w)).toEqual({ order: 3 });
    const d = l.doors[0];
    expect(m.hit(((d?.left ?? 0) + (d?.right ?? 0)) / 2, ((d?.top ?? 0) + (d?.bottom ?? 0)) / 2, w)).toEqual({ po: 50_009 });
  });
});
