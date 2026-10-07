import type { WarehouseEvent, WmsOrder } from '@warehouse/contracts';
import { mulDiv } from '../math.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, destinationAt, isClosed } from './catalog.ts';
import { cycleCount, planReorders, stepInbound } from './inbound.ts';
import { log, type MLine, type MOrder, type MPicker, type MWms } from './mutable.ts';
import { Roller, rollOrder, unitsOf } from './orders.ts';

const BP = 10_000;

export { cloneWms, log, type MLine, type MOrder, type MWms } from './mutable.ts';

export function findOrder(w: MWms, no: number): MOrder | undefined {
  return w.orders.find((o) => o.no === no);
}

/** Releases NEW orders as one wave (RULES 16). Returns the wave number, or 0 if there was nothing to release. */
export function releaseWave(w: MWms, tick: number, orders: readonly MOrder[]): number {
  const ready = orders.filter((o) => o.status === 'NEW');
  if (ready.length === 0) return 0;
  const wave = w.nextWave;
  w.nextWave += 1;
  for (const o of ready) {
    o.status = 'RELEASED';
    o.wave = wave;
    log(w, { tick, code: 'WAVE REL', order: o.no, qty: wave });
  }
  return wave;
}

/** A line allocation may still fill: never allocated, nothing picked. */
function waitingForStock(line: MLine): boolean {
  return line.status === 'OPEN' || (line.status === 'SHORT' && line.allocated === 0 && line.picked === 0);
}

/** Allocates what stock allows to the order's open and empty-short lines; a released order with nothing allocated is a BACKORDER. */
function allocate(w: MWms, o: MOrder, tick: number): void {
  for (const line of o.lines) {
    if (!waitingForStock(line)) continue;
    const stock = w.inventory[line.sku];
    if (stock === undefined) continue;
    const first = line.status === 'OPEN';
    const give = Math.min(line.ordered - line.allocated, Math.max(0, stock.onHand - stock.allocated));
    if (give > 0) {
      stock.allocated += give;
      line.allocated += give;
      line.short = line.ordered - line.allocated;
      line.status = 'ALLOCATED';
      log(w, { tick, code: 'ALLOC', order: o.no, line: line.no, sku: line.sku, qty: give, of: line.ordered });
      if (line.short > 0) log(w, { tick, code: 'ALLOC SHORT', order: o.no, line: line.no, sku: line.sku, qty: line.short, of: line.ordered });
    } else if (first) {
      line.status = 'SHORT';
      line.short = line.ordered;
      log(w, { tick, code: 'ALLOC SHORT', order: o.no, line: line.no, sku: line.sku, qty: line.short, of: line.ordered });
    }
  }
  if (o.status === 'RELEASED' || o.status === 'BACKORDER') o.status = o.lines.some((l) => l.allocated > 0) ? 'ALLOCATED' : 'BACKORDER';
}

/** Milli-units a picker picks in one WMS step. */
function pickPerStep(): number {
  return Math.floor((T.wmsPickMilliPerSec.value * T.wmsStepTicks.value * T.tickMs.value) / 1000);
}

/** The picker reached the end of the line: confirm what was really in the bin (RULES 16, short picks). */
function confirm(w: MWms, r: Roller, o: MOrder, line: MLine, picker: number, tick: number): void {
  const stock = w.inventory[line.sku];
  let missing = 0;
  if (r.int(0, BP - 1) < T.wmsShortPickChanceBp.value) {
    missing = r.int(1, line.allocated);
    log(w, { tick, code: 'SHORT PICK', order: o.no, line: line.no, sku: line.sku, qty: missing, of: line.allocated, picker });
  }
  line.picked = line.allocated - missing;
  if (stock !== undefined) {
    stock.onHand = Math.max(0, stock.onHand - line.allocated);
    stock.allocated = Math.max(0, stock.allocated - line.allocated);
    stock.picked += line.picked;
  }
  line.allocated = line.picked;
  line.short = line.ordered - line.picked;
  line.status = line.short > 0 ? 'SHORT' : 'PICKED';
  w.stats.linesPicked += 1;
  const bucket = Math.floor(tick / WMS_RATE_BUCKET_TICKS) % WMS_RATE_BUCKETS;
  w.recent[bucket] = (w.recent[bucket] ?? 0) + 1;
  log(w, { tick, code: 'PICK CONF', order: o.no, line: line.no, sku: line.sku, qty: line.picked, of: line.ordered, picker });
}

function workPickers(w: MWms, r: Roller, tick: number): void {
  const step = pickPerStep();
  for (const p of w.pickers) {
    if (p.order === 0) continue;
    const o = findOrder(w, p.order);
    const line = o?.lines.find((l) => l.no === p.line);
    if (o === undefined || line === undefined || line.status !== 'PICKING') {
      p.order = 0;
      p.line = 0;
      p.progress = 0;
      continue;
    }
    p.progress += step;
    line.picked = Math.min(line.allocated, Math.floor(p.progress / 1000));
    if (p.progress < line.allocated * 1000) continue;
    confirm(w, r, o, line, p.id, tick);
    p.order = 0;
    p.line = 0;
    p.progress = 0;
  }
}

