import type { WarehouseEvent, WmsOrder } from '@warehouse/contracts';
import { dayAt } from '../clock.ts';
import { mulDiv } from '../math.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, destinationAt, isClosed } from './catalog.ts';
import { confirmReceipt, cycleCount, planReorders, stepInbound, storeLine } from './inbound.ts';
import { log, type MLine, type MOrder, type MTask, type MWms, type MWorker } from './mutable.ts';
import { Roller, rollOrder, unitsOf } from './orders.ts';
import { finishTask, findTask, newTask, pickTarget, planTasks, poTarget, purgeTasks, startNext, urgency } from './tasks.ts';

export { cloneWms, log, type MLine, type MOrder, type MWms } from './mutable.ts';
export { urgency, walkTicks } from './tasks.ts';

export function findOrder(w: MWms, no: number): MOrder | undefined {
  return w.orders.find((o) => o.no === no);
}

/** The rate bucket a tick falls in. */
export function bucketAt(tick: number): number {
  return Math.floor(tick / WMS_RATE_BUCKET_TICKS) % WMS_RATE_BUCKETS;
}

/** Releases NEW orders as one wave (RULES 4). Returns the wave number, or 0 if there was nothing to release. */
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

/**
 * Allocates what stock allows to the order's open and empty-short lines, and
 * creates a PICK task for each line given stock (W8); a released order with
 * nothing allocated is a BACKORDER.
 */
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
      newTask(w, 'PICK', o.no, line.no, line.sku, line.bin, line.allocated, tick);
    } else if (first) {
      line.status = 'SHORT';
      line.short = line.ordered;
      log(w, { tick, code: 'ALLOC SHORT', order: o.no, line: line.no, sku: line.sku, qty: line.short, of: line.ordered });
    }
  }
  if (o.status === 'RELEASED' || o.status === 'BACKORDER') o.status = o.lines.some((l) => l.allocated > 0) ? 'ALLOCATED' : 'BACKORDER';
}

/** Milli-units one worker picks, or counts in, in one WMS step. */
function perStep(milliPerSec: number): number {
  return Math.floor((milliPerSec * T.wmsStepTicks.value * T.tickMs.value) / 1000);
}

