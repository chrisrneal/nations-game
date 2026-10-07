/**
 * WMS slice 9: 300 orders and 2,000 lines stay cheap for the sim and its
 * View, which is built on every tick the interface sees.
 */
import { describe, expect, it } from 'vitest';
import { advanceMany, hashState, step, warehouseView } from '@warehouse/sim';
import { LOAD_LINES, LOAD_ORDERS, wmsUnderLoad } from './wms-load.ts';

describe('the WMS under load (slice 9)', () => {
  it('holds 300 orders and 2,000 lines, all valid State', () => {
    const s = wmsUnderLoad();
    expect(s.wms.orders).toHaveLength(LOAD_ORDERS);
    expect(s.wms.orders.reduce((n, o) => n + o.lines.length, 0)).toBe(LOAD_LINES);
    expect(() => hashState(s)).not.toThrow();
  });

  it('a minute of it steps and views quickly enough for a phone (a tick and its View well under 4 ms here)', () => {
    let s = advanceMany(wmsUnderLoad(), 40);
    expect(s.wms.orders.some((o) => o.status === 'PICKING')).toBe(true);
    const start = performance.now();
    for (let i = 0; i < 240; i++) {
      s = step(s, []).state;
      warehouseView(s);
    }
    const perTick = (performance.now() - start) / 240;
    expect(perTick).toBeLessThan(4);
  });
});
