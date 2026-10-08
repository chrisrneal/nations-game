import { describe, expect, it } from 'vitest';
import type { WmsEvent } from '@warehouse/contracts';
import { createWarehouse } from '../state.ts';
import { advanceMany } from '../step.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { warehouseView } from '../view.ts';
import { eventText } from './view.ts';

function ev(e: Partial<WmsEvent> & Pick<WmsEvent, 'code'>): WmsEvent {
  return { tick: 0, order: 0, line: 0, sku: -1, qty: 0, of: 0, picker: 0, ...e };
}

describe('WMS view (RULES 10)', () => {
  it('writes activity lines like a real WMS console', () => {
    expect(eventText(ev({ code: 'PICK CONF', order: 10234, line: 3, sku: 0, qty: 24, of: 24, picker: 7 }))).toEqual({ ref: 'O-10234/L3', detail: 'GRN-0042  24/24  W07' });
    expect(eventText(ev({ code: 'WAVE REL', order: 10240, qty: 3 }))).toEqual({ ref: 'O-10240', detail: 'W-0003' });
    expect(eventText(ev({ code: 'HIRE', picker: 10, line: 1, qty: 10 }))).toEqual({ ref: 'W10', detail: 'hired to pick, crew 10' });
    expect(eventText(ev({ code: 'ALLOC SHORT', order: 10234, line: 1, sku: 4, qty: 6, of: 10 }))).toEqual({ ref: 'O-10234/L1', detail: 'STL-0310  short 6/10' });
  });

  it('lists every order with codes, country, counts and percent picked; open orders first', () => {
    const view = warehouseView(advanceMany(createWarehouse({ seed: 3 }), 20 * 60 * 4));
    const { orders } = view.wms;
    expect(orders.length).toBeGreaterThan(10);
    const firstClosed = orders.findIndex((o) => !o.open);
    expect(firstClosed).toBeGreaterThan(0);
    expect(orders.slice(firstClosed).every((o) => !o.open)).toBe(true);
    for (const o of orders) {
      expect(o.code).toBe(`O-${o.no}`);
      expect(o.dest.iso).toMatch(/^[A-Z]{3}$/);
      expect(o.linesTotal).toBe(o.lines.length);
      expect(o.unitsOrdered).toBe(o.lines.reduce((n, l) => n + l.ordered, 0));
      expect(o.pct).toBe(Math.floor((o.unitsPicked * 100) / o.unitsOrdered));
      for (const l of o.lines) expect(l.bin).toMatch(/^[A-Z]-\d{2}-\d[AB]$/);
    }
    const shipped = orders.find((o) => o.status === 'SHIPPED');
    expect(shipped?.linesPicked).toBeGreaterThan(0);
  });

  it('shows the newest events first, the busy pickers on their lines, and the KPIs', () => {
    const view = warehouseView(advanceMany(createWarehouse({ seed: 5 }), 15 * 60 * 4));
    const w = view.wms;
    expect(w.events.length).toBe(T.wmsEventsKept.value);
    expect(w.events[0]?.tick).toBeGreaterThanOrEqual(w.events[w.events.length - 1]?.tick ?? 0);
    expect(new Set(w.events.map((e) => e.key)).size).toBe(w.events.length);
    const busy = w.workers.filter((p) => p.role === 'pick' && p.task !== null);
    for (const p of busy) {
      const o = w.orders.find((x) => x.no === p.task?.order);
      const line = o?.lines.find((l) => `${o.code}/L${l.no}` === p.task?.ref);
      expect(line?.picker).toBe(p.id);
      expect(line?.task).toBe(p.task?.no);
      expect(line?.status).toBe('PICKING');
    }
    expect(w.kpis).toMatchObject({ open: w.orders.filter((o) => o.open).length, pickersBusy: busy.length, pickersTotal: T.wmsStartPickers.value });
    expect(w.kpis.earnedPerHour).toBeGreaterThan(0);
    expect(w.kpis.linesPerHour).toBeGreaterThan(0);
    expect(w.kpis.otifPct).not.toBeNull();
    expect(w.kpis.exceptions).toBe(w.orders.filter((o) => o.exception).length);
    expect(w.countries).toHaveLength(15);
    expect(w.expediteCost).toBe(T.wmsExpediteCostCents.value);
  });

  it('changes rev once a WMS step, so the screens re-render once a second', () => {
    const s = createWarehouse({ seed: 1 });
    const revs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => warehouseView(advanceMany(s, n)).wms.rev);
    expect(revs).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2]);
  });
});

