import type { RngState, WmsLine, WmsOrder, WmsPriority } from '@warehouse/contracts';
import { randomInt } from '../rng.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_CUSTOMERS, WMS_DESTINATIONS, WMS_SKUS } from './catalog.ts';

const BP = 10_000;

/** Draws in place: the WMS threads one stream through every roll. */
export class Roller {
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

/** A NEW order from a customer abroad: country, customer, priority, ship-by and 1-5 lines (RULES 4). `bins` is each SKU's bin. */
export function rollOrder(r: Roller, no: number, tick: number, bins: readonly number[]): WmsOrder {
  const dest = r.int(0, WMS_DESTINATIONS.length - 1);
  const customer = r.int(0, WMS_CUSTOMERS.length - 1);
  const priority = rollPriority(r);
  const shipBy = tick + rollLead(r, priority);
  const lines = rollLines(r, bins);
  return { no, dest, customer, priority, wave: 0, status: 'NEW', lines, shipBy, created: tick, next: 0, late: false, held: null, closed: 0, expedited: false, door: 0 };
}

/** Units ordered on the lines not cancelled. */
export function unitsOf(order: WmsOrder): number {
  let units = 0;
  for (const line of order.lines) if (line.status !== 'CANCELLED') units += line.ordered;
  return units;
}