/** Orders whose lines a picker may start: allocated or being picked, not on hold. */
function pickable(o: MOrder): boolean {
  return o.status === 'ALLOCATED' || o.status === 'PICKING';
}

/** Puts a picker on a line (RULES 16): the line and its order go to PICKING. */
export function startPick(w: MWms, picker: MPicker, o: MOrder, line: MLine, tick: number): void {
  picker.order = o.no;
  picker.line = line.no;
  picker.progress = 0;
  line.status = 'PICKING';
  o.status = 'PICKING';
  log(w, { tick, code: 'PICK START', order: o.no, line: line.no, sku: line.sku, qty: line.allocated, of: line.ordered, picker: picker.id });
}

/** Idle pickers take the waiting lines FIFO by priority, then ship-by, then order and line number. */
function assignPickers(w: MWms, tick: number): void {
  const idle = w.pickers.filter((p) => p.order === 0);
  if (idle.length === 0) return;
  const waiting: { o: MOrder; line: MLine }[] = [];
  for (const o of w.orders) {
    if (!pickable(o)) continue;
    for (const line of o.lines) if (line.status === 'ALLOCATED') waiting.push({ o, line });
  }
  if (waiting.length === 0) return;
  waiting.sort((a, b) => a.o.priority - b.o.priority || a.o.shipBy - b.o.shipBy || a.o.no - b.o.no || a.line.no - b.line.no);
  for (let i = 0; i < idle.length && i < waiting.length; i++) {
    const { o, line } = waiting[i] as { o: MOrder; line: MLine };
    startPick(w, idle[i] as (typeof idle)[number], o, line, tick);
  }
}

/** Goodwill a shipment costs or earns its country (RULES 16, slice 8): up for on time and in full, down by lateness and by the share short. */
export function goodwillChange(o: WmsOrder, tick: number, onTime: boolean, inFull: boolean, shipped: number): number {
  if (onTime && inFull) return T.wmsGoodwillGain.value;
  let loss = 0;
  if (!onTime) {
    const minutes = Math.max(1, Math.ceil(((tick - o.shipBy) * T.tickMs.value) / 60_000));
    loss += Math.min(T.wmsGoodwillLateMax.value, minutes * T.wmsGoodwillLatePerMin.value);
  }
  const ordered = unitsOf(o);
  if (!inFull && ordered > 0) loss += Math.floor((T.wmsGoodwillShortMax.value * (ordered - shipped)) / ordered);
  return -loss;
}

/** What a shipment pays (slice 8): a share of an idle order's pay a unit, times (50 + goodwill)% of the country's goodwill before it. */
export function shipmentPay(shipped: number, payCents: number, goodwill: number): number {
  return mulDiv(mulDiv(shipped * payCents, T.wmsUnitPayBp.value, BP), 50 + goodwill, 100);
}

/** Ships the order: counts, goodwill and pay. Returns the cents it earns. */
function ship(w: MWms, o: MOrder, tick: number, payCents: number, events: WarehouseEvent[] | null): number {
  o.status = 'SHIPPED';
  o.closed = tick;
  o.next = 0;
  const onTime = !o.late && tick <= o.shipBy;
  const inFull = o.lines.every((l) => l.short === 0);
  let shipped = 0;
  for (const line of o.lines) shipped += line.picked;
  const s = w.stats;
  s.shipped += 1;
  if (onTime) s.onTime += 1;
  if (inFull) s.inFull += 1;
  if (onTime && inFull) s.otif += 1;
  s.unitsOrdered += unitsOf(o);
  s.unitsShipped += shipped;
  const dest = w.dests[o.dest];
  let cents = 0;
  if (dest !== undefined) {
    dest.shipped += 1;
    if (onTime && inFull) dest.otif += 1;
    cents = shipmentPay(shipped, payCents, dest.goodwill);
    dest.goodwill = Math.max(0, Math.min(100, dest.goodwill + goodwillChange(o, tick, onTime, inFull, shipped)));
    if (events !== null) {
      events.push({ tick, type: 'wmsShipped', payload: { order: o.no, iso: destinationAt(o.dest).iso, priority: o.priority, cents, onTime, inFull, goodwill: dest.goodwill } });
    }
  }
  log(w, { tick, code: 'SHIP', order: o.no, qty: shipped, of: unitsOf(o) });
  return cents;
}

