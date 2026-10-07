import type { WmsOrderStatus, WmsState } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, WMS_SUPPLIERS } from './catalog.ts';
import { log, type MPo, type MPoLine, type MWms } from './mutable.ts';
import { newTask } from './tasks.ts';
import type { Roller } from './orders.ts';

const BP = 10_000;

/** The supplier of each SKU (W6): every SKU is in exactly one supplier's list. */
const SUPPLIER_OF: readonly number[] = (() => {
  const of: number[] = [];
  WMS_SUPPLIERS.forEach((s, i) => {
    for (const sku of s.skus) of[sku] = i;
  });
  return of;
})();

/** Order statuses whose lines may still take stock: not yet past picking. */
const BEFORE_PICKED: ReadonlySet<WmsOrderStatus> = new Set(['NEW', 'RELEASED', 'ALLOCATED', 'PICKING', 'BACKORDER']);

/**
 * Units each SKU's order lines are waiting for (W6): lines not yet given any
 * stock, on orders not yet past picking (NEW orders too: they will be
 * released within a minute). Indexed by SKU.
 */
export function waitingUnits(w: Pick<WmsState, 'orders' | 'inventory'>): number[] {
  const units = w.inventory.map(() => 0);
  for (const o of w.orders) {
    const status = o.status === 'ON HOLD' ? (o.held ?? o.status) : o.status;
    if (!BEFORE_PICKED.has(status)) continue;
    for (const l of o.lines) {
      const waiting = l.status === 'OPEN' || (l.status === 'SHORT' && l.allocated === 0 && l.picked === 0);
      if (waiting && l.sku < units.length) units[l.sku] = (units[l.sku] ?? 0) + l.ordered - l.allocated;
    }
  }
  return units;
}

/** Units on open PO lines, by SKU (W6): still to count in (`onOrder`) and counted in but not yet in the bin (`dock`). */
export function inboundUnits(w: Pick<WmsState, 'pos' | 'inventory'>): { onOrder: number[]; dock: number[] } {
  const onOrder = w.inventory.map(() => 0);
  const dock = w.inventory.map(() => 0);
  for (const po of w.pos) {
    if (po.status === 'CLOSED') continue;
    for (const l of po.lines) {
      if (l.sku >= onOrder.length) continue;
      if (l.status === 'OPEN' || l.status === 'RECEIVING') onOrder[l.sku] = (onOrder[l.sku] ?? 0) + l.expected;
      else if (l.status === 'RECEIVED') dock[l.sku] = (dock[l.sku] ?? 0) + l.received;
    }
  }
  return { onOrder, dock };
}

/** POs booked into the appointment slot starting at `at`. */
function booked(w: MWms, at: number): number {
  let n = 0;
  for (const po of w.pos) if (po.appt === at) n += 1;
  return n;
}

/**
 * The dock appointment a new PO books (RULES 5, W8): the first slot of
 * `wmsApptSlotTicks` starting at or after `earliest` with fewer POs booked
 * than the warehouse has dock doors.
 */
export function bookSlot(w: MWms, earliest: number): number {
  const slot = T.wmsApptSlotTicks.value;
  let at = Math.ceil(earliest / slot) * slot;
  while (booked(w, at) >= w.doors) at += slot;
  return at;
}

/**
 * Reorder planning (RULES 5, W6): every SKU whose position (available, plus
 * inbound, less the units order lines wait for) is under the reorder point is
 * ordered up to the reorder point plus `wmsReplenUnits`, one PO per supplier.
 * Each PO books a dock appointment (W8) after the supplier's lead time; its
 * truck comes up to `wmsPoEarlyMaxTicks` early, or with a share of trucks
 * late, by a draw made now.
 */
