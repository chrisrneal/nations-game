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
    expect(v.wms.workers).toHaveLength(9);
    expect(v.wms.workers.some((p) => p.task !== null)).toBe(true);
    for (const p of v.wms.workers) {
      if (p.task !== null) expect(p.task.status).toBe('ACTIVE');
      for (const q of p.queue) expect(q.status).toBe('QUEUED');
      expect(p.name).toMatch(/^W\d\d$/);
    }
    expect(v.wms.growth).toEqual({ hireCost: T.wmsHireCostCents.value, maxCrew: T.wmsMaxCrew.value, doorCost: T.wmsDoorCostCents.value, maxDoors: T.wmsMaxDoors.value });
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
