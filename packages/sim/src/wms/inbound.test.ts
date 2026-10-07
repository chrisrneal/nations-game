import { describe, expect, it } from 'vitest';
import type { WmsLine, WmsOrder, WmsPo, WmsPoLine, WmsState } from '@warehouse/contracts';
import { hashState } from '../hash.ts';
import { createWarehouse } from '../state.ts';
import { advanceMany, step } from '../step.ts';
import { WAREHOUSE_TUNABLES } from '../tunables.ts';
import { WMS_FIRST_PO_NO, WMS_SKUS, WMS_SUPPLIERS } from './catalog.ts';
import { createWms } from './generate.ts';
import { cycleCount, inboundUnits, planReorders, stepInbound, waitingUnits } from './inbound.ts';
import { cloneWms, type MWms } from './mutable.ts';
import { Roller } from './orders.ts';
import { wmsStep } from './tick.ts';

const T = WAREHOUSE_TUNABLES;
const STEP = T.wmsStepTicks.value;
const ROP = T.wmsReorderUnits.value;
const Q = T.wmsReplenUnits.value;

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

/** No luck: trucks on time, nothing short, damaged or miscounted. */
const CALM = { wmsPoLateChanceBp: 0, wmsRcvShortChanceBp: 0, wmsDamageChanceBp: 0, wmsCountVarianceBp: 0 } as const;

/** A quiet WMS: every SKU holds `full` units unless set, no orders, no clocks firing unless asked. */
function wms(onHand: Record<number, number> = {}, extra: Partial<WmsState> = {}, full = 1000): MWms {
  const base = createWms({ seed: 1, tick: 0, contract: 0 });
  const inventory = base.inventory.map((s) => ({ ...s, bin: s.sku * 37, onHand: onHand[s.sku] ?? full, allocated: 0 }));
  return cloneWms({ ...base, orders: [], inventory, events: [], nextOrderAt: 1e9, nextWaveAt: 1e9, nextReplenAt: 1e9, nextCountAt: 1e9, ...extra });
}

function poLine(no: number, sku: number, expected: number, extra: Partial<WmsPoLine> = {}): WmsPoLine {
  return { no, sku, bin: sku * 37, expected, received: 0, damaged: 0, short: 0, status: 'OPEN', putAt: 0, ...extra };
}

function po(no: number, lines: WmsPoLine[], extra: Partial<WmsPo> = {}): WmsPo {
  return { no, supplier: 0, status: 'IN TRANSIT', lines, created: 0, eta: 0, arrive: 0, arrived: 0, door: 0, closed: 0, late: false, ...extra };
}

function roller(w: MWms): Roller {
  return new Roller(w.rng);
}

/** Steps the inbound side alone from tick `from`, `steps` times. Returns the tick after. */
function run(w: MWms, from: number, steps: number): number {
  const r = roller(w);
  let tick = from;
  for (let i = 0; i < steps; i++) {
    stepInbound(w, r, tick);
    tick += STEP;
  }
  return tick;
}

function codes(w: MWms): string[] {
  return w.events.map((e) => e.code);
}

