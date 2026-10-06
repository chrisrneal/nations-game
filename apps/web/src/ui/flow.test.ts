import type { WarehouseEvent, WarehouseView, DockView, Stats } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { DOTS_MAX, FlowModel, MAZE_MAX, Path, choosePerDot, mazePath, parcelSpots, visible, type FlowGeometry } from './flow.ts';

const STATS: Stats = { earned: 0, shipments: 0, fullShipments: 0, orders: 0, missed: 0, expresses: 0, pos: 0, received: 0, taps: 0 };

function dock(index: number, over: Partial<DockView> = {}): DockView {
  return { index, truck: index + 1, parcels: 10, loaded: 0, timer: 60, timerMax: 60, turn: 0, turnMax: 0, rush: 0, express: false, model: 'Cargo bike', rate: 500, rushed: false, ...over };
}

/** The parts of a View the flow reads; the rest is never touched. */
function view(
  tick: number,
  over: { staged?: number; orderPerTick?: number; missed?: number; docks?: DockView[]; site?: number; backlog?: number; po?: { id: number; units: number; received: number }; stock?: number } = {},
): WarehouseView {
  return {
    tick,
    tickMs: 250,
    staging: { staged: over.staged ?? 10_000, cap: 40_000, orderPerTick: over.orderPerTick ?? 400 },
    picking: { backlog: over.backlog ?? 0, cap: 72_000, ratePerTick: 600, baseRatePerTick: 600, rushed: false, waitTicks: 0, slowBp: 10_000 },
    receiving: { stock: over.stock ?? 60_000, shelfCap: 120_000, ratePerTick: 600, baseRatePerTick: 600, rushed: false, po: over.po ?? { id: 1, units: 48, received: 0 } },
    docks: over.docks ?? [dock(0)],
    site: { index: over.site ?? 0, name: 'Millbrook Depot', twist: '' },
    run: { ...STATS, missed: over.missed ?? 0 },
  } as unknown as WarehouseView;
}

const GEO: FlowGeometry = {
  inbound: { y: 30, start: 40, booths: [{ left: 60, right: 80 }], shelves: { left: 90, right: 330 } },
  door: { x: 10, y: 55 },
  checkin: { left: 14, right: 60, y: 55 },
  maze: { left: 14, right: 280, entry: 64, rows: [55, 70, 85] },
  pickers: { enter: { x: 284, y: 85 }, exit: { x: 310, y: 85 } },
  after: [{ left: 290, right: 330 }],
  afterY: 110,
  staging: { left: 20, top: 104, right: 285, bottom: 116 },
  pier: { x: 175, top: 122 },
  docks: [
    { x: 120, door: 140, y: 160, parcels: [] },
    { x: 230, door: 140, y: 160, parcels: [] },
  ],
};

/** Feeds `n` one-tick updates, starting from `from`. */
function feed(model: FlowModel, from: number, n: number, make: (tick: number) => WarehouseView, events: (tick: number) => WarehouseEvent[] = () => []): number {
  for (let t = from; t < from + n; t++) model.ingest(make(t), events(t), t * 250);
  return from + n;
}

describe('orders per dot', () => {
  it('shows one dot an order at the start, and fewer dots per order as the warehouse grows', () => {
    expect(choosePerDot(1.6, 1)).toBe(1);
    expect(choosePerDot(30, 1)).toBe(10);
    expect(choosePerDot(640, 1)).toBe(200);
  });

  it('keeps its scale through small swings (Sunvale waves)', () => {
    expect(choosePerDot(4.8, 1)).toBe(1);
    expect(choosePerDot(15, 5)).toBe(5);
    expect(choosePerDot(3, 5)).toBe(1);
  });
});

