import type { WmsEvent, WmsOrder, WmsPicker, WmsState, WmsStock } from '@warehouse/contracts';
import { mix32, seedRng } from '../rng.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_BIN_SPREAD, WMS_DESTINATIONS, WMS_FIRST_ORDER_NO, WMS_RATE_BUCKETS, WMS_SKUS } from './catalog.ts';
import { Roller, rollOrder, unitsOf } from './orders.ts';

/** Salts the WMS stream away from the warehouse's own RNG ("WMS!"). */
const WMS_SALT = 0x574d5321;

/**
 * A new warehouse's WMS (RULES 16): one bin per SKU, a pool of idle pickers,
 * and 10-15 sample orders from customers abroad, each logged as ORD CRT. The
 * game has no trade deals or other commitments to turn into orders, so every
 * order is a sample. Each SKU is stocked at a random share of what is ordered
 * of it, so some lines will run short. Seeded from `seed` on its own stream:
 * the same seed gives the same WMS, and the warehouse's RNG is never drawn
 * from.
 */
export function createWms(options: { readonly seed: number; readonly tick: number; readonly contract: number }): WmsState {
  const { tick, contract } = options;
  const r = new Roller(seedRng(mix32(options.seed ^ WMS_SALT)));
  const bins = WMS_SKUS.map((_, sku) => sku * WMS_BIN_SPREAD + r.int(0, WMS_BIN_SPREAD - 1));
  const count = r.int(T.wmsSampleOrdersMin.value, Math.max(T.wmsSampleOrdersMin.value, T.wmsSampleOrdersMax.value));
  const orders: WmsOrder[] = [];
  for (let i = 0; i < count; i++) orders.push(rollOrder(r, WMS_FIRST_ORDER_NO + i, tick, contract, bins));
  const ordered = WMS_SKUS.map(() => 0);
  for (const order of orders) for (const line of order.lines) ordered[line.sku] = (ordered[line.sku] ?? 0) + line.ordered;
  const inventory: WmsStock[] = bins.map((bin, sku) => {
    const units = ordered[sku] ?? 0;
    const onHand = units > 0 ? Math.floor((units * r.int(T.wmsStockCoverMinPct.value, T.wmsStockCoverMaxPct.value)) / 100) : r.int(T.wmsQtyMin.value, T.wmsQtyMax.value);
    return { sku, bin, onHand, allocated: 0 };
  });
  const pickers: WmsPicker[] = Array.from({ length: T.wmsPickers.value }, (_, i) => ({ id: i + 1, order: 0, line: 0, progress: 0 }));
  const events: WmsEvent[] = orders.map((o) => ({ tick, code: 'ORD CRT', order: o.no, line: 0, sku: -1, qty: unitsOf(o), of: 0, picker: 0 }));
  const nextOrderAt = tick + r.int(T.wmsOrderMinTicks.value, Math.max(T.wmsOrderMinTicks.value, T.wmsOrderMaxTicks.value));
  return {
    rng: r.rng,
    nextOrderNo: WMS_FIRST_ORDER_NO + count,
    nextWave: 1,
    nextWaveAt: tick + T.wmsFirstWaveTicks.value,
    nextOrderAt,
    nextReplenAt: tick + T.wmsReplenTicks.value,
    orders,
    inventory,
    pickers,
    events: events.slice(-T.wmsEventsKept.value),
    stats: { shipped: 0, onTime: 0, inFull: 0, otif: 0, linesPicked: 0, unitsOrdered: 0, unitsShipped: 0, cutoffMisses: 0 },
    dests: WMS_DESTINATIONS.map(() => ({ shipped: 0, otif: 0, goodwill: T.wmsGoodwillStart.value })),
    recent: Array.from({ length: WMS_RATE_BUCKETS }, () => 0),
  };
}
