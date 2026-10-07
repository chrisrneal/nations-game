import type { RngState, WmsEvent, WmsLine, WmsOrder, WmsPicker, WmsPriority, WmsState, WmsStock } from '@warehouse/contracts';
import { mix32, randomInt, seedRng } from '../rng.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_BIN_SPREAD, WMS_DESTINATIONS, WMS_FIRST_ORDER_NO, WMS_SKUS } from './catalog.ts';

/** Salts the WMS stream away from the warehouse's own RNG ("WMS!"). */
const WMS_SALT = 0x574d5321;
const BP = 10_000;

/** Draws in place: the generator threads one stream through every roll. */
class Roller {
  constructor(public rng: RngState) {}
  int(min: number, max: number): number {
    const draw = randomInt(this.rng, min, max);
    this.rng = draw.rng;
    return draw.value;
  }
}

function rollPriority(r: Roller): WmsPriority {
  const roll = r.int(0, BP - 1);
  if (roll < T.wmsExpediteChanceBp.value) return 1;
  if (roll < T.wmsExpediteChanceBp.value + T.wmsHighChanceBp.value) return 2;
  return 3;
}

/** Lead time to ship-by: Expedite gets half of a Standard lead time, High three quarters. */
function rollLead(r: Roller, priority: WmsPriority): number {
  const standard = r.int(T.wmsCutoffMinTicks.value, T.wmsCutoffMaxTicks.value);
  return Math.floor((standard * (priority + 1)) / 4);
}

function rollLines(r: Roller, bins: readonly number[]): WmsLine[] {
  const count = r.int(1, Math.min(T.wmsLinesMax.value, WMS_SKUS.length));
  const used = new Set<number>();
  const lines: WmsLine[] = [];
  for (let no = 1; no <= count; no++) {
    let sku = r.int(0, WMS_SKUS.length - 1);
    while (used.has(sku)) sku = (sku + 1) % WMS_SKUS.length;
    used.add(sku);
    const ordered = r.int(T.wmsQtyMin.value, T.wmsQtyMax.value);
    lines.push({ no, sku, bin: bins[sku] as number, ordered, allocated: 0, picked: 0, short: 0, status: 'OPEN' });
  }
  return lines;
}

/**
 * A new warehouse's WMS (docs/wms-plan.md slice 1): one bin per SKU, a pool of
 * idle pickers, and 10-15 sample orders from customers abroad, each logged as
 * ORD CRT. The game has no trade deals or other commitments to turn into
 * orders, so every order is a sample. Each SKU is stocked at a random share of
 * what is ordered of it, so some lines will run short. Seeded from `seed` on
 * its own stream: the same seed gives the same WMS, and the warehouse's RNG is
 * never drawn from.
 */
export function createWms(options: { readonly seed: number; readonly tick: number; readonly contract: number }): WmsState {
  const r = new Roller(seedRng(mix32(options.seed ^ WMS_SALT)));
  const bins = WMS_SKUS.map((_, sku) => sku * WMS_BIN_SPREAD + r.int(0, WMS_BIN_SPREAD - 1));
  const count = r.int(T.wmsSampleOrdersMin.value, Math.max(T.wmsSampleOrdersMin.value, T.wmsSampleOrdersMax.value));
  const orders: WmsOrder[] = [];
  for (let i = 0; i < count; i++) {
    const dest = r.int(0, WMS_DESTINATIONS.length - 1);
    const priority = rollPriority(r);
    const shipBy = options.tick + rollLead(r, priority);
    const lines = rollLines(r, bins);
    orders.push({ no: WMS_FIRST_ORDER_NO + i, dest, source: options.contract, priority, wave: 0, status: 'NEW', lines, shipBy, created: options.tick });
  }
  const ordered = WMS_SKUS.map(() => 0);
  for (const order of orders) for (const line of order.lines) ordered[line.sku] = (ordered[line.sku] ?? 0) + line.ordered;
  const inventory: WmsStock[] = bins.map((bin, sku) => {
    const units = ordered[sku] ?? 0;
    const onHand = units > 0 ? Math.floor((units * r.int(T.wmsStockCoverMinPct.value, T.wmsStockCoverMaxPct.value)) / 100) : r.int(T.wmsQtyMin.value, T.wmsQtyMax.value);
    return { sku, bin, onHand, allocated: 0 };
  });
  const pickers: WmsPicker[] = Array.from({ length: T.wmsPickers.value }, (_, i) => ({ id: i + 1, order: 0, line: 0, progress: 0 }));
  const events: WmsEvent[] = orders.map((o) => ({ tick: options.tick, code: 'ORD CRT', order: o.no, line: 0, qty: o.lines.reduce((n, l) => n + l.ordered, 0), picker: 0 }));
  return { rng: r.rng, nextOrderNo: WMS_FIRST_ORDER_NO + count, nextWave: 1, orders, inventory, pickers, events: events.slice(-T.wmsEventsKept.value) };
}