/** The picker reached the end of the line: confirm what was really in the bin (RULES 6, short picks). */
function confirmPick(w: MWms, r: Roller, o: MOrder, line: MLine, picker: number, tick: number): void {
  const stock = w.inventory[line.sku];
  let missing = 0;
  if (r.int(0, 9999) < T.wmsShortPickChanceBp.value) {
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
  w.today.linesPicked += 1;
  const bucket = bucketAt(tick);
  w.recent[bucket] = (w.recent[bucket] ?? 0) + 1;
  log(w, { tick, code: 'PICK CONF', order: o.no, line: line.no, sku: line.sku, qty: line.picked, of: line.ordered, picker });
}

/** Whether the worker's active task is still the work its line waits for; if not, it is dropped. */
function stillLive(w: MWms, t: MTask): boolean {
  if (t.kind === 'PICK') return pickTarget(w, t)?.line.status === 'PICKING';
  const target = poTarget(w, t);
  return t.kind === 'RECEIVE' ? target?.line.status === 'RECEIVING' : target?.line.status === 'RECEIVED';
}

/**
 * One worker's step (RULES 6): with no task it takes the next in its queue;
 * walking, it walks on; at its bin or the dock, it works the task, and at the
 * end confirms it and starts the next. The step's ticks go to its record as
 * idle, walking or working time.
 */
function workWorker(w: MWms, r: Roller, worker: MWorker, tick: number): void {
  const step = T.wmsStepTicks.value;
  if (worker.task === 0) startNext(w, worker, tick);
  const t = findTask(w, worker.task);
  if (t === undefined || !stillLive(w, t)) {
    if (t !== undefined) {
      t.status = 'CANCELLED';
      t.finished = tick;
    }
    worker.task = 0;
    worker.progress = 0;
    worker.walk = 0;
    worker.stats.idle += step;
    return;
  }
  if (worker.walk > 0) {
    worker.walk = Math.max(0, worker.walk - step);
    worker.stats.walking += step;
    return;
  }
  worker.stats.busy += step;
  if (t.kind === 'PICK') {
    const target = pickTarget(w, t);
    if (target === undefined) return;
    const { o, line } = target;
    worker.progress += perStep(T.wmsPickMilliPerSec.value);
    line.picked = Math.min(line.allocated, Math.floor(worker.progress / 1000));
    t.done = line.picked;
    if (worker.progress < line.allocated * 1000) return;
    confirmPick(w, r, o, line, worker.id, tick);
    t.done = line.picked;
  } else if (t.kind === 'RECEIVE') {
    const target = poTarget(w, t);
    if (target === undefined) return;
    const { po, line } = target;
    worker.progress += perStep(T.wmsReceiveMilliPerSec.value);
    line.received = Math.min(line.expected, Math.floor(worker.progress / 1000));
    t.done = line.received;
    if (worker.progress < line.expected * 1000) return;
    confirmReceipt(w, r, po, line, worker.id, tick);
    t.done = line.received;
    if (line.received > 0) newTask(w, 'PUTAWAY', po.no, line.no, line.sku, line.bin, line.received, tick);
    else line.status = 'STORED';
  } else {
    worker.progress += step;
    if (worker.progress < T.wmsPutawayDropTicks.value) return;
    const target = poTarget(w, t);
    if (target !== undefined) storeLine(w, target.po, target.line, worker.id, tick);
    t.done = t.qty;
  }
  finishTask(w, worker, t, tick);
}

/** Goodwill a shipment costs or earns its country (RULES 7): up for on time and in full, down by lateness and by the share short. */
export function goodwillChange(o: WmsOrder, tick: number, onTime: boolean, inFull: boolean, shipped: number): number {
  if (onTime && inFull) return T.wmsGoodwillGain.value;
  let loss = 0;
  if (!onTime) {
    const hours = Math.max(1, Math.ceil((tick - o.shipBy) / (60 * T.wmsMinuteTicks.value)));
    loss += Math.min(T.wmsGoodwillLateMax.value, hours * T.wmsGoodwillLatePerHour.value);
  }
  const ordered = unitsOf(o);
  if (!inFull && ordered > 0) loss += Math.floor((T.wmsGoodwillShortMax.value * (ordered - shipped)) / ordered);
  return -loss;
}

/** What a shipment pays (RULES 7, W8): `wmsUnitPayCents` a unit shipped, times (50 + goodwill)% of the country's goodwill before it. */
export function shipmentPay(shipped: number, goodwill: number): number {
  return mulDiv(shipped * T.wmsUnitPayCents.value, 50 + goodwill, 100);
}

/** Ships the order: counts, goodwill and pay. Returns the cents it earns. */
function ship(w: MWms, o: MOrder, tick: number, events: WarehouseEvent[] | null): number {
  o.status = 'SHIPPED';
  o.closed = tick;
  o.next = 0;
  const onTime = !o.late && tick <= o.shipBy;
  const inFull = o.lines.every((l) => l.short === 0);
  let shipped = 0;
  for (const line of o.lines) shipped += line.picked;
  const s = w.stats;
  s.shipped += 1;
  w.today.shipped += 1;
  if (onTime) s.onTime += 1;
  if (inFull) s.inFull += 1;
  if (onTime && inFull) {
    s.otif += 1;
    w.today.otif += 1;
  }
  s.unitsOrdered += unitsOf(o);
  s.unitsShipped += shipped;
  const dest = w.dests[o.dest];
  let cents = 0;
  if (dest !== undefined) {
    dest.shipped += 1;
    if (onTime && inFull) dest.otif += 1;
    cents = shipmentPay(shipped, dest.goodwill);
    dest.goodwill = Math.max(0, Math.min(100, dest.goodwill + goodwillChange(o, tick, onTime, inFull, shipped)));
    if (events !== null) {
      events.push({ tick, type: 'wmsShipped', payload: { order: o.no, iso: destinationAt(o.dest).iso, priority: o.priority, cents, onTime, inFull, goodwill: dest.goodwill } });
    }
  }
  s.earned += cents;
  w.today.earned += cents;
  const bucket = bucketAt(tick);
  w.recentPay[bucket] = (w.recentPay[bucket] ?? 0) + cents;
  log(w, { tick, code: 'SHIP', order: o.no, qty: shipped, of: unitsOf(o) });
  return cents;
}

/** One timed move for an order past picking: PICKED or SHORT, PACKED, STAGED, LOADED, SHIPPED. Returns the cents a shipment earns. */
function moveOn(w: MWms, o: MOrder, tick: number, events: WarehouseEvent[] | null): number {
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
      return ship(w, o, tick, events);
    default:
      return 0;
  }
}

