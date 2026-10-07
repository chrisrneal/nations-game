import { describe, expect, it } from 'vitest';
import type { WmsOrderView } from '@warehouse/contracts';
import { HEAD_H, ROW_H, clock, countdown, filterCounts, matches, nextSort, rowSignature, rowWindow, sortOrders, statusTone } from './grid.ts';

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

  it('writes WMS time and countdowns', () => {
    expect(clock(408, 250)).toBe('T+0142');
    expect(clock(0, 250)).toBe('T+0000');
    expect(clock(240 * 125, 250)).toBe('T+12500');
    expect(countdown(600, 250)).toBe('2:30');
    expect(countdown(-130, 250)).toBe('-0:32');
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
