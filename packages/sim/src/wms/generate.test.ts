import { describe, expect, it } from 'vitest';
import { hashState } from '../hash.ts';
import { createWarehouse } from '../state.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_AISLES, WMS_BAYS, WMS_BINS_PER_BAY, WMS_CUSTOMERS, WMS_DESTINATIONS, WMS_FIRST_ORDER_NO, WMS_SKUS, WMS_SUPPLIERS, binCode, binPlace, destinationAt, familyOf, orderCode, skuAt } from './catalog.ts';
import { binFullUnits } from './inbound.ts';
import { createWms } from './generate.ts';

const seeds = Array.from({ length: 50 }, (_, i) => i + 1);

describe('WMS catalog', () => {
  it('formats order numbers, SKUs, bins and countries like a real WMS', () => {
    expect(orderCode(10234)).toBe('O-10234');
    expect(binCode(0)).toBe('A-01-1A');
    expect(binCode(1)).toBe('A-01-1B');
    expect(binCode(2)).toBe('A-01-2A');
    expect(binCode(8)).toBe('A-02-1A');
    expect(binCode(160)).toBe('B-01-1A');
    for (const sku of WMS_SKUS) expect(sku.code).toMatch(/^[A-Z0-9]{3}-\d{4}$/);
    expect(new Set(WMS_SKUS.map((s) => s.code)).size).toBe(WMS_SKUS.length);
    for (const d of WMS_DESTINATIONS) expect(d.iso).toMatch(/^[A-Z]{3}$/);
    expect(skuAt(0).code).toBe('GRN-0042');
    expect(destinationAt(WMS_DESTINATIONS.length).iso).toBe(WMS_DESTINATIONS[0]?.iso);
  });

  it('stocks a SKU for every bay (W11): sixteen families of five, the first sixteen the SKUs stocked before', () => {
    expect(WMS_SKUS).toHaveLength(WMS_AISLES * WMS_BAYS);
    expect(WMS_SKUS.slice(0, 3).map((s) => s.code)).toEqual(['GRN-0042', 'RCE-0025', 'FRT-0091']);
    expect(WMS_SKUS[15]).toEqual({ code: 'TXT-0315', desc: 'Cotton textile roll' });
    expect(WMS_SKUS[16]).toEqual({ code: 'GRN-0142', desc: 'Wheat grain 50 kg' });
    expect(new Set(WMS_SKUS.map((s) => s.desc)).size).toBe(WMS_SKUS.length);
    expect(familyOf(16)).toBe(0);
    expect(familyOf(79)).toBe(15);
  });

  it('gives every SKU exactly one supplier, which supplies its whole family', () => {
    const all = WMS_SUPPLIERS.flatMap((s) => s.skus);
    expect([...all].sort((a, b) => a - b)).toEqual(WMS_SKUS.map((_, i) => i));
    for (const s of WMS_SUPPLIERS) for (const sku of s.skus) for (const other of WMS_SKUS.keys()) if (familyOf(other) === familyOf(sku)) expect(s.skus).toContain(other);
  });
});

