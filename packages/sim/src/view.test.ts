import { describe, expect, it } from 'vitest';
import { createWarehouse, offlineCapTicks } from './state.ts';
import { advanceMany } from './step.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { warehouseView } from './view.ts';

describe('the view (S6, P5)', () => {
  it('opens on day 1 at 06:00 and moves a warehouse minute a second', () => {
    const v = warehouseView(createWarehouse({ seed: 1 }));
    expect(v.clock).toEqual({ day: 1, minute: 360, ticksPerMinute: T.wmsMinuteTicks.value, startMinute: 360 });
    const later = warehouseView(advanceMany(createWarehouse({ seed: 1 }), 60 * 4));
    expect(later.clock.minute).toBe(420);
    expect(later.offlineCapMinutes).toBe(T.offlineCapMinutes.value);
  });

  it('shows every worker with its tasks, and what hiring and a door cost', () => {
    const v = warehouseView(advanceMany(createWarehouse({ seed: 4 }), 600));
    expect(v.wms.workers).toHaveLength(T.wmsStartPickers.value + T.wmsStartReceivers.value);
    expect(v.wms.workers.some((p) => p.task !== null)).toBe(true);
    for (const p of v.wms.workers) {
      if (p.task !== null) expect(p.task.status).toBe('ACTIVE');
      for (const q of p.queue) expect(q.status).toBe('QUEUED');
      expect(p.name).toMatch(/^W\d\d$/);
    }
    expect(v.wms.growth).toEqual({
      hireCost: T.wmsHireCostCents.value,
      maxCrew: T.wmsMaxCrew.value,
      doorCost: T.wmsDoorCostCents.value,
      maxDoors: T.wmsMaxDoors.value,
      shipDoorCost: T.wmsShipDoorCostCents.value,
      maxShipDoors: T.wmsMaxShipDoors.value,
    });
  });

  it('shows each outbound door: its trailer, when it leaves, and what is loaded and staged (W10)', () => {
    const s = advanceMany(createWarehouse({ seed: 4 }), 1200);
    const v = warehouseView(s);
    expect(v.wms.shipDoors.map((d) => d.code)).toEqual(Array.from({ length: T.wmsShipDoors.value }, (_, i) => `S${i + 1}`));
    for (const d of v.wms.shipDoors) {
      expect(d.trailer).toMatch(/^TR-\d{4}$/);
      expect(d.departsIn).toBe(d.departs - s.tick);
      expect(d.departsIn).toBeGreaterThanOrEqual(0);
      expect(d.capacity).toBe(T.wmsTrailerUnits.value);
      for (const no of [...d.loaded, ...d.staged]) expect(v.wms.orders.find((o) => o.no === no)?.door).toBe(d.door);
    }
    expect(v.wms.layout.shipDoors).toBe(T.wmsShipDoors.value);
    expect(s.wms.stats.trailers).toBeGreaterThan(0);
  });
});

describe('catch-up speed (P4)', () => {
  it('steps the whole offline cap of a warehouse', () => {
    // Timed by `npm run harness -- bench` (Node and Chromium); here it must simply finish inside the test timeout.
    const s = { ...createWarehouse({ seed: 11 }), cash: 10 ** 9 };
    const after = advanceMany(s, offlineCapTicks());
    expect(after.tick).toBe(offlineCapTicks());
  });
});