export function planReorders(w: MWms, r: Roller, tick: number): void {
  const waiting = waitingUnits(w);
  const { onOrder, dock } = inboundUnits(w);
  const bySupplier = new Map<number, MPoLine[]>();
  for (const stock of w.inventory) {
    const position = stock.onHand - stock.allocated + (onOrder[stock.sku] ?? 0) + (dock[stock.sku] ?? 0) - (waiting[stock.sku] ?? 0);
    if (position >= T.wmsReorderUnits.value) continue;
    const supplier = SUPPLIER_OF[stock.sku] ?? 0;
    const lines = bySupplier.get(supplier) ?? [];
    const expected = T.wmsReorderUnits.value + T.wmsReplenUnits.value - position;
    lines.push({ no: lines.length + 1, sku: stock.sku, bin: stock.bin, expected, received: 0, damaged: 0, short: 0, status: 'OPEN' });
    bySupplier.set(supplier, lines);
  }
  for (const supplier of [...bySupplier.keys()].sort((a, b) => a - b)) {
    const lines = bySupplier.get(supplier) ?? [];
    const appt = bookSlot(w, tick + r.int(T.wmsPoLeadMinTicks.value, Math.max(T.wmsPoLeadMinTicks.value, T.wmsPoLeadMaxTicks.value)));
    const late = r.int(0, BP - 1) < T.wmsPoLateChanceBp.value;
    const offset = late ? r.int(40, Math.max(40, T.wmsPoLateMaxTicks.value)) : -r.int(0, T.wmsPoEarlyMaxTicks.value);
    const arrive = Math.max(tick + 1, appt + offset);
    const po: MPo = { no: w.nextPoNo, supplier, status: 'IN TRANSIT', lines, created: tick, appt, arrive, arrived: 0, door: 0, closed: 0, late: false };
    w.nextPoNo += 1;
    w.pos.push(po);
    let units = 0;
    for (const l of lines) units += l.expected;
    log(w, { tick, code: 'PO CRT', order: po.no, qty: units, of: lines.length });
  }
}

/** A worker reached the end of a PO line at the dock: what really came, what was short and what was damaged (RULES 5, W6). */
export function confirmReceipt(w: MWms, r: Roller, po: MPo, line: MPoLine, worker: number, tick: number): void {
  let short = 0;
  let damaged = 0;
  if (r.int(0, BP - 1) < T.wmsRcvShortChanceBp.value) short = r.int(1, Math.max(1, Math.floor(line.expected / 4)));
  if (line.expected - short > 0 && r.int(0, BP - 1) < T.wmsDamageChanceBp.value) damaged = r.int(1, Math.min(T.wmsDamageMaxUnits.value, line.expected - short));
  line.short = short;
  line.damaged = damaged;
  line.received = line.expected - short - damaged;
  line.status = 'RECEIVED';
  const s = w.inbound;
  s.unitsReceived += line.received;
  s.unitsDamaged += damaged;
  s.unitsShort += short;
  w.today.unitsReceived += line.received;
  const bucket = Math.floor(tick / WMS_RATE_BUCKET_TICKS) % WMS_RATE_BUCKETS;
  w.recentIn[bucket] = (w.recentIn[bucket] ?? 0) + line.received;
  log(w, { tick, code: 'RCV', order: po.no, line: line.no, sku: line.sku, qty: line.received, of: line.expected, picker: worker });
  if (short > 0) log(w, { tick, code: 'RCV SHORT', order: po.no, line: line.no, sku: line.sku, qty: short, of: line.expected, picker: worker });
  if (damaged > 0) log(w, { tick, code: 'DAMAGE', order: po.no, line: line.no, sku: line.sku, qty: damaged, of: line.expected, picker: worker });
}

/** A worker set a received line down in its bin (RULES 5, W8): its units can be allocated from now on. */
export function storeLine(w: MWms, po: MPo, line: MPoLine, worker: number, tick: number): void {
  line.status = 'STORED';
  const stock = w.inventory[line.sku];
  if (stock !== undefined) stock.onHand += line.received;
  log(w, { tick, code: 'PUTAWAY', order: po.no, line: line.no, sku: line.sku, qty: line.received, picker: worker });
}

/** Drops the oldest closed POs beyond `wmsKeepClosedPos`. */
function purgePos(w: MWms): void {
  let drop = w.pos.filter((po) => po.status === 'CLOSED').length - T.wmsKeepClosedPos.value;
  if (drop <= 0) return;
  w.pos = w.pos.filter((po) => {
    if (drop > 0 && po.status === 'CLOSED') {
      drop -= 1;
      return false;
    }
    return true;
  });
}