describe('WMS sample order generator (slice 1)', () => {
  it('is deterministic: the same seed gives the same WMS, another seed another', () => {
    const a = createWms({ seed: 7, tick: 0 });
    expect(hashState(createWms({ seed: 7, tick: 0 }))).toBe(hashState(a));
    expect(hashState(createWms({ seed: 8, tick: 0 }))).not.toBe(hashState(a));
  });

  it(`makes ${T.wmsSampleOrdersMin.value}-${T.wmsSampleOrdersMax.value} NEW orders, numbered in sequence from O-${WMS_FIRST_ORDER_NO}`, () => {
    for (const seed of seeds) {
      const wms = createWms({ seed, tick: 40 });
      expect(wms.orders.length).toBeGreaterThanOrEqual(T.wmsSampleOrdersMin.value);
      expect(wms.orders.length).toBeLessThanOrEqual(T.wmsSampleOrdersMax.value);
      expect(wms.orders.map((o) => o.no)).toEqual(wms.orders.map((_, i) => WMS_FIRST_ORDER_NO + i));
      expect(wms.nextOrderNo).toBe(WMS_FIRST_ORDER_NO + wms.orders.length);
      expect(wms.nextWave).toBe(1);
      for (const o of wms.orders) {
        expect(o).toMatchObject({ status: 'NEW', wave: 0, created: 40 });
        expect(o.customer).toBeGreaterThanOrEqual(0);
        expect(o.customer).toBeLessThan(WMS_CUSTOMERS.length);
        expect([1, 2, 3]).toContain(o.priority);
        expect(o.dest).toBeGreaterThanOrEqual(0);
        expect(o.dest).toBeLessThan(WMS_DESTINATIONS.length);
      }
    }
  });

  it('gives each order 1 to wmsLinesMax lines of different SKUs, open and unpicked', () => {
    for (const seed of seeds) {
      for (const o of createWms({ seed, tick: 0 }).orders) {
        expect(o.lines.length).toBeGreaterThanOrEqual(1);
        expect(o.lines.length).toBeLessThanOrEqual(T.wmsLinesMax.value);
        expect(new Set(o.lines.map((l) => l.sku)).size).toBe(o.lines.length);
        o.lines.forEach((line, i) => {
          expect(line).toMatchObject({ no: i + 1, allocated: 0, picked: 0, short: 0, status: 'OPEN' });
          expect(line.ordered).toBeGreaterThanOrEqual(T.wmsQtyMin.value);
          expect(line.ordered).toBeLessThanOrEqual(T.wmsQtyMax.value);
          expect(line.sku).toBeLessThan(WMS_SKUS.length);
        });
      }
    }
  });

  it('sets ship-by from priority: Expedite half the Standard lead time, High three quarters', () => {
    const lo = T.wmsCutoffMinTicks.value;
    const hi = T.wmsCutoffMaxTicks.value;
    for (const seed of seeds) {
      for (const o of createWms({ seed, tick: 100 }).orders) {
        const lead = o.shipBy - o.created;
        const share = o.priority === 1 ? 2 : o.priority === 2 ? 3 : 4;
        expect(lead).toBeGreaterThanOrEqual(Math.floor((lo * share) / 4));
        expect(lead).toBeLessThanOrEqual(Math.floor((hi * share) / 4));
      }
    }
  });

  it('mixes priorities: mostly Standard, some High and Expedite', () => {
    const counts = [0, 0, 0, 0];
    for (const seed of seeds) for (const o of createWms({ seed, tick: 0 }).orders) counts[o.priority] = (counts[o.priority] ?? 0) + 1;
    const total = counts[1]! + counts[2]! + counts[3]!;
    expect(counts[1]! / total).toBeGreaterThan(0.04);
    expect(counts[1]! / total).toBeLessThan(0.18);
    expect(counts[2]! / total).toBeGreaterThan(0.15);
    expect(counts[3]!).toBeGreaterThan(counts[2]!);
  });

  it('stocks every SKU in its own bin, one SKU a bay so every bay of every aisle holds stock (W11), and lines point at their SKU’s bin', () => {
    for (const seed of seeds) {
      const wms = createWms({ seed, tick: 0 });
      expect(wms.inventory.map((s) => s.sku)).toEqual(WMS_SKUS.map((_, i) => i));
      for (const s of wms.inventory) {
        expect(s.allocated).toBe(0);
        expect(Math.floor(s.bin / WMS_BINS_PER_BAY)).toBe(s.sku);
      }
      const bays = new Set(wms.inventory.map((s) => { const p = binPlace(s.bin); return `${p.aisle}-${p.bay}`; }));
      expect(bays.size).toBe(WMS_AISLES * WMS_BAYS);
      for (const o of wms.orders) for (const line of o.lines) expect(line.bin).toBe(wms.inventory[line.sku]?.bin);
    }
  });

  it(`opens every SKU at ${T.wmsStockOpenMinPct.value}-${T.wmsStockOpenMaxPct.value}% of its bin's full mark (W11): the racks open well stocked`, () => {
    const full = binFullUnits();
    let sum = 0;
    let n = 0;
    for (const seed of seeds) {
      for (const s of createWms({ seed, tick: 0 }).inventory) {
        expect(s.onHand).toBeGreaterThanOrEqual(Math.floor((full * T.wmsStockOpenMinPct.value) / 100));
        expect(s.onHand).toBeLessThanOrEqual(Math.floor((full * T.wmsStockOpenMaxPct.value) / 100));
        sum += s.onHand;
        n += 1;
      }
    }
    expect(sum / n / full).toBeGreaterThan(0.7);
  });

  it('starts every worker idle at the dock, pickers first, and logs one ORD CRT per order with its units', () => {
    const wms = createWms({ seed: 3, tick: 12 });
    const crew = T.wmsStartPickers.value + T.wmsStartReceivers.value;
    expect(wms.workers).toEqual(
      Array.from({ length: crew }, (_, i) => ({ id: i + 1, role: i < T.wmsStartPickers.value ? 'pick' : 'receive', task: 0, queue: [], progress: 0, at: -1, walk: 0, stats: { tasks: 0, units: 0, busy: 0, walking: 0, idle: 0 } })),
    );
    expect(wms.tasks).toEqual([]);
    expect(wms.policy).toEqual({ pick: 'priority', release: 'waves', pickers: T.wmsStartPickers.value, waveTicks: T.wmsWaveTicks.value, labor: 'fixed' });
    expect(wms.events).toEqual(
      wms.orders.map((o) => ({ tick: 12, code: 'ORD CRT', order: o.no, line: 0, sku: -1, qty: o.lines.reduce((n, l) => n + l.ordered, 0), of: 0, picker: 0 })),
    );
  });

  it('a new warehouse opens with a WMS seeded from its seed', () => {
    const state = createWarehouse({ seed: 11 });
    expect(state.wms.orders.length).toBeGreaterThanOrEqual(T.wmsSampleOrdersMin.value);
    expect(hashState(state.wms)).toBe(hashState(createWarehouse({ seed: 11 }).wms));
    expect(hashState(createWarehouse({ seed: 12 }).wms)).not.toBe(hashState(state.wms));
  });
});
