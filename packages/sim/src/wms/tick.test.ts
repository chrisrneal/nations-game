import { describe, expect, it } from 'vitest';
import type { WarehouseEvent, WmsLine, WmsOrder, WmsState, WmsStock } from '@warehouse/contracts';
import { hashState } from '../hash.ts';
import { createWarehouse } from '../state.ts';
import { advanceMany, step } from '../step.ts';
import { WAREHOUSE_TUNABLES } from '../tunables.ts';
import { isClosed } from './catalog.ts';
import { createWms } from './generate.ts';
import { cloneWms, goodwillChange, shipmentPay, wmsStep, type MWms } from './tick.ts';

const T = WAREHOUSE_TUNABLES;
const STEP = T.wmsStepTicks.value;
/** Milli-units a picker picks in one step (0.65 a second at 1 s a step). */
const PER_STEP = Math.floor((T.wmsPickMilliPerSec.value * STEP * T.tickMs.value) / 1000);

/** Runs `fn` with tunables replaced, then puts them back. */
function withTunables<R>(values: Partial<Record<keyof typeof T, number>>, fn: () => R): R {
  const table = T as unknown as Record<string, { value: number }>;
  const before = Object.keys(values).map((id) => [id, table[id]?.value ?? 0] as const);
  for (const [id, v] of Object.entries(values)) (table[id] as { value: number }).value = v as number;
  try {
    return fn();
  } finally {
    for (const [id, v] of before) (table[id] as { value: number }).value = v;
  }
}

function line(no: number, sku: number, ordered: number): WmsLine {
  return { no, sku, bin: sku * 37, ordered, allocated: 0, picked: 0, short: 0, status: 'OPEN' };
}

function order(no: number, lines: WmsLine[], extra: Partial<WmsOrder> = {}): WmsOrder {
  return { no, dest: 0, source: 0, priority: 3, wave: 0, status: 'NEW', lines, shipBy: 100_000, created: 0, next: 0, late: false, held: null, closed: 0, expedited: false, ...extra };
}

/** A quiet WMS: these orders and stock, no arrivals, waves or replenishment unless asked. */
function wms(orders: WmsOrder[], onHand: Record<number, number>, extra: Partial<WmsState> = {}): MWms {
  const base = createWms({ seed: 1, tick: 0, contract: 0 });
  const inventory: WmsStock[] = base.inventory.map((s) => ({ ...s, bin: s.sku * 37, onHand: onHand[s.sku] ?? 0, allocated: 0 }));
  return cloneWms({ ...base, orders, inventory, events: [], nextOrderAt: 1e9, nextWaveAt: 0, nextReplenAt: 1e9, ...extra });
}

/** Steps the WMS alone from tick `from`, `steps` times. Returns the tick after. */
function run(w: MWms, from: number, steps: number): number {
  let tick = from;
  for (let i = 0; i < steps; i++) {
    wmsStep(w, tick, 0);
    tick += STEP;
  }
  return tick;
}

function codes(w: MWms): string[] {
  return w.events.map((e) => e.code);
}