describe('WMS reorder planning (W6)', () => {
  it('raises one PO per supplier for SKUs under the reorder point, ordered up to the reorder point plus a PO quantity', () => {
    withTunables(CALM, () => {
      // SKUs 0 and 2 are Prairie Grain's, 4 is Nordic Steel's.
      const w = wms({ 0: 10, 2: ROP - 1, 4: 0 });
      planReorders(w, roller(w), 100);
      expect(w.pos.map((p) => [p.no, p.supplier, p.lines.map((l) => [l.sku, l.expected])])).toEqual([
        [WMS_FIRST_PO_NO, 0, [[0, ROP + Q - 10], [2, Q + 1]]],
        [WMS_FIRST_PO_NO + 1, 1, [[4, ROP + Q]]],
      ]);
      for (const p of w.pos) {
        expect(p.status).toBe('IN TRANSIT');
        expect(p.eta - 100).toBeGreaterThanOrEqual(T.wmsPoLeadMinTicks.value);
        expect(p.eta - 100).toBeLessThanOrEqual(T.wmsPoLeadMaxTicks.value);
        expect(p.arrive).toBe(p.eta);
      }
      expect(w.nextPoNo).toBe(WMS_FIRST_PO_NO + 2);
      expect(w.events.filter((e) => e.code === 'PO CRT').map((e) => [e.order, e.qty, e.of])).toEqual([
        [WMS_FIRST_PO_NO, ROP + Q - 10 + Q + 1, 2],
        [WMS_FIRST_PO_NO + 1, ROP + Q, 1],
      ]);
    });
  });

  it('counts what is already coming, so a second run orders nothing more', () => {
    const w = wms({ 3: 0 });
    planReorders(w, roller(w), 0);
    expect(w.pos).toHaveLength(1);
    planReorders(w, roller(w), 240);
    expect(w.pos).toHaveLength(1);
    expect(inboundUnits(w).onOrder[3]).toBe(ROP + Q);
  });

  it('nets out what order lines are waiting for, NEW orders included, but not lines of orders past picking', () => {
    const line = (sku: number, ordered: number, status: WmsLine['status'] = 'OPEN'): WmsLine => ({ no: 1, sku, bin: 0, ordered, allocated: 0, picked: 0, short: 0, status });
    const order = (status: WmsOrder['status'], lines: WmsLine[]): WmsOrder => ({ no: 1, dest: 0, source: 0, priority: 3, wave: 0, status, lines, shipBy: 1e6, created: 0, next: 0, late: false, held: null, closed: 0, expedited: false });
    const w = wms({}, { orders: [order('NEW', [line(5, 30)]), order('BACKORDER', [line(5, 20, 'SHORT')]), order('PACKED', [line(5, 99, 'SHORT')])] });
    expect(waitingUnits(w)[5]).toBe(50);
    w.inventory[5]!.onHand = ROP + 49;
    planReorders(w, roller(w), 0);
    expect(w.pos.flatMap((p) => p.lines).map((l) => [l.sku, l.expected])).toEqual([[5, Q + 1]]);
  });

  it('a share of trucks are late: PO LATE once the ETA passes, then they arrive', () => {
    withTunables({ ...CALM, wmsPoLateChanceBp: 10_000 }, () => {
      const w = wms({ 4: 0 });
      planReorders(w, roller(w), 0);
      const p = w.pos[0]!;
      expect(p.arrive - p.eta).toBeGreaterThanOrEqual(40);
      expect(p.arrive - p.eta).toBeLessThanOrEqual(T.wmsPoLateMaxTicks.value);
      run(w, 0, Math.ceil(p.arrive / STEP) + 1);
      expect(p.late).toBe(true);
      expect(w.inbound.posLate).toBe(1);
      const late = w.events.find((e) => e.code === 'PO LATE');
      const arrived = w.events.find((e) => e.code === 'ARRIVE');
      expect(late?.tick).toBeGreaterThan(p.eta);
      expect(arrived?.tick).toBeGreaterThan(late?.tick ?? 0);
      expect(p.arrived).toBe(arrived?.tick);
    });
  });
});

