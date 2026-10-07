/**
 * A WMS under load for the slice 9 performance check (docs/wms-plan.md): 300
 * open orders and 2,000 lines on a busy warehouse, every SKU well stocked so
 * waves, allocation and picking all run. Built from the real types and saved
 * like any warehouse, so the app imports it as a normal save file.
 */
import type { WarehouseState, WmsLine, WmsOrder } from '@warehouse/contracts';
import { WMS_SKUS } from '@warehouse/sim';
import { busyWarehouse } from './warehouse.ts';

export const LOAD_ORDERS = 300;
export const LOAD_LINES = 2000;

export function wmsUnderLoad(): WarehouseState {
  const base = busyWarehouse();
  const w = base.wms;
  const bins = w.inventory.map((s) => s.bin);
  const orders: WmsOrder[] = [];
  let lines = 0;
  for (let i = 0; i < LOAD_ORDERS; i++) {
    const count = Math.min(WMS_SKUS.length, Math.ceil((LOAD_LINES - lines) / (LOAD_ORDERS - i)));
    const orderLines: WmsLine[] = Array.from({ length: count }, (_, k) => {
      const sku = (i * 5 + k) % WMS_SKUS.length;
      return { no: k + 1, sku, bin: bins[sku] ?? 0, ordered: 4 + ((i * 7 + k * 3) % 40), allocated: 0, picked: 0, short: 0, status: 'OPEN' };
    });
    lines += count;
    orders.push({
      no: w.nextOrderNo + i,
      dest: i % 15,
      customer: i % 8,
      priority: ((i % 10) === 0 ? 1 : i % 4 === 0 ? 2 : 3) as 1 | 2 | 3,
      wave: 0,
      status: 'NEW',
      lines: orderLines,
      shipBy: base.tick + 2400 + (i % 60) * 40,
      created: base.tick,
      next: 0,
      late: false,
      held: null,
      closed: 0,
      expedited: false,
    });
  }
  return {
    ...base,
    wms: {
      ...w,
      nextOrderNo: w.nextOrderNo + LOAD_ORDERS,
      nextWaveAt: base.tick + 8,
      orders,
      inventory: w.inventory.map((s) => ({ ...s, onHand: 100_000, allocated: 0 })),
      // The pickers start free (their orders are replaced); the receivers carry on with the trucks.
      workers: w.workers.map((p) => (p.role === 'pick' ? { ...p, task: 0, queue: [], progress: 0, walk: 0 } : p)),
      tasks: w.tasks.filter((t) => t.kind !== 'PICK'),
    },
  };
}