describe('WMS waves and allocation (slice 2)', () => {
  it('the wave planner releases every NEW order together and allocates it', () => {
    const w = wms([order(10234, [line(1, 0, 10)]), order(10235, [line(1, 1, 5)])], { 0: 50, 1: 50 });
    wmsStep(w, 0, 0);
    expect(w.orders.map((o) => [o.wave, o.lines[0]?.allocated])).toEqual([
      [1, 10],
      [1, 5],
    ]);
    expect(w.nextWave).toBe(2);
    expect(w.nextWaveAt).toBe(T.wmsWaveTicks.value);
    expect(w.inventory[0]?.allocated).toBe(10);
    expect(codes(w).slice(0, 4)).toEqual(['WAVE REL', 'WAVE REL', 'ALLOC', 'ALLOC']);
  });

  it('short stock: a line partly allocated is ALLOC SHORT, a line with none is SHORT, an order with none is a BACKORDER', () => {
    const w = wms([order(1, [line(1, 0, 10), line(2, 1, 8)]), order(2, [line(1, 2, 6)])], { 0: 4, 1: 0, 2: 0 });
    wmsStep(w, 0, 0);
    const [a, b] = w.orders as [MWms['orders'][number], MWms['orders'][number]];
    expect(a.lines.map((l) => [l.status, l.allocated, l.short])).toEqual([
      ['PICKING', 4, 6],
      ['SHORT', 0, 8],
    ]);
    expect(a.status).toBe('PICKING');
    expect(b.status).toBe('BACKORDER');
    expect(w.events.filter((e) => e.code === 'ALLOC SHORT').map((e) => [e.order, e.line, e.qty])).toEqual([
      [1, 1, 6],
      [1, 2, 8],
      [2, 1, 6],
    ]);
  });

  it('a backorder allocates once a purchase order is received and put away (W6)', () => {
    withTunables({ wmsPoLateChanceBp: 0, wmsPoLeadMinTicks: 40, wmsPoLeadMaxTicks: 40, wmsRcvShortChanceBp: 0, wmsDamageChanceBp: 0, wmsCountVarianceBp: 0, wmsShortPickChanceBp: 0 }, () => {
      const w = wms([order(1, [line(1, 2, 6)])], {}, { nextReplenAt: 2 * STEP });
      wmsStep(w, 0, 0);
      expect(w.orders[0]?.status).toBe('BACKORDER');
      run(w, STEP, 150);
      expect(codes(w)).toEqual(expect.arrayContaining(['PO CRT', 'ARRIVE', 'DOCK', 'RCV', 'PUTAWAY', 'PO CLOSE']));
      expect(codes(w)).not.toContain('REPLEN');
      expect(w.orders[0]?.lines[0]?.allocated).toBe(6);
      expect(w.orders[0]?.status).not.toBe('BACKORDER');
      // Ordered up to the reorder point plus a PO's worth, as the order was waiting for 6 of them.
      expect(w.pos.find((po) => po.lines.some((l) => l.sku === 2))?.lines.find((l) => l.sku === 2)?.expected).toBe(T.wmsReorderUnits.value + T.wmsReplenUnits.value + 6);
    });
  });
});

describe('WMS pickers (slice 2)', () => {
  it('idle pickers take lines by priority, then ship-by, then order number', () => {
    const w = wms(
      [
        order(1, [line(1, 0, 5)], { priority: 3, shipBy: 50 }),
        order(2, [line(1, 1, 5)], { priority: 1, shipBy: 900 }),
        order(3, [line(1, 2, 5)], { priority: 2, shipBy: 800 }),
        order(4, [line(1, 3, 5)], { priority: 2, shipBy: 700 }),
      ],
      { 0: 9, 1: 9, 2: 9, 3: 9 },
    );
    w.pickers = w.pickers.slice(0, 2);
    wmsStep(w, 0, 0);
    expect(w.pickers.map((p) => p.order)).toEqual([2, 4]);
    expect(w.events.filter((e) => e.code === 'PICK START').map((e) => [e.order, e.picker])).toEqual([
      [2, 1],
      [4, 2],
    ]);
  });

  it('a picker picks 0.65 units a second, then confirms the line and takes the stock off the shelf', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0 }, () => {
      const m = wms([order(1, [line(1, 0, 13)])], { 0: 20 });
      const steps = Math.ceil((13 * 1000) / PER_STEP);
      wmsStep(m, 0, 0);
      run(m, STEP, steps - 1);
      expect(m.orders[0]?.lines[0]?.status).toBe('PICKING');
      expect(m.orders[0]?.lines[0]?.picked).toBe(Math.floor(((steps - 1) * PER_STEP) / 1000));
      run(m, steps * STEP, 1);
      return m;
    });
    const l = w.orders[0]?.lines[0];
    expect([l?.status, l?.picked, l?.short]).toEqual(['PICKED', 13, 0]);
    expect(w.inventory[0]).toMatchObject({ onHand: 7, allocated: 0 });
    expect(w.pickers[0]).toMatchObject({ order: 0, line: 0, progress: 0 });
    const conf = w.events.find((e) => e.code === 'PICK CONF');
    expect(conf).toMatchObject({ order: 1, line: 1, sku: 0, qty: 13, of: 13, picker: 1 });
    expect(w.stats.linesPicked).toBe(1);
    expect(w.recent.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('a short pick confirms less than was allocated, and the order goes to SHORT instead of PICKED', () => {
    const w = withTunables({ wmsShortPickChanceBp: 10_000 }, () => {
      const m = wms([order(1, [line(1, 0, 10)])], { 0: 20 });
      let tick = 0;
      while (!codes(m).includes('PICK CONF')) tick = run(m, tick, 1);
      return m;
    });
    const l = w.orders[0]?.lines[0];
    const short = w.events.find((e) => e.code === 'SHORT PICK');
    expect(short).toMatchObject({ order: 1, line: 1, of: 10 });
    expect([l?.picked, l?.short]).toEqual([10 - (short?.qty ?? 0), short?.qty]);
    expect(l?.status).toBe('SHORT');
    expect(w.inventory[0]).toMatchObject({ onHand: 10, allocated: 0 });
    expect(w.orders[0]?.status).toBe(l?.picked === 0 ? 'BACKORDER' : 'SHORT');
  });
});