/**
 * One inbound step (RULES 5, W6, W8): trucks arrive (or pass their
 * appointment and are late); a PO frees its door once every line is counted
 * in (PUTAWAY), and closes once every line is in its bin; then trucks in the
 * yard dock at the free doors (earliest appointment first), which creates a
 * RECEIVE task for every line. The workers do the counting and the
 * put-away (tasks.ts).
 */
export function stepInbound(w: MWms, tick: number): void {
  for (const po of w.pos) {
    if (po.status !== 'IN TRANSIT') continue;
    if (tick >= po.arrive) {
      po.status = 'ARRIVED';
      po.arrived = tick;
      let units = 0;
      for (const l of po.lines) units += l.expected;
      log(w, { tick, code: 'ARRIVE', order: po.no, qty: units });
    }
    if (!po.late && tick > po.appt && po.arrived === 0) {
      po.late = true;
      w.inbound.posLate += 1;
      log(w, { tick, code: 'PO LATE', order: po.no });
    }
  }
  let closedNow = false;
  for (const po of w.pos) {
    if (po.status === 'RECEIVING' && po.lines.every((l) => l.status === 'RECEIVED' || l.status === 'STORED')) po.status = 'PUTAWAY';
    if (po.status !== 'PUTAWAY' || !po.lines.every((l) => l.status === 'STORED')) continue;
    po.status = 'CLOSED';
    po.closed = tick;
    w.inbound.posClosed += 1;
    w.today.posReceived += 1;
    let received = 0;
    let expected = 0;
    for (const l of po.lines) {
      received += l.received;
      expected += l.expected;
    }
    log(w, { tick, code: 'PO CLOSE', order: po.no, qty: received, of: expected });
    closedNow = true;
  }
  const busy = new Set<number>();
  for (const po of w.pos) if (po.status === 'RECEIVING') busy.add(po.door);
  const yard = w.pos.filter((po) => po.status === 'ARRIVED').sort((a, b) => a.appt - b.appt || a.arrived - b.arrived || a.no - b.no);
  for (const po of yard) {
    let door = 0;
    for (let d = 1; d <= w.doors; d++) {
      if (!busy.has(d)) {
        door = d;
        break;
      }
    }
    if (door === 0) break;
    busy.add(door);
    po.door = door;
    po.status = 'RECEIVING';
    log(w, { tick, code: 'DOCK', order: po.no, qty: door });
    for (const line of po.lines) newTask(w, 'RECEIVE', po.no, line.no, line.sku, -1, line.expected, tick);
  }
  if (closedNow) purgePos(w);
}

/**
 * One cycle count (RULES 5, W6): the next SKU in turn is counted. With
 * chance `wmsCountVarianceBp` the bin differs from the system by 1 to
 * `wmsCountVarianceMax` units, two times in three a loss; the count is
 * adjusted to what is there. A loss never takes allocated units.
 */
export function cycleCount(w: MWms, r: Roller, tick: number): void {
  const count = w.inventory.length;
  if (count === 0) return;
  const stock = w.inventory[w.countCursor % count];
  w.countCursor = (w.countCursor + 1) % count;
  if (stock === undefined) return;
  const system = stock.onHand;
  let delta = 0;
  if (r.int(0, BP - 1) < T.wmsCountVarianceBp.value) {
    const size = r.int(1, T.wmsCountVarianceMax.value);
    delta = r.int(0, 2) < 2 ? -Math.min(size, Math.max(0, stock.onHand - stock.allocated)) : size;
  }
  stock.onHand += delta;
  stock.variance += delta;
  stock.counted = tick;
  w.inbound.counts += 1;
  if (delta === 0) w.inbound.countsAccurate += 1;
  log(w, { tick, code: 'CYCLE CNT', sku: stock.sku, qty: stock.onHand, of: system });
  if (delta !== 0) log(w, { tick, code: 'ADJUST', sku: stock.sku, qty: delta });
}