describe('goods on the floor (RULES 14)', () => {
  it('sends one dot in at the order desk per order joining the backlog', () => {
    const model = new FlowModel();
    // 1.6 orders a second for 10 seconds.
    feed(model, 0, 41, (t) => view(t));
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(16);
  });

  it('cancels orders at the door when the backlog is full', () => {
    const model = new FlowModel();
    feed(model, 0, 41, (t) => view(t, { staged: 40_000, backlog: 72_000, missed: t * 400 }));
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
    expect(model.dots.filter((d) => d.kind === 'away')).toHaveLength(16);
    expect(model.turningAway).toBe(true);
    expect(model.staging).toBe(1);
  });

  it('carries a dot from packing to its dock for each order loaded', () => {
    const model = new FlowModel();
    feed(model, 0, 21, (t) => view(t, { orderPerTick: 0, docks: [dock(0), dock(1, { loaded: t * 500 })] }));
    const loading = model.dots.filter((d) => d.kind === 'board');
    expect(loading).toHaveLength(10);
    expect(loading.every((d) => d.dock === 1)).toBe(true);
  });

  it('counts the orders on a truck that left between two updates', () => {
    const model = new FlowModel();
    model.ingest(view(0, { orderPerTick: 0, docks: [dock(0, { loaded: 8000 })] }), [], 0);
    const left: WarehouseEvent = { tick: 0, type: 'departed', payload: { dock: 0, truck: 1, orders: 10, parcels: 10, cents: 1250, full: true, express: false } };
    model.ingest(view(1, { orderPerTick: 0, docks: [dock(0, { loaded: 0, turn: 18, turnMax: 18 })] }), [left], 250);
    expect(model.dots.filter((d) => d.kind === 'board')).toHaveLength(2);
  });

  it('moves a dot from the PO to the shelves for each unit put away, through quality check', () => {
    const model = new FlowModel();
    // 2.4 units a second put away for 10 seconds, a new PO half way.
    feed(model, 0, 41, (t) => view(t, { orderPerTick: 0, po: t < 20 ? { id: 1, units: 12, received: t * 600 } : { id: 2, units: 48, received: (t - 20) * 600 } }));
    const stock = model.dots.filter((d) => d.kind === 'arr');
    expect(stock).toHaveLength(24);
    expect(stock.every((d) => d.tint === 'in')).toBe(true);
    let now = 41 * 250;
    let hidden = 0;
    for (let i = 0; i < 2000 && model.dots.length > 0; i++) {
      model.advance(16, (now += 16), GEO);
      hidden = Math.max(hidden, model.dots.filter((d) => !visible(d, now)).length);
      // Along the lane, never into the maze.
      expect(model.dots.every((d) => Math.abs(d.y - GEO.inbound.y) < 4 && d.x >= GEO.inbound.start - 1)).toBe(true);
    }
    expect(hidden).toBeGreaterThan(0);
    expect(model.dots).toHaveLength(0);
  });

  it('carries a packed order down the aisle, along the walkway and in at the bay door', () => {
    const model = new FlowModel();
    model.ingest(view(0, { orderPerTick: 0, docks: [dock(0), dock(1)] }), [], 0);
    model.ingest(view(1, { orderPerTick: 0, docks: [dock(0), dock(1, { loaded: 1000 })] }), [], 250);
    const seen: { x: number; y: number }[] = [];
    let now = 250;
    for (let i = 0; i < 400 && model.dots.length > 0; i++) {
      model.advance(16, (now += 16), GEO);
      const d = model.dots[0];
      if (d !== undefined) seen.push({ x: d.x, y: d.y });
    }
    expect(model.dots).toHaveLength(0);
    // Above the walkway it keeps to the aisle; it only leaves it along the walkway, and loads at the bay's middle.
    expect(seen.filter((p) => p.y < 138).every((p) => Math.abs(p.x - GEO.pier.x) < 4)).toBe(true);
    expect(seen.filter((p) => p.y > 142).every((p) => Math.abs(p.x - 230) < 0.5)).toBe(true);
    const last = seen[seen.length - 1];
    expect(Math.hypot((last?.x ?? 0) - 230, (last?.y ?? 0) - 160)).toBeLessThan(3);
  });

  it('keeps each parked truck\'s load for its parcels, and none while the truck is away', () => {
    const model = new FlowModel();
    model.ingest(view(0, { docks: [dock(0, { loaded: 2500 }), dock(1, { turn: 4, turnMax: 18, express: true })] }), [], 0);
    expect(model.loads).toEqual([
      { share: 0.25, parcels: 10, express: false },
      { share: null, parcels: 10, express: true },
    ]);
  });

  it('loads a truck front row first, from the middle out, inside its trailer', () => {
    const box = { left: 0, top: 0, right: 44, bottom: 30 };
    const parcels = parcelSpots(box);
    expect(parcels).toHaveLength(4 * 2 * 6);
    expect(parcels.every((p) => p.x > 0 && p.x < 44 && p.y > 0 && p.y < 30)).toBe(true);
    // The first two face each other across the aisle in the front row.
    expect(parcels[0]?.y).toBe(parcels[1]?.y);
    expect((parcels[0]?.x ?? 0) + (parcels[1]?.x ?? 0)).toBe(44);
    expect(parcels.every((p, i) => i === 0 || p.y >= (parcels[i - 1]?.y ?? 0))).toBe(true);
  });

  it('walks the maze as a snake: along each row, turning at alternate ends, into the pickers', () => {
    const path = new Path(mazePath(GEO.maze));
    expect(path.length).toBe(216 + 15 + 266 + 15 + 266);
    expect(path.at(0)).toEqual({ x: 64, y: 55 });
    expect(path.at(216 + 15 + 266)).toEqual({ x: 14, y: 70 });
    expect(path.at(path.length)).toEqual({ x: 280, y: 85 });
  });

  it('the line in the maze is the real backlog: orders wait in it while picking holds them', () => {
    const model = new FlowModel();
    // 1.6 a second join; picking lets nobody through (a full staging): the line grows by 0.4 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { backlog: 0 }));
    tick = feed(model, tick, 80, (t) => view(t, { backlog: t * 400 }));
    let now = tick * 250;
    for (let i = 0; i < 1200; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(32);
    expect(model.queue.length).toBeGreaterThanOrEqual(30);
    expect(model.queue.length).toBeLessThanOrEqual(34);
    // They wait head to tail, the head at the pickers, in the order they came.
    const path = new Path(mazePath(GEO.maze));
    expect(model.queue[0]?.pos).toBeCloseTo(path.length, 0);
    for (let i = 1; i < model.queue.length; i++) expect(model.queue[i]?.pos ?? 0).toBeLessThan(model.queue[i - 1]?.pos ?? 0);
  });

  it('picking lets the head through as fast as the sim picks, and they move on to packing', () => {
    const model = new FlowModel();
    // A line of 20 already standing; nobody arrives, picking clears 0.6 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 20_000 }));
    let now = tick * 250;
    for (let i = 0; i < 60; i++) model.advance(16, (now += 16), GEO);
    expect(model.queue.length).toBe(20);
    let scanned = 0;
    // 34 ticks clear it all.
    for (let k = 0; k < 40; k++) {
      tick = feed(model, tick, 1, (t) => view(t, { orderPerTick: 0, backlog: Math.max(0, 20_000 - t * 600) }));
      for (let i = 0; i < 16; i++) {
        model.advance(16, (now += 16), GEO);
        scanned = Math.max(scanned, model.dots.filter((d) => d.phase === 'scan' && !visible(d, now)).length);
      }
    }
    expect(scanned).toBeGreaterThan(0);
    expect(model.queue.length).toBeLessThanOrEqual(2);
    for (let i = 0; i < 600; i++) model.advance(16, (now += 16), GEO);
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
  });

  it('a line longer than the maze holds squeezes up, and dots stand for more of it', () => {
    const model = new FlowModel();
    feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 900_000 }));
    let now = 250;
    for (let i = 0; i < 10; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(MAZE_MAX);
    expect(model.queue.length).toBe(MAZE_MAX);
    const path = new Path(mazePath(GEO.maze));
    expect(model.gap(path) * MAZE_MAX).toBeLessThanOrEqual(path.length + 1);
  });

  it('the order desk and the stations after picking queue orders for show and hide each one inside while served', () => {
    const model = new FlowModel();
    feed(model, 0, 41, (t) => view(t, { orderPerTick: 4000 }));
    let now = 41 * 250;
    let hidden = 0;
    for (let i = 0; i < 200; i++) {
      model.advance(16, (now += 16), GEO);
      hidden = Math.max(hidden, model.dots.filter((d) => !visible(d, now)).length);
    }
    expect(hidden).toBeGreaterThan(0);
    // Everything stays on the floor: never behind the door, never right of the stations.
    expect(model.dots.every((d) => d.x >= GEO.door.x - 1 && d.x <= 332)).toBe(true);
  });

  it('shows nothing for a quiet catch-up, and starts afresh in a new site', () => {
    const model = new FlowModel();
    model.ingest(view(0), [], 0);
    model.ingest(view(4000, { missed: 1_000_000 }), [], 1000);
    expect(model.dots).toHaveLength(0);
    feed(model, 4001, 40, (t) => view(t));
    expect(model.dots.length).toBeGreaterThan(0);
    model.ingest(view(4041, { site: 1 }), [], 20_000);
    expect(model.dots).toHaveLength(0);
  });

  it('never keeps more dots than a slow phone can draw', () => {
    const model = new FlowModel();
    const eight = Array.from({ length: 8 }, (_, i) => i);
    feed(
      model,
      0,
      400,
      (t) => view(t, { orderPerTick: 2400, po: { id: 1, units: 1_000_000, received: t * 2400 }, docks: eight.map((i) => dock(i, { loaded: (t * 3000) % 10_000 })) }),
    );
    for (let i = 0; i < 100; i++) model.advance(16, 100_000 + i * 16, GEO);
    expect(model.dots.length).toBeLessThanOrEqual(DOTS_MAX);
  });
});
