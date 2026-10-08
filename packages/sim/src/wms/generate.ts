import type { WmsEvent, WmsOrder, WmsState, WmsStock } from '@warehouse/contracts';
import { dayAt } from '../clock.ts';
import { mix32, seedRng } from '../rng.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_BINS_PER_BAY, WMS_DESTINATIONS, WMS_FIRST_ORDER_NO, WMS_FIRST_PO_NO, WMS_RATE_BUCKETS, WMS_SKUS } from './catalog.ts';
import { binFullUnits } from './inbound.ts';
import { Roller, rollOrder, unitsOf } from './orders.ts';
import { defaultPolicy, newWorker, openingShipDoors } from './policy.ts';

/** Salts the WMS stream away from the seed itself ("WMS!"). */
const WMS_SALT = 0x574d5321;

/**
 * A new warehouse's WMS (RULES 3): one bin per SKU, a SKU a bay (W11), the opening crew
 * (`wmsStartPickers` picking, then `wmsStartReceivers` on the dock), the
 * WMS's own operating plan (W7), the opening dock doors, the outbound doors
 * and their first trailers (W10), and 20-30 sample
 * orders from customers abroad, each logged as ORD CRT. Each SKU opens at a
 * random share of its bin's full mark (W11), so the racks open well stocked.
 * Seeded from `seed` on its own stream: the same seed gives the same WMS.
 */
export function createWms(options: { readonly seed: number; readonly tick: number }): WmsState {
  const { tick } = options;
  const r = new Roller(seedRng(mix32(options.seed ^ WMS_SALT)));
  const bins = WMS_SKUS.map((_, sku) => sku * WMS_BINS_PER_BAY + r.int(0, WMS_BINS_PER_BAY - 1));
  const count = r.int(T.wmsSampleOrdersMin.value, Math.max(T.wmsSampleOrdersMin.value, T.wmsSampleOrdersMax.value));
  const orders: WmsOrder[] = [];
  for (let i = 0; i < count; i++) orders.push(rollOrder(r, WMS_FIRST_ORDER_NO + i, tick, bins));
  const full = binFullUnits();
  const inventory: WmsStock[] = bins.map((bin, sku) => {
    const pct = r.int(T.wmsStockOpenMinPct.value, Math.max(T.wmsStockOpenMinPct.value, T.wmsStockOpenMaxPct.value));
    return { sku, bin, onHand: Math.floor((full * pct) / 100), allocated: 0, picked: 0, counted: -1, variance: 0 };
  });
  const crew = T.wmsStartPickers.value + T.wmsStartReceivers.value;
  const workers = Array.from({ length: crew }, (_, i) => newWorker(i + 1, i < T.wmsStartPickers.value ? 'pick' : 'receive'));
  const events: WmsEvent[] = orders.map((o) => ({ tick, code: 'ORD CRT', order: o.no, line: 0, sku: -1, qty: unitsOf(o), of: 0, picker: 0 }));
  const nextOrderAt = tick + r.int(T.wmsOrderMinTicks.value, Math.max(T.wmsOrderMinTicks.value, T.wmsOrderMaxTicks.value));
  const buckets = (): number[] => Array.from({ length: WMS_RATE_BUCKETS }, () => 0);
  return {
    rng: r.rng,
    nextOrderNo: WMS_FIRST_ORDER_NO + count,
    nextWave: 1,
    nextWaveAt: tick + T.wmsFirstWaveTicks.value,
    nextOrderAt,
    nextReplenAt: tick,
    orders,
    inventory,
    workers,
    tasks: [],
    history: [],
    nextTaskNo: 1,
    events: events.slice(-T.wmsEventsKept.value),
    stats: { shipped: 0, onTime: 0, inFull: 0, otif: 0, linesPicked: 0, unitsOrdered: 0, unitsShipped: 0, cutoffMisses: 0, earned: 0, spent: 0, trailers: 0 },
    today: { day: dayAt(tick), shipped: 0, otif: 0, earned: 0, linesPicked: 0, posReceived: 0, unitsReceived: 0 },
    yesterday: null,
    dests: WMS_DESTINATIONS.map(() => ({ shipped: 0, otif: 0, goodwill: T.wmsGoodwillStart.value })),
    recent: buckets(),
    nextPoNo: WMS_FIRST_PO_NO,
    pos: [],
    doors: T.wmsDoors.value,
    shipDoors: openingShipDoors(tick),
    nextTrailerNo: T.wmsShipDoors.value + 1,
    nextCountAt: tick + T.wmsCountTicks.value,
    countCursor: 0,
    inbound: { posClosed: 0, posLate: 0, unitsReceived: 0, unitsDamaged: 0, unitsShort: 0, counts: 0, countsAccurate: 0 },
    recentIn: buckets(),
    recentPay: buckets(),
    policy: defaultPolicy(),
  };
}