describe('WMS receiving and put-away (W6)', () => {
  it('a truck arrives on its ETA, docks at a free door and is received at the receiving rate', () => {
    withTunables(CALM, () => {
      const perStep = Math.floor((T.wmsReceiveMilliPerSec.value * STEP * T.tickMs.value) / 1000) / 1000;
      const units = 10 * perStep;
      const w = wms({}, { pos: [po(1, [poLine(1, 0, units)], { eta: 8, arrive: 8 }) as WmsPo] });
      run(w, 0, 3);
      const p = w.pos[0]!;
      expect(p.status).toBe('RECEIVING');
      expect(p.door).toBe(1);
      expect(codes(w)).toEqual(['ARRIVE', 'DOCK']);
      expect(w.receivers[0]).toMatchObject({ po: 1, line: 1 });
      run(w, 12, 4);
      expect(p.lines[0]!.received).toBe(4 * perStep);
      expect(p.lines[0]!.status).toBe('RECEIVING');
      run(w, 28, 6);
      expect(p.lines[0]).toMatchObject({ status: 'RECEIVED', received: units, short: 0, damaged: 0 });
      expect(p.status).toBe('PUTAWAY');
      expect(w.events.find((e) => e.code === 'RCV')).toMatchObject({ order: 1, line: 1, sku: 0, qty: units, of: units, picker: 1 });
    });
  });

  it('put-away puts the units in the bin after a delay, then the PO closes', () => {
    withTunables(CALM, () => {
      const w = wms({ 0: 5 }, { pos: [po(1, [poLine(1, 0, 4)], { eta: 0, arrive: 0 }) as WmsPo] });
      const end = run(w, 0, 2);
      const line = w.pos[0]!.lines[0]!;
      expect(line.status).toBe('RECEIVED');
      expect(w.inventory[0]!.onHand).toBe(5);
      run(w, end, T.wmsPutawayTicks.value / STEP + 1);
      expect(line.status).toBe('STORED');
      expect(w.inventory[0]!.onHand).toBe(9);
      expect(w.pos[0]!.status).toBe('CLOSED');
      expect(w.inbound).toMatchObject({ posClosed: 1, unitsReceived: 4 });
      expect(codes(w).slice(-2)).toEqual(['PUTAWAY', 'PO CLOSE']);
    });
  });

  it('with every door busy, a truck waits in the yard until one frees', () => {
    withTunables({ ...CALM, wmsDockDoors: 1 }, () => {
      const w = wms({}, { pos: [po(1, [poLine(1, 0, 8)]), po(2, [poLine(1, 1, 8)])] as WmsPo[] });
      run(w, 0, 1);
      expect(w.pos.map((p) => [p.status, p.door])).toEqual([
        ['RECEIVING', 1],
        ['ARRIVED', 0],
      ]);
      run(w, STEP, 3);
      expect(w.pos.map((p) => [p.status, p.door])).toEqual([
        ['PUTAWAY', 1],
        ['RECEIVING', 1],
      ]);
    });
  });

  it('receivers each take one line, oldest truck first', () => {
    withTunables({ ...CALM, wmsReceivers: 2 }, () => {
      const base = wms({}, { pos: [po(7, [poLine(1, 0, 99), poLine(2, 1, 99), poLine(3, 2, 99)])] as WmsPo[] });
      const w = cloneWms({ ...base, receivers: base.receivers.slice(0, 2) });
      run(w, 0, 1);
      expect(w.receivers.map((r) => [r.po, r.line])).toEqual([
        [7, 1],
        [7, 2],
      ]);
      expect(w.pos[0]!.lines.map((l) => l.status)).toEqual(['RECEIVING', 'RECEIVING', 'OPEN']);
    });
  });

  it('a supplier short or damaged units: logged in red, never put away', () => {
    withTunables({ ...CALM, wmsRcvShortChanceBp: 10_000, wmsDamageChanceBp: 10_000 }, () => {
      const w = wms({ 0: 0 }, { pos: [po(1, [poLine(1, 0, 40)])] as WmsPo[] });
      run(w, 0, 12 + T.wmsPutawayTicks.value / STEP + 1);
      const line = w.pos[0]!.lines[0]!;
      expect(line.short).toBeGreaterThanOrEqual(1);
      expect(line.short).toBeLessThanOrEqual(10);
      expect(line.damaged).toBeGreaterThanOrEqual(1);
      expect(line.damaged).toBeLessThanOrEqual(T.wmsDamageMaxUnits.value);
      expect(line.received).toBe(40 - line.short - line.damaged);
      expect(w.inventory[0]!.onHand).toBe(line.received);
      expect(codes(w)).toEqual(expect.arrayContaining(['RCV SHORT', 'DAMAGE']));
      expect(w.inbound).toMatchObject({ unitsShort: line.short, unitsDamaged: line.damaged, unitsReceived: line.received });
    });
  });

  it('closed POs beyond the keep limit drop off', () => {
    withTunables({ ...CALM, wmsKeepClosedPos: 2, wmsPutawayTicks: 0 }, () => {
      const pos = [1, 2, 3, 4].map((no) => po(no, [poLine(1, 0, 1)]));
      const w = wms({}, { pos });
      run(w, 0, 12);
      expect(w.pos.map((p) => [p.no, p.status])).toEqual([
        [3, 'CLOSED'],
        [4, 'CLOSED'],
      ]);
      expect(w.inbound.posClosed).toBe(4);
    });
  });
});

