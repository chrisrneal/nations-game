import { describe, expect, it } from 'vitest';
import type { WmsOrderView, WmsPoView, WmsStockView } from '@warehouse/contracts';
import { HEAD_H, PO_FILTERS, ROW_H, STOCK_FILTERS, clock, countMatches, countdown, filterCounts, matches, nextSort, nextSortKey, poMatches, poTone, rowSignature, rowWindow, signed, sortOrders, sortRows, statusTone, stockMatches, stockTone } from './grid.ts';

function row(no: number, extra: Partial<WmsOrderView> = {}): WmsOrderView {
  return {
    no,
    code: `O-${no}`,
    dest: { iso: 'DEU', flag: '🇩🇪', name: 'Germany' },
    source: 'Local shops',
    priority: 3,
    wave: 0,
    status: 'NEW',
    linesTotal: 2,
    linesPicked: 0,
    unitsOrdered: 10,
    unitsPicked: 0,
    shortUnits: 0,
    pct: 0,
    shipBy: 1000,
    created: 0,
    closed: 0,
    late: false,
    exception: false,
    open: true,
    expedited: false,
    door: 0,
    lines: [],
    ...extra,
  };
}

describe('WMS order grid helpers (slice 3)', () => {
  it('filters: open, picking, exceptions and shipped', () => {
    const orders = [row(1), row(2, { status: 'PICKING' }), row(3, { status: 'BACKORDER', exception: true }), row(4, { status: 'SHIPPED', open: false }), row(5, { status: 'CANCELLED', open: false })];
    expect(filterCounts(orders)).toEqual({ all: 5, open: 3, picking: 1, exceptions: 1, shipped: 1 });
    expect(orders.filter((o) => matches(o, 'open')).map((o) => o.no)).toEqual([1, 2, 3]);
  });

  it('colours chips by family: grey new, blue released, amber picking, green on its way, red exceptions', () => {
    expect(['NEW', 'ALLOCATED', 'PICKING', 'LOADED', 'BACKORDER', 'ON HOLD', 'CANCELLED'].map((s) => statusTone(s as WmsOrderView['status']))).toEqual([
      'new',
      'released',
      'picking',
      'done',
      'bad',
      'bad',
      'cancelled',
    ]);
  });

  it('sorts by a header (ties by order number), toggles direction, and a third tap clears it', () => {
    const orders = [row(3, { pct: 50 }), row(1, { pct: 90 }), row(2, { pct: 50 })];
    expect(sortOrders(orders, { key: 'pct', dir: 1 }).map((o) => o.no)).toEqual([2, 3, 1]);
    expect(sortOrders(orders, { key: 'pct', dir: -1 }).map((o) => o.no)).toEqual([1, 2, 3]);
    expect(sortOrders(orders, { key: 'status', dir: 1 }).map((o) => o.no)).toEqual([1, 2, 3]);
    expect(sortOrders(orders, null).map((o) => o.no)).toEqual([3, 1, 2]);
    expect(nextSort(null, 'pct')).toEqual({ key: 'pct', dir: 1 });
    expect(nextSort({ key: 'pct', dir: 1 }, 'pct')).toEqual({ key: 'pct', dir: -1 });
    expect(nextSort({ key: 'pct', dir: -1 }, 'pct')).toBeNull();
    expect(nextSort({ key: 'pct', dir: -1 }, 'no')).toEqual({ key: 'no', dir: 1 });
  });

  it('writes warehouse times of day and countdowns in warehouse time (W8)', () => {
    const time = { ticksPerMinute: 4, startMinute: 360 };
    expect(clock(0, time)).toBe('06:00');
    expect(clock(408, time)).toBe('07:42');
    expect(clock(4 * 18 * 60, time)).toBe('00:00');
    expect(countdown(600, time)).toBe('2h 30m');
    expect(countdown(-130, time)).toBe('-32m');
    expect(countdown(4 * 59, time)).toBe('59m');
  });

  it('a row changes signature only when what it shows changes', () => {
    expect(rowSignature(row(1))).toBe(rowSignature(row(1, { lines: [] })));
    expect(rowSignature(row(1, { pct: 10 }))).not.toBe(rowSignature(row(1)));
  });
});

