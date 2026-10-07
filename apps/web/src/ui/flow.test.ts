import type { WarehouseEvent, WarehouseView, DockView, Stats } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { DOTS_MAX, FlowModel, MAZE_MAX, PITCH, boardSpot, choosePerDot, laneCount, laneSpots, parcelSpots, rackSlots, visible, type Dot, type FlowGeometry, type Mark, type Rect } from './flow.ts';

const STATS: Stats = { earned: 0, shipments: 0, fullShipments: 0, orders: 0, missed: 0, expresses: 0, pos: 0, received: 0, taps: 0 };

function dock(index: number, over: Partial<DockView> = {}): DockView {
  return { index, truck: index + 1, parcels: 10, loaded: 0, timer: 60, timerMax: 60, turn: 0, turnMax: 0, rush: 0, express: false, model: 'Cargo bike', rate: 500, rushed: false, ...over };
}

/** The parts of a View the flow reads; the rest is never touched. */
function view(
  tick: number,
  over: { staged?: number; orderPerTick?: number; missed?: number; docks?: DockView[]; site?: number; backlog?: number; po?: { id: number; units: number; received: number }; stock?: number; items?: number } = {},
): WarehouseView {
  return {
    tick,
    tickMs: 250,
    staging: { staged: over.staged ?? 10_000, cap: 40_000, orderPerTick: over.orderPerTick ?? 400 },
    picking: { backlog: over.backlog ?? 0, cap: 72_000, ratePerTick: 600, baseRatePerTick: 600, rushed: false, waitTicks: 0, slowBp: 10_000, itemsMilli: over.items ?? 1000 },
    receiving: { stock: over.stock ?? 60_000, shelfCap: 120_000, ratePerTick: 600, baseRatePerTick: 600, rushed: false, po: over.po ?? { id: 1, units: 48, received: 0 } },
    docks: over.docks ?? [dock(0)],
    site: { index: over.site ?? 0, name: 'Millbrook Depot', twist: '' },
    run: { ...STATS, missed: over.missed ?? 0 },
  } as unknown as WarehouseView;
}

const RACKS: Rect[] = [
  { left: 100, top: 60, right: 295, bottom: 66 },
  { left: 100, top: 74, right: 295, bottom: 80 },
  { left: 100, top: 88, right: 295, bottom: 94 },
];

/** Floor pick locations left of this, reserve right of it. */
const SPLIT = 175;
const LANES: Rect[] = [
  { left: 50, top: 100, right: 90, bottom: 118 },
  { left: 94, top: 100, right: 134, bottom: 118 },
];