describe('WMS order flow (slice 2)', () => {
  it('a picked order packs, stages, loads and ships after the fixed delays, on time and in full', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0 }, () => {
      const m = wms([order(1, [line(1, 0, 1)])], { 0: 5 });
      run(m, 0, 40);
      return m;
    });
    const flow = w.events.filter((e) => e.order === 1).map((e) => e.code);
    expect(flow).toEqual(['WAVE REL', 'ALLOC', 'PICK START', 'PICK CONF', 'PACK', 'STAGE', 'LOAD', 'SHIP']);
    const ticks = Object.fromEntries(w.events.map((e) => [e.code, e.tick]));
    expect((ticks.PACK ?? 0) - (ticks['PICK CONF'] ?? 0)).toBe(T.wmsPackTicks.value);
    expect((ticks.SHIP ?? 0) - (ticks.LOAD ?? 0)).toBe(T.wmsShipTicks.value);
    expect(w.orders[0]).toMatchObject({ status: 'SHIPPED', closed: ticks.SHIP });
    expect(w.stats).toMatchObject({ shipped: 1, onTime: 1, inFull: 1, otif: 1, unitsOrdered: 1, unitsShipped: 1 });
    expect(w.dests[0]).toMatchObject({ shipped: 1, otif: 1 });
  });

  it('an order past its ship-by logs CUTOFF MISS once and ships late, not OTIF', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0 }, () => {
      const m = wms([order(1, [line(1, 0, 1)], { shipBy: 8 })], { 0: 5 });
      run(m, 0, 40);
      return m;
    });
    expect(codes(w).filter((c) => c === 'CUTOFF MISS')).toHaveLength(1);
    expect(w.orders[0]?.late).toBe(true);
    expect(w.stats).toMatchObject({ shipped: 1, onTime: 0, inFull: 1, otif: 0, cutoffMisses: 1 });
  });

  it('a short order ships what was picked, in time but not in full', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0 }, () => {
      const m = wms([order(1, [line(1, 0, 3), line(2, 1, 4)])], { 0: 3 });
      run(m, 0, 40);
      return m;
    });
    expect(w.events.filter((e) => e.order === 1).map((e) => e.code)).toContain('SHIP');
    expect(w.stats).toMatchObject({ shipped: 1, onTime: 1, inFull: 0, otif: 0, unitsOrdered: 7, unitsShipped: 3 });
  });
});

describe('WMS in the warehouse (slice 2)', () => {
  it('a new warehouse releases its first wave after 30 s and the pickers start', () => {
    let s = createWarehouse({ seed: 4 });
    s = advanceMany(s, T.wmsFirstWaveTicks.value + 1);
    expect(s.wms.orders.every((o) => o.wave === 1)).toBe(true);
    expect(s.wms.pickers.filter((p) => p.order > 0).length).toBeGreaterThan(0);
    expect(s.wms.events.some((e) => e.code === 'PICK START')).toBe(true);
  });

  it('catching up equals stepping, WMS included', () => {
    const start = createWarehouse({ seed: 9 });
    let stepped = start;
    for (let i = 0; i < 900; i++) stepped = step(stepped, []).state;
    expect(hashState(advanceMany(start, 900))).toBe(hashState(stepped));
  });

  it('stays consistent and bounded through two hours: stock, allocations, lines, the log and the grid', () => {
    for (const seed of [1, 2, 3]) {
      const s = advanceMany(createWarehouse({ seed }), 2 * 3600 * 4);
      const w = s.wms;
      expect(w.stats.shipped).toBeGreaterThan(100);
      expect(w.events.length).toBe(T.wmsEventsKept.value);
      expect(w.orders.filter((o) => !isClosed(o.status)).length).toBeLessThanOrEqual(T.wmsMaxOpenOrders.value);
      expect(w.orders.filter((o) => isClosed(o.status)).length).toBeLessThanOrEqual(T.wmsKeepClosedOrders.value);
      expect(w.stats.otif).toBeGreaterThan(w.stats.shipped / 2);
      const allocated = w.inventory.map(() => 0);
      for (const o of w.orders) {
        for (const l of o.lines) {
          expect(l.picked).toBeLessThanOrEqual(l.allocated);
          expect(l.allocated).toBeLessThanOrEqual(l.ordered);
          if (l.status === 'ALLOCATED' || l.status === 'PICKING') allocated[l.sku] = (allocated[l.sku] ?? 0) + l.allocated;
          if (l.status === 'PICKED' || l.status === 'SHORT') expect(l.picked + l.short).toBe(l.ordered);
        }
      }
      for (const stock of w.inventory) {
        expect(stock.onHand).toBeGreaterThanOrEqual(0);
        expect(stock.allocated).toBe(allocated[stock.sku]);
      }
      expect(s.rng.counter).toBe(advanceMany({ ...createWarehouse({ seed }), wms: createWms({ seed: 99, tick: 0, contract: 0 }) }, 2 * 3600 * 4).rng.counter);
    }
  });
});