describe('WMS cycle counts (W6)', () => {
  it('counts each SKU in turn; a match is accurate and changes nothing', () => {
    withTunables(CALM, () => {
      const w = wms({ 0: 30, 1: 12 });
      const r = roller(w);
      cycleCount(w, r, 10);
      cycleCount(w, r, 20);
      expect(w.countCursor).toBe(2);
      expect(w.inventory.slice(0, 3).map((s) => [s.onHand, s.counted, s.variance])).toEqual([
        [30, 10, 0],
        [12, 20, 0],
        [1000, -1, 0],
      ]);
      expect(w.inbound).toMatchObject({ counts: 2, countsAccurate: 2 });
      expect(w.events.map((e) => [e.code, e.sku, e.qty, e.of])).toEqual([
        ['CYCLE CNT', 0, 30, 30],
        ['CYCLE CNT', 1, 12, 12],
      ]);
      for (let i = 0; i < WMS_SKUS.length - 2; i++) cycleCount(w, r, 30);
      expect(w.countCursor).toBe(0);
    });
  });

  it('a variance adjusts the bin to what is there and never takes allocated units', () => {
    withTunables({ ...CALM, wmsCountVarianceBp: 10_000 }, () => {
      const w = wms({}, {}, 0);
      for (const s of w.inventory) {
        s.onHand = 20;
        s.allocated = 18;
      }
      const r = roller(w);
      for (let i = 0; i < WMS_SKUS.length; i++) cycleCount(w, r, i);
      for (const s of w.inventory) {
        expect(s.onHand).toBeGreaterThanOrEqual(s.allocated);
        expect(s.onHand - 20).toBe(s.variance);
        expect(Math.abs(s.variance)).toBeLessThanOrEqual(T.wmsCountVarianceMax.value);
      }
      const adjusts = w.events.filter((e) => e.code === 'ADJUST');
      expect(adjusts.length).toBe(w.inventory.filter((s) => s.variance !== 0).length);
      expect(adjusts.some((e) => e.qty < 0)).toBe(true);
      expect(w.inbound.countsAccurate).toBe(WMS_SKUS.length - adjusts.length);
    });
  });
});

describe('WMS inbound in the warehouse (W6)', () => {
  it('every SKU has one supplier', () => {
    const all = WMS_SUPPLIERS.flatMap((s) => s.skus).sort((a, b) => a - b);
    expect(all).toEqual(WMS_SKUS.map((_, i) => i));
  });

  it('a new warehouse raises its first POs at its first WMS step', () => {
    const s = createWarehouse({ seed: 4 });
    expect(s.wms.pos).toEqual([]);
    expect(s.wms.receivers).toHaveLength(T.wmsReceivers.value);
    const after = advanceMany(s, STEP);
    expect(after.wms.pos.length).toBeGreaterThan(0);
    expect(after.wms.events.some((e) => e.code === 'PO CRT')).toBe(true);
  });

  it('over 20 minutes stock flows in: POs close, cycle counts run, units are picked out, and nothing goes negative', () => {
    const s = advanceMany(createWarehouse({ seed: 2 }), 20 * 60 * 4);
    const w = s.wms;
    expect(w.inbound.posClosed).toBeGreaterThan(5);
    expect(w.inbound.unitsReceived).toBeGreaterThan(1000);
    expect(w.inbound.counts).toBeGreaterThanOrEqual(Math.floor((20 * 60 * 4) / T.wmsCountTicks.value) - 1);
    expect(w.inventory.reduce((n, x) => n + x.picked, 0)).toBeGreaterThan(0);
    for (const x of w.inventory) {
      expect(x.onHand).toBeGreaterThanOrEqual(0);
      expect(x.allocated).toBeGreaterThanOrEqual(0);
      expect(x.allocated).toBeLessThanOrEqual(x.onHand);
    }
    const doors = w.pos.filter((p) => p.status === 'RECEIVING').map((p) => p.door);
    expect(new Set(doors).size).toBe(doors.length);
    expect(doors.length).toBeLessThanOrEqual(T.wmsDockDoors.value);
  });

  it('catching up equals stepping one tick at a time (P4)', () => {
    const start = createWarehouse({ seed: 9 });
    let stepped = start;
    for (let i = 0; i < 1200; i++) stepped = step(stepped, []).state;
    expect(hashState(advanceMany(start, 1200))).toBe(hashState(stepped));
  });

  it('wmsStep runs planning, inbound and counts on their clocks', () => {
    const w = wms({ 0: 0 }, { nextReplenAt: 0, nextCountAt: 0 });
    wmsStep(w, 0, 0);
    expect(w.pos).toHaveLength(1);
    expect(w.nextReplenAt).toBe(T.wmsReplenTicks.value);
    expect(w.inbound.counts).toBe(1);
    expect(w.nextCountAt).toBe(T.wmsCountTicks.value);
  });
});