const GEO: FlowGeometry = {
  inbound: { y: 30, start: 40, booths: [{ left: 60, right: 80 }] },
  door: { x: 10, y: 50 },
  checkin: { left: 14, right: 50, y: 50 },
  board: { left: 14, top: 58, right: 90, bottom: 94 },
  racks: { mouth: 97, cross: 300, aisles: [70, 84], ...rackSlots(RACKS, [70, 84], SPLIT) },
  after: [{ left: 20, right: 46 }],
  afterY: 110,
  walk: 97,
  staging: { left: 20, top: 100, right: 285, bottom: 118 },
  lanes: LANES,
  laneSpots: LANES.map(laneSpots),
  pier: { x: 175, top: 124 },
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

  it('carries a carton from staging to its dock for each order loaded', () => {
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

  it('puts each unit away by forklift, through quality check and down the cross aisle, into a reserve location that fills as it drops', () => {
    const model = new FlowModel();
    // 2.4 units a second put away for 10 seconds, a new PO half way.
    feed(model, 0, 41, (t) => view(t, { orderPerTick: 0, po: t < 20 ? { id: 1, units: 12, received: t * 600 } : { id: 2, units: 48, received: (t - 20) * 600 } }));
    const stock = model.dots.filter((d) => d.kind === 'arr');
    expect(stock).toHaveLength(24);
    expect(stock.every((d) => d.tint === 'box')).toBe(true);
    let now = 41 * 250;
    let hidden = 0;
    const drops = new Set<Mark>();
    let filledAtDrop = 0;
    const full = (): number => model.face.reduce((a, b) => a + b, 0) + model.reserve.reduce((a, b) => a + b, 0);
    model.advance(16, (now += 16), GEO);
    // The cartons on their way are not in the racks yet: 36 of the 60 units.
    const before = full();
    expect(before).toBe(Math.round((36 / 120) * 117));
    for (let i = 0; i < 3000 && model.dots.length > 0; i++) {
      model.advance(16, (now += 16), GEO);
      hidden = Math.max(hidden, model.dots.filter((d) => !visible(d, now)).length);
      for (const d of model.dots) {
        // Along the inbound dock until the cross aisle, then down it and along an aisle: never through the board.
        expect(d.x >= GEO.inbound.start - 1 && d.x <= GEO.racks.cross + 0.5).toBe(true);
        if (d.y > GEO.inbound.y + 4) {
          expect(d.x).toBeGreaterThan(GEO.racks.mouth);
          expect(d.y === 70 || d.y === 84 || d.x === GEO.racks.cross).toBe(true);
        }
      }
      for (const m of model.marks) {
        if (m.kind !== 'put' || drops.has(m)) continue;
        drops.add(m);
        const i = GEO.racks.reserve.findIndex((s) => s.x === m.x && s.y === m.y);
        expect(i).toBeGreaterThanOrEqual(0);
        if (GEO.racks.reserve.some((s, k) => model.reserve[k] === 1 && Math.hypot(s.x - m.x, s.y - m.y) < PITCH * 1.5)) filledAtDrop += 1;
      }
    }
    expect(hidden).toBeGreaterThan(0);
    // Every forklift set its carton down in reserve and backed out.
    expect(model.dots).toHaveLength(0);
    expect(drops.size).toBe(24);
    expect(filledAtDrop).toBe(24);
    // And the racks hold the real stock.
    expect(full()).toBe(Math.round((60 / 120) * 117));
  });

  it('reach trucks replenish the floor pick locations from reserve when pickers run them low', () => {
    const model = new FlowModel();
    // A line of 30 already standing; nobody arrives, picking clears 0.6 a tick from 60 units of stock.
    let tick = feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 30_000 }));
    let now = tick * 250;
    for (let i = 0; i < 60; i++) model.advance(16, (now += 16), GEO);
    const faceFull = (): number => model.face.reduce((a, b) => a + b, 0);
    // The floor pick locations start most of the way full; the rest of the stock is in reserve.
    expect(faceFull()).toBe(Math.round(45 * 0.85));
    const seen = new Set<Mark>();
    let trucks = 0;
    for (let k = 0; k < 120; k++) {
      tick = feed(model, tick, 1, (t) => {
        const picked = Math.min(30_000, (t - 1) * 600);
        return view(t, { orderPerTick: 0, backlog: 30_000 - picked, stock: 60_000 - picked });
      });
      for (let i = 0; i < 16; i++) {
        model.advance(16, (now += 16), GEO);
        trucks = Math.max(trucks, model.replens);
        for (const d of model.dots) {
          if (d.kind !== 'rep') continue;
          // Reach trucks keep to the aisles, between the floor pick locations and the cross aisle.
          expect(d.y === 70 || d.y === 84).toBe(true);
          expect(d.x > GEO.racks.mouth && d.x <= GEO.racks.cross).toBe(true);
        }
        for (const m of model.marks) seen.add(m);
      }
    }
    for (let i = 0; i < 600; i++) model.advance(16, (now += 16), GEO);
    const marks = [...seen];
    const isFace = (m: Mark): boolean => GEO.racks.face.some((s) => s.x === m.x && s.y === m.y);
    const isReserve = (m: Mark): boolean => GEO.racks.reserve.some((s) => s.x === m.x && s.y === m.y);
    expect(trucks).toBeGreaterThan(0);
    expect(trucks).toBeLessThanOrEqual(4);
    // Pickers pick from the floor; reach trucks lift in reserve and set down on the floor.
    const picks = marks.filter((m) => m.kind === 'pick');
    expect(picks.length).toBe(30);
    expect(picks.every(isFace)).toBe(true);
    const reps = marks.filter((m) => m.kind === 'rep');
    expect(reps.filter(isReserve).length).toBeGreaterThan(0);
    expect(reps.filter(isReserve).length).toBe(reps.filter(isFace).length);
    // The racks end holding the real stock (30 units), and the floor topped back up from reserve.
    expect(model.dots).toHaveLength(0);
    expect(faceFull() + model.reserve.reduce((a, b) => a + b, 0)).toBe(Math.round((30 / 120) * 117));
    expect(faceFull()).toBeGreaterThan(Math.round(45 * 0.5));
  });

  it('carries a staged carton out of its dock\'s lane, down the aisle, along the walkway and in at the bay door', () => {
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
    // It starts in dock 2's staging lane.
    expect(seen[0]?.x ?? 0).toBeGreaterThan(94);
    expect(seen[0]?.x ?? 0).toBeLessThan(134);
    // Between staging and the walkway it keeps to the aisle; it only leaves it along the walkway, and loads at the bay's middle.
    expect(seen.filter((p) => p.y > GEO.pier.top + 1 && p.y < 138).every((p) => Math.abs(p.x - GEO.pier.x) < 4)).toBe(true);
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

  it('lays the racks out in locations, floor pick at the front of each run and reserve behind, each reached from its nearest aisle', () => {
    const { face, reserve } = rackSlots(RACKS, [70, 84], SPLIT);
    expect(face).toHaveLength(3 * 15);
    expect(reserve).toHaveLength(3 * 24);
    const all = [...face, ...reserve];
    expect(all.every((p) => RACKS.some((r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom))).toBe(true);
    expect(all.every((p) => [70, 84].every((a) => Math.abs(p.aisle - p.y) <= Math.abs(a - p.y)))).toBe(true);
    expect(face.every((p) => p.x < SPLIT) && reserve.every((p) => p.x >= SPLIT)).toBe(true);
  });

  it('fills the racks from the real stock, scattered, the same way each time', () => {
    const fill = (): FlowModel => {
      const model = new FlowModel();
      model.ingest(view(0, { orderPerTick: 0, stock: 90_000 }), [], 0);
      model.advance(16, 16, GEO);
      return model;
    };
    const model = fill();
    const face = model.face.reduce((a, b) => a + b, 0);
    expect(face + model.reserve.reduce((a, b) => a + b, 0)).toBe(Math.round((90 / 120) * 117));
    expect(face).toBe(Math.round(45 * 0.85));
    // Not filled left to right.
    expect([...model.reserve.slice(0, 24)].some((v, i, a) => i > 0 && v > (a[i - 1] ?? 0))).toBe(true);
    expect([...fill().reserve]).toEqual([...model.reserve]);
    // Nothing moving and no update: what stands still is not redrawn.
    const drawn = model.still;
    for (let i = 0; i < 30; i++) model.advance(16, 32 + i * 16, GEO);
    expect(model.still).toBe(drawn);
  });

  it('lays the order board out oldest first from the top left, squeezing up when the backlog outgrows it', () => {
    expect(boardSpot(GEO.board, 0, 10)).toEqual({ x: 14 + PITCH / 2, y: 58 + PITCH / 2 });
    expect(boardSpot(GEO.board, 1, 10).x).toBe(14 + PITCH * 1.5);
    for (let i = 0; i < MAZE_MAX; i++) {
      const p = boardSpot(GEO.board, i, MAZE_MAX);
      expect(p.x > 14 && p.x < 90 && p.y > 58 && p.y < 94).toBe(true);
    }
  });

  it('stacks staged cartons from the dock end of each lane, shared out evenly', () => {
    const spots = laneSpots(GEO.lanes[0] as Rect);
    expect(spots.length).toBeGreaterThan(8);
    expect(spots[0]?.y ?? 0).toBeGreaterThan(spots[spots.length - 1]?.y ?? 0);
    expect([0, 1, 2].map((i) => laneCount(7, 3, i))).toEqual([3, 2, 2]);
  });

  it('the order board is the real backlog: orders wait on it while picking holds them', () => {
    const model = new FlowModel();
    // 1.6 a second join; picking lets nobody through (a full staging): the line grows by 0.4 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { backlog: 0 }));
    tick = feed(model, tick, 80, (t) => view(t, { backlog: t * 400 }));
    let now = tick * 250;
    for (let i = 0; i < 1200; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(32);
    expect(model.queue.length).toBeGreaterThanOrEqual(30);
    expect(model.queue.length).toBeLessThanOrEqual(34);
    // They wait in the order they came, oldest at the top left of the board.
    model.queue.forEach((d, i) => {
      const at = boardSpot(GEO.board, i, model.queue.length);
      expect(Math.hypot(d.x - at.x, d.y - at.y)).toBeLessThan(1);
    });
  });

  it('pickers take the head of the board as fast as the sim picks, fetch a carton from the racks and carry it to staging', () => {
    const model = new FlowModel();
    // A line of 20 already standing; nobody arrives, picking clears 0.6 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 20_000 }));
    let now = tick * 250;
    for (let i = 0; i < 60; i++) model.advance(16, (now += 16), GEO);
    expect(model.queue.length).toBe(20);
    let picked = 0;
    // 34 ticks clear it all.
    for (let k = 0; k < 40; k++) {
      tick = feed(model, tick, 1, (t) => view(t, { orderPerTick: 0, backlog: Math.max(0, 20_000 - t * 600) }));
      for (let i = 0; i < 16; i++) {
        model.advance(16, (now += 16), GEO);
        for (const d of model.dots) {
          if (d.phase !== 'pick') continue;
          // In the racks: right of the board, never past the cross aisle.
          if (d.y < GEO.afterY - 4 && Math.hypot(d.x - (GEO.board.left + PITCH / 2), d.y - (GEO.board.top + PITCH / 2)) > 8) expect(d.x).toBeGreaterThan(GEO.board.left);
          expect(d.x).toBeLessThanOrEqual(GEO.racks.cross + 0.5);
          if (d.tint === 'box') picked += 1;
          // Carrying the carton out: back along the aisle to its left end, by the board, never toward the cross aisle.
          if (d.leg >= 4) {
            const slot = (d.face ? GEO.racks.face : GEO.racks.reserve)[d.slot];
            expect(d.x).toBeLessThanOrEqual((slot?.x ?? GEO.racks.mouth) + 0.5);
          }
          if (d.leg >= 5) expect(Math.abs(d.x - GEO.racks.mouth)).toBeLessThanOrEqual(2);
        }
        // Carried to staging: below the racks, left of the cross aisle.
        for (const d of model.dots) {
          if (d.phase !== 'carry') continue;
          expect(d.y).toBeGreaterThanOrEqual(GEO.walk - 0.5);
          expect(d.x).toBeLessThan(GEO.racks.cross - 50);
        }
      }
    }
    expect(picked).toBeGreaterThan(0);
    expect(model.queue.length).toBeLessThanOrEqual(2);
    for (let i = 0; i < 600; i++) model.advance(16, (now += 16), GEO);
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
  });

  it('orders of several items (RULES 3b): the picker fills a tote from a different location for each, and the mix averages the real items per order', () => {
    const model = new FlowModel();
    // Overseas: 2.1 items an order.
    let tick = feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 60_000, items: 2100, stock: 120_000 }));
    let now = tick * 250;
    for (let i = 0; i < 60; i++) model.advance(16, (now += 16), GEO);
    const stops = new Map<Dot, { left: number; at: string[] }>();
    const sizes: number[] = [];
    for (let k = 0; k < 120; k++) {
      tick = feed(model, tick, 1, (t) => view(t, { orderPerTick: 0, backlog: Math.max(0, 60_000 - t * 600), items: 2100, stock: 120_000 }));
      for (let i = 0; i < 16; i++) {
        model.advance(16, (now += 16), GEO);
        for (const d of model.dots) {
          if (d.kind !== 'dep' || d.phase === 'desk' || d.phase === 'board') continue;
          let seen = stops.get(d);
          if (seen === undefined) {
            seen = { left: d.items, at: [] };
            stops.set(d, seen);
            sizes.push(d.items);
          }
          // Each item is taken where the picker stands, reaching into a rack location.
          if (d.left < seen.left) seen.at.push(`${d.x},${d.y}`);
          seen.left = d.left;
        }
      }
    }
    // A tote holds 2 to 4 items, or up to twice the average when that is more (5 here).
    expect(sizes.every((n) => n >= 1 && n <= 5)).toBe(true);
    // Each ticket is one order: 60 in all.
    expect(sizes).toHaveLength(60);
    const multi = [...stops.entries()].filter(([d]) => d.items > 1);
    expect(multi.length).toBeGreaterThan(60 * 0.25);
    expect(multi.length).toBeLessThan(60 * 0.65);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    expect(Math.abs(mean - 2.1)).toBeLessThan(0.4);
    for (const [, seen] of multi) expect(new Set(seen.at).size).toBe(seen.at.length);
    expect(multi.some(([d, seen]) => seen.at.length === d.items)).toBe(true);
    for (let i = 0; i < 900; i++) model.advance(16, (now += 16), GEO);
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
  });

  it('one-item orders need no tote: at 1 item an order none is drawn, at Local shops about one in ten', () => {
    for (const [items, lo, hi] of [[1000, 0, 0], [1200, 0.03, 0.2]] as const) {
      const model = new FlowModel();
      let tick = feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 200_000, items, stock: 120_000 }));
      let now = tick * 250;
      const seen = new Map<Dot, number>();
      for (let k = 0; k < 340; k++) {
        tick = feed(model, tick, 1, (t) => view(t, { orderPerTick: 0, backlog: Math.max(0, 200_000 - (t - 1) * 600), items, stock: 120_000 }));
        for (let i = 0; i < 16; i++) {
          model.advance(16, (now += 16), GEO);
          for (const d of model.dots) if (d.kind === 'dep' && d.phase === 'pick') seen.set(d, d.items);
        }
      }
      const totes = [...seen.values()].filter((n) => n > 1).length / seen.size;
      expect(seen.size).toBeGreaterThan(150);
      expect(totes).toBeGreaterThanOrEqual(lo);
      expect(totes).toBeLessThanOrEqual(hi);
    }
  });

  it('a backlog longer than the board holds squeezes up, and dots stand for more of it', () => {
    const model = new FlowModel();
    feed(model, 0, 1, (t) => view(t, { orderPerTick: 0, backlog: 900_000 }));
    let now = 250;
    for (let i = 0; i < 10; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(MAZE_MAX);
    expect(model.queue.length).toBe(MAZE_MAX);
    expect(model.queue.every((d) => d.x > GEO.board.left && d.x < GEO.board.right && d.y > GEO.board.top && d.y < GEO.board.bottom)).toBe(true);
  });

  it('the order desk and the stations after picking queue goods for show and hide each one inside while served', () => {
    const model = new FlowModel();
    feed(model, 0, 41, (t) => view(t, { orderPerTick: 4000 }));
    let now = 41 * 250;
    let hidden = 0;
    for (let i = 0; i < 200; i++) {
      model.advance(16, (now += 16), GEO);
      hidden = Math.max(hidden, model.dots.filter((d) => !visible(d, now)).length);
    }
    expect(hidden).toBeGreaterThan(0);
    // Everything stays on the floor: never behind the door, never right of the cross aisle.
    expect(model.dots.every((d) => d.x >= GEO.door.x - 1 && d.x <= GEO.racks.cross + 0.5)).toBe(true);
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