/** Orders whose lines a picker may work: allocated or being picked, not on hold. */
function pickable(o: MOrder): boolean {
  return o.status === 'ALLOCATED' || o.status === 'PICKING';
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

/** A fresh day's totals. */
export function emptyDay(day: number): MWms['today'] {
  return { day, shipped: 0, otif: 0, earned: 0, linesPicked: 0, posReceived: 0, unitsReceived: 0 };
}

/**
 * One WMS step (RULES 4-7), every `wmsStepTicks` ticks: a new day may begin,
 * a new order may arrive, the release rule releases NEW orders, reorder
 * planning raises POs and books their dock appointments, inbound trucks
 * arrive and dock (receive tasks), a cycle count may run, released and
 * backordered lines are allocated (pick tasks), every worker works its task,
 * the WMS lines up the next tasks, finished orders pack, stage, load and
 * ship, and cutoffs pass. Returns the cents shipments earned. Shipments,
 * cutoff misses and a new day go to `events` when it is given.
 */
export function wmsStep(w: MWms, tick: number, events: WarehouseEvent[] | null = null): number {
  let earned = 0;
  const r = new Roller(w.rng);
  const day = dayAt(tick);
  if (day !== w.today.day) {
    w.yesterday = w.today;
    w.today = emptyDay(day);
    events?.push({ tick, type: 'newDay', payload: { day } });
  }
  if (tick % WMS_RATE_BUCKET_TICKS < T.wmsStepTicks.value) {
    const bucket = bucketAt(tick);
    w.recent[bucket] = 0;
    w.recentIn[bucket] = 0;
    w.recentPay[bucket] = 0;
  }
  if (tick >= w.nextOrderAt) {
    const open = w.orders.filter((o) => !isClosed(o.status)).length;
    if (open < T.wmsMaxOpenOrders.value) {
      const order = rollOrder(r, w.nextOrderNo, tick, w.inventory.map((s) => s.bin));
      w.nextOrderNo += 1;
      w.orders.push(order as MOrder);
      log(w, { tick, code: 'ORD CRT', order: order.no, qty: unitsOf(order) });
    }
    w.nextOrderAt = tick + r.int(T.wmsOrderMinTicks.value, Math.max(T.wmsOrderMinTicks.value, T.wmsOrderMaxTicks.value));
  }
  // Release (W7): timed waves, each order as it arrives, or only by hand.
  const release = w.policy.release;
  if (release === 'continuous') releaseWave(w, tick, w.orders);
  else if (release === 'waves' && tick >= w.nextWaveAt) {
    releaseWave(w, tick, w.orders);
    w.nextWaveAt = tick + T.wmsWaveTicks.value;
  }
  if (tick >= w.nextReplenAt) {
    planReorders(w, r, tick);
    w.nextReplenAt = tick + T.wmsReplenTicks.value;
  }
  stepInbound(w, tick);
  if (tick >= w.nextCountAt) {
    cycleCount(w, r, tick);
    w.nextCountAt = tick + T.wmsCountTicks.value;
  }
  // The most urgent orders take the stock first (W7).
  const needing = w.orders.filter((o) => o.status === 'RELEASED' || o.status === 'BACKORDER' || (pickable(o) && o.lines.some(waitingForStock)));
  if (needing.length > 1) needing.sort((a, b) => urgency(w.policy.pick, a, b));
  for (const o of needing) allocate(w, o, tick);
  for (const worker of w.workers) workWorker(w, r, worker, tick);
  planTasks(w, tick);
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
    earned += moveOn(w, o, tick, events);
    if (o.status === 'SHIPPED') closedNow = true;
  }
  if (closedNow) purge(w);
  purgeTasks(w);
  w.rng = r.rng;
  return earned;
}