describe('WMS feedback loop (slice 8)', () => {
  it('goodwill: +3 for on time and in full; down by the minutes late (capped) and the share short', () => {
    const o = order(1, [{ ...line(1, 0, 10), picked: 10 }], { shipBy: 1000 });
    expect(goodwillChange(o, 900, true, true, 10)).toBe(T.wmsGoodwillGain.value);
    expect(goodwillChange(o, 1001, false, true, 10)).toBe(-T.wmsGoodwillLatePerMin.value);
    expect(goodwillChange(o, 1000 + 3 * 240, false, true, 10)).toBe(-3 * T.wmsGoodwillLatePerMin.value);
    expect(goodwillChange(o, 1000 + 60 * 240, false, true, 10)).toBe(-T.wmsGoodwillLateMax.value);
    expect(goodwillChange(o, 900, true, false, 6)).toBe(-Math.floor((T.wmsGoodwillShortMax.value * 4) / 10));
  });

  it('a shipment pays 5% of an idle order’s pay a unit, times (50 + goodwill)%', () => {
    expect(shipmentPay(80, 100, 50)).toBe(400);
    expect(shipmentPay(80, 100, 100)).toBe(600);
    expect(shipmentPay(80, 100, 0)).toBe(200);
    expect(shipmentPay(0, 100, 100)).toBe(0);
  });

  it('shipping moves the country’s goodwill and pays the warehouse; key events go to the sink', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0 }, () => {
      const m = wms([order(1, [line(1, 0, 10)], { dest: 2, priority: 1 })], { 0: 20 });
      const events: WarehouseEvent[] = [];
      let earned = 0;
      let tick = 0;
      for (let i = 0; i < 60; i++) {
        earned += wmsStep(m, tick, 0, 100, events);
        tick += STEP;
      }
      expect(earned).toBe(shipmentPay(10, 100, T.wmsGoodwillStart.value));
      expect(events).toEqual([expect.objectContaining({ type: 'wmsShipped', payload: expect.objectContaining({ order: 1, priority: 1, onTime: true, inFull: true, cents: earned }) })]);
      return m;
    });
    expect(w.dests[2]?.goodwill).toBe(T.wmsGoodwillStart.value + T.wmsGoodwillGain.value);
  });

  it('a WMS shipment is cash and counts as earned (stars come from earnings)', () => {
    const s = advanceMany(createWarehouse({ seed: 2 }), 15 * 60 * 4);
    const shipped = s.wms.stats.shipped;
    expect(shipped).toBeGreaterThan(0);
    const events = [] as WarehouseEvent[];
    let state = s;
    for (let i = 0; i < 600 && !events.some((e) => e.type === 'wmsShipped'); i++) {
      const r = step(state, []);
      events.push(...r.events);
      if (r.events.some((e) => e.type === 'wmsShipped')) {
        const cents = r.events.reduce((n, e) => n + (e.type === 'wmsShipped' ? e.payload.cents : 0), 0);
        const trucks = r.events.reduce((n, e) => n + (e.type === 'departed' ? e.payload.cents : 0), 0);
        expect(r.state.run.earned - state.run.earned).toBe(cents + trucks);
      }
      state = r.state;
    }
    expect(events.some((e) => e.type === 'wmsShipped')).toBe(true);
  });
});