/** One timed move for an order past picking: PICKED or SHORT, PACKED, STAGED, LOADED, SHIPPED. Returns the cents a shipment earns. */
function moveOn(w: MWms, o: MOrder, tick: number, payCents: number, events: WarehouseEvent[] | null): number {
  if (o.next === 0 || tick < o.next) return 0;
  switch (o.status) {
    case 'PICKED':
    case 'SHORT':
      o.status = 'PACKED';
      o.next = tick + T.wmsStageTicks.value;
      log(w, { tick, code: 'PACK', order: o.no });
      return 0;
    case 'PACKED':
      o.status = 'STAGED';
      o.next = tick + T.wmsLoadTicks.value;
      log(w, { tick, code: 'STAGE', order: o.no });
      return 0;
    case 'STAGED':
      o.status = 'LOADED';
      o.next = tick + T.wmsShipTicks.value;
      log(w, { tick, code: 'LOAD', order: o.no });
      return 0;
    case 'LOADED':
      return ship(w, o, tick, payCents, events);
    default:
      return 0;
  }
}

/** Picking is over when no line is waiting for or under a picker: PICKED, SHORT if any unit is short, or back to BACKORDER if nothing was picked. */
function finishPicking(o: MOrder, tick: number): void {
  if (!pickable(o)) return;
  if (o.lines.some((l) => l.status === 'ALLOCATED' || l.status === 'PICKING')) return;
  if (!o.lines.some((l) => l.picked > 0)) {
    o.status = 'BACKORDER';
    return;
  }
  o.status = o.lines.some((l) => l.short > 0) ? 'SHORT' : 'PICKED';
  o.next = tick + T.wmsPackTicks.value;
}

/** Drops the oldest shipped and cancelled orders beyond `wmsKeepClosedOrders`. */
function purge(w: MWms): void {
  let closed = 0;
  for (const o of w.orders) if (isClosed(o.status)) closed += 1;
  let drop = closed - T.wmsKeepClosedOrders.value;
  if (drop <= 0) return;
  w.orders = w.orders.filter((o) => {
    if (drop > 0 && isClosed(o.status)) {
      drop -= 1;
      return false;
    }
    return true;
  });
}

/**
 * One WMS step (RULES 16), every `wmsStepTicks` ticks: a new order may arrive,
 * the wave planner releases NEW orders, reorder planning raises POs for low
 * SKUs, inbound trucks arrive, dock, are received and put away (W6), a cycle
 * count may run, released and
 * backordered lines are allocated, pickers pick and confirm, idle pickers take
 * the next line, finished orders pack, stage, load and ship, and cutoffs pass.
 * Returns the cents shipments earned (slice 8); `payCents` is an idle order's
 * pay now. Shipments and cutoff misses go to `events` when it is given.
 */
export function wmsStep(w: MWms, tick: number, contract: number, payCents = 0, events: WarehouseEvent[] | null = null): number {
  let earned = 0;
  const r = new Roller(w.rng);
  if (tick % WMS_RATE_BUCKET_TICKS < T.wmsStepTicks.value) {
    const bucket = Math.floor(tick / WMS_RATE_BUCKET_TICKS) % WMS_RATE_BUCKETS;
    w.recent[bucket] = 0;
    w.recentIn[bucket] = 0;
  }
  if (tick >= w.nextOrderAt) {
    const open = w.orders.filter((o) => !isClosed(o.status)).length;
    if (open < T.wmsMaxOpenOrders.value) {
      const order = rollOrder(r, w.nextOrderNo, tick, contract, w.inventory.map((s) => s.bin));
      w.nextOrderNo += 1;
      w.orders.push(order as MOrder);
      log(w, { tick, code: 'ORD CRT', order: order.no, qty: unitsOf(order) });
    }
    w.nextOrderAt = tick + r.int(T.wmsOrderMinTicks.value, Math.max(T.wmsOrderMinTicks.value, T.wmsOrderMaxTicks.value));
  }
  if (tick >= w.nextWaveAt) {
    releaseWave(w, tick, w.orders);
    w.nextWaveAt = tick + T.wmsWaveTicks.value;
  }
  if (tick >= w.nextReplenAt) {
    planReorders(w, r, tick);
    w.nextReplenAt = tick + T.wmsReplenTicks.value;
  }
  stepInbound(w, r, tick);
  if (tick >= w.nextCountAt) {
    cycleCount(w, r, tick);
    w.nextCountAt = tick + T.wmsCountTicks.value;
  }
  for (const o of w.orders) {
    if (o.status === 'RELEASED' || o.status === 'BACKORDER' || (pickable(o) && o.lines.some(waitingForStock))) allocate(w, o, tick);
  }
  workPickers(w, r, tick);
  assignPickers(w, tick);
  let closedNow = false;
  for (const o of w.orders) {
    if (isClosed(o.status)) continue;
    if (!o.late && tick > o.shipBy) {
      o.late = true;
      w.stats.cutoffMisses += 1;
      log(w, { tick, code: 'CUTOFF MISS', order: o.no });
      events?.push({ tick, type: 'wmsMissed', payload: { order: o.no, iso: destinationAt(o.dest).iso, priority: o.priority } });
    }
    if (o.status === 'ON HOLD') continue;
    finishPicking(o, tick);
    earned += moveOn(w, o, tick, payCents, events);
    if (o.status === 'SHIPPED') closedNow = true;
  }
  if (closedNow) purge(w);
  w.rng = r.rng;
  return earned;
}