describe('grid windowing (slice 9)', () => {
  it('renders the rows on screen plus a margin, in chunks, never past the ends', () => {
    expect(rowWindow(0, 600, 300)).toEqual({ start: 0, end: Math.ceil(600 / ROW_H) + 2 * 8 + 4 });
    const mid = rowWindow(HEAD_H + 100 * ROW_H, 600, 300);
    expect(mid.start).toBeLessThanOrEqual(100 - 8);
    expect(mid.start % 4).toBe(0);
    expect(mid.end).toBeGreaterThan(100 + Math.ceil(600 / ROW_H));
    expect(rowWindow(HEAD_H + 101 * ROW_H, 600, 300)).toEqual(mid);
    expect(rowWindow(1e6, 600, 300).end).toBe(300);
    expect(rowWindow(0, 600, 10)).toEqual({ start: 0, end: 10 });
    expect(rowWindow(0, 600, 0)).toEqual({ start: 0, end: 0 });
  });
});

function po(no: number, extra: Partial<WmsPoView> = {}): WmsPoView {
  return { no, code: `PO-${no}`, supplier: 'SunGrid', status: 'IN TRANSIT', created: 0, appt: 100, arrived: 0, closed: 0, late: false, door: 0, linesTotal: 1, linesReceived: 0, unitsExpected: 200, unitsReceived: 0, unitsDamaged: 0, unitsShort: 0, pct: 0, exception: false, open: true, lines: [], ...extra };
}

function sku(index: number, extra: Partial<WmsStockView> = {}): WmsStockView {
  return { index, sku: 'GRN-0042', desc: '', bin: 'A-01-1A', aisle: 0, bay: 1, onHand: 100, allocated: 0, available: 100, onOrder: 0, dock: 0, demand: 0, picked: 0, counted: -1, variance: 0, status: 'OK', ...extra };
}

describe('inbound and inventory grids (W6)', () => {
  it('filters POs by where they are, and counts every filter', () => {
    const pos = [po(1), po(2, { status: 'ARRIVED' }), po(3, { status: 'RECEIVING', exception: true }), po(4, { status: 'PUTAWAY' }), po(5, { status: 'CLOSED', open: false })];
    const counts = countMatches(pos, PO_FILTERS, poMatches);
    expect(counts).toEqual({ all: 5, open: 4, transit: 1, dock: 2, putaway: 1, exceptions: 1, closed: 1 });
    expect(pos.map((p) => poTone(p.status))).toEqual(['new', 'released', 'picking', 'done', 'done']);
  });

  it('filters SKUs: short, anything not OK, and anything on its way', () => {
    const rows = [sku(0), sku(1, { status: 'LOW' }), sku(2, { status: 'OUT' }), sku(3, { status: 'SHORT', demand: 5, onOrder: 200 }), sku(4, { dock: 12 })];
    expect(countMatches(rows, STOCK_FILTERS, stockMatches)).toEqual({ all: 5, short: 1, low: 3, inbound: 2 });
    expect(rows.map((r) => stockTone(r.status))).toEqual(['done', 'picking', 'bad', 'bad', 'done']);
  });

  it('sorts any column up, down, then off; ties by key', () => {
    expect(nextSortKey(null, 'eta')).toEqual({ key: 'eta', dir: 1 });
    expect(nextSortKey({ key: 'eta', dir: 1 }, 'eta')).toEqual({ key: 'eta', dir: -1 });
    expect(nextSortKey({ key: 'eta', dir: -1 }, 'eta')).toBeNull();
    const pos = [po(3, { appt: 5 }), po(1, { appt: 9 }), po(2, { appt: 5 })];
    expect(sortRows(pos, (p) => p.appt, -1, (p) => p.no).map((p) => p.no)).toEqual([1, 2, 3]);
    expect(pos.map((p) => p.no)).toEqual([3, 1, 2]);
    expect([signed(2), signed(-3), signed(0)]).toEqual(['+2', '-3', '0']);
  });
});