describe('WMS inbound and inventory view (W6)', () => {
  it('writes inbound and inventory lines like a real WMS console', () => {
    expect(eventText(ev({ code: 'PO CRT', order: 50001, qty: 400, of: 2 }))).toEqual({ ref: 'PO-50001', detail: '2 lines  400 units' });
    expect(eventText(ev({ code: 'DOCK', order: 50001, qty: 2 }))).toEqual({ ref: 'PO-50001', detail: 'door D2' });
    expect(eventText(ev({ code: 'RCV', order: 50001, line: 2, sku: 0, qty: 198, of: 200, picker: 3 }))).toEqual({ ref: 'PO-50001/L2', detail: 'GRN-0042  198/200  W03' });
    expect(eventText(ev({ code: 'DAMAGE', order: 50001, line: 1, sku: 8, qty: 2, of: 200 }))).toEqual({ ref: 'PO-50001/L1', detail: 'SOL-0450  2 damaged' });
    expect(eventText(ev({ code: 'PUTAWAY', order: 50001, line: 1, sku: 8, qty: 198, picker: 8 }))).toEqual({ ref: 'PO-50001/L1', detail: 'SOL-0450  +198 units  W08' });
    expect(eventText(ev({ code: 'CYCLE CNT', sku: 10, qty: 57, of: 57 }))).toEqual({ ref: 'CHP-2030', detail: '57 units, matched' });
    expect(eventText(ev({ code: 'CYCLE CNT', sku: 10, qty: 55, of: 57 }))).toEqual({ ref: 'CHP-2030', detail: '55 counted, system 57' });
    expect(eventText(ev({ code: 'ADJUST', sku: 10, qty: -2 }))).toEqual({ ref: 'CHP-2030', detail: '-2 units' });
    expect(eventText(ev({ code: 'ADJUST', sku: 10, qty: 1 }))).toEqual({ ref: 'CHP-2030', detail: '+1 units' });
  });

  it('lists POs with supplier, counts and percent received, open first; inbound events open the PO, not an order', () => {
    const view = warehouseView(advanceMany(createWarehouse({ seed: 3 }), 20 * 60 * 4));
    const w = view.wms;
    expect(w.pos.length).toBeGreaterThan(3);
    const firstClosed = w.pos.findIndex((p) => !p.open);
    expect(firstClosed).toBeGreaterThanOrEqual(0);
    expect(w.pos.slice(firstClosed).every((p) => !p.open)).toBe(true);
    for (const p of w.pos) {
      expect(p.code).toBe(`PO-${p.no}`);
      expect(p.supplier.length).toBeGreaterThan(0);
      expect(p.unitsExpected).toBe(p.lines.reduce((n, l) => n + l.expected, 0));
      expect(p.pct).toBe(Math.floor((p.unitsReceived * 100) / p.unitsExpected));
      if (!p.open) expect(p.unitsReceived + p.unitsDamaged + p.unitsShort).toBe(p.unitsExpected);
    }
    for (const e of w.events) {
      if (e.code === 'RCV' || e.code === 'PO CRT') expect([e.po > 0, e.order]).toEqual([true, 0]);
      if (e.code === 'PICK CONF') expect([e.order > 0, e.po]).toEqual([true, 0]);
    }
    const k = w.inboundKpis;
    expect(k.open).toBe(w.pos.filter((p) => p.open).length);
    expect(k.doorsTotal).toBe(T.wmsDoors.value);
    expect(k.receiversTotal).toBe(T.wmsStartReceivers.value);
    expect(k.onTimePct).not.toBeNull();
  });

  it('shows one inventory row per SKU with available, inbound and a status', () => {
    const view = warehouseView(advanceMany(createWarehouse({ seed: 6 }), 12 * 60 * 4));
    const { stock, inventoryKpis: k } = view.wms;
    expect(stock).toHaveLength(80);
    for (const row of stock) {
      expect(row.full).toBe(T.wmsReorderUnits.value + T.wmsReplenUnits.value);
      expect(row.available).toBe(Math.max(0, row.onHand - row.allocated));
      const expected = row.demand > row.available ? 'SHORT' : row.available === 0 ? 'OUT' : row.available < T.wmsReorderUnits.value ? 'LOW' : 'OK';
      expect(row.status).toBe(expected);
    }
    expect(k.skus).toBe(80);
    expect(k.onHand).toBe(stock.reduce((n, r) => n + r.onHand, 0));
    expect(k.low).toBe(stock.filter((r) => r.status !== 'OK').length);
    expect(k.accuracyPct).not.toBeNull();
    expect(stock.some((r) => r.counted >= 0)).toBe(true);
  });
});

describe('WMS crew and dock schedule view (W8)', () => {
  it('shows each worker’s active task, queue and finished work, and the crew KPIs', () => {
    const w = warehouseView(advanceMany(createWarehouse({ seed: 7 }), 10 * 60 * 4)).wms;
    expect(w.crewKpis.crew).toBe(w.workers.length);
    expect(w.crewKpis.working + w.crewKpis.walking + w.crewKpis.idle).toBe(w.workers.length);
    for (const p of w.workers) {
      expect(p.task === null).toBe(p.state === 'idle');
      for (const t of [...(p.task === null ? [] : [p.task]), ...p.queue, ...p.done]) {
        expect(t.worker).toBe(p.id);
        expect(t.code).toMatch(/^T-\d{5}$/);
        expect(t.kind === 'PICK' ? 'pick' : 'receive').toBe(p.role);
      }
      for (const t of p.done) expect(t.status).toBe('DONE');
      expect(p.done.map((t) => t.finished)).toEqual([...p.done.map((t) => t.finished)].sort((a, b) => b - a));
      expect(p.stats.busy + p.stats.walking + p.stats.idle).toBeGreaterThan(0);
    }
    const receive = w.workers.find((p) => p.task?.kind === 'RECEIVE');
    if (receive !== undefined) expect(receive.task?.where).toMatch(/^Dock D\d$/);
    expect(w.workers.some((p) => p.done.length > 0)).toBe(true);
  });

  it('books POs into appointment slots, no more than the doors a slot', () => {
    const view = warehouseView(advanceMany(createWarehouse({ seed: 3 }), 20 * 60 * 4));
    const { schedule, pos } = view.wms;
    expect(schedule.length).toBeGreaterThan(0);
    for (const slot of schedule) {
      expect(slot.at % T.wmsApptSlotTicks.value).toBe(0);
      expect(slot.pos.length).toBeLessThanOrEqual(view.wms.layout.doors);
    }
    for (const po of pos) expect(po.appt % T.wmsApptSlotTicks.value).toBe(0);
    const open = pos.filter((p) => p.open);
    expect(open.map((p) => p.appt)).toEqual([...open.map((p) => p.appt)].sort((a, b) => a - b));
  });
});
