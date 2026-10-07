import type {
  WmsEvent,
  WmsEventCode,
  WmsEventView,
  WmsInboundKpis,
  WmsInventoryKpis,
  WmsKpis,
  WmsLineView,
  WmsOrder,
  WmsOrderStatus,
  WmsPo,
  WmsPoView,
  WmsCrewKpis,
  WmsSlotView,
  WmsState,
  WmsStockStatus,
  WmsStockView,
  WmsTask,
  WmsTaskView,
  WmsView,
  WmsWorker,
  WmsWorkerView,
} from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_AISLES, WMS_AISLE_GAP_BAYS, WMS_BAYS, WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, binCode, binPlace, customerAt, destinationAt, isClosed, orderCode, poCode, skuAt, supplierAt, taskCode, workerCode } from './catalog.ts';
import { inboundUnits, waitingUnits } from './inbound.ts';
import type { MWms } from './mutable.ts';
import { WMS_LABOR_MODES, WMS_PICK_RULES, WMS_RELEASE_MODES, crewNeeds, doorCost, hireCost, waveChoices } from './policy.ts';

const EXCEPTION_STATUSES: ReadonlySet<WmsOrderStatus> = new Set(['SHORT', 'ON HOLD', 'BACKORDER']);
const EXCEPTION_EVENTS: ReadonlySet<WmsEventCode> = new Set(['ALLOC SHORT', 'SHORT PICK', 'CUTOFF MISS', 'HOLD', 'CANCEL', 'PO LATE', 'RCV SHORT', 'DAMAGE', 'ADJUST']);
/** Events whose `picker` field names a worker (W8). */
const WORKER_EVENTS: ReadonlySet<WmsEventCode> = new Set(['PICK START', 'PICK CONF', 'SHORT PICK', 'ASSIGN', 'RCV', 'RCV SHORT', 'DAMAGE', 'PUTAWAY', 'HIRE', 'MOVE']);
/** Events whose `order` field is a PO number (W6). */
const INBOUND_EVENTS: ReadonlySet<WmsEventCode> = new Set(['PO CRT', 'ARRIVE', 'PO LATE', 'DOCK', 'RCV', 'RCV SHORT', 'DAMAGE', 'PUTAWAY', 'PO CLOSE']);

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** A number naming an order's (or PO's) line, for lookups: cheaper than a string key on every tick. */
function lineKey(ref: number, line: number): number {
  return ref * 1024 + line;
}

function lineViews(o: WmsOrder, pickerOn: ReadonlyMap<number, number>, taskOn: ReadonlyMap<number, number>): WmsLineView[] {
  return o.lines.map((l) => {
    const sku = skuAt(l.sku);
    return {
      no: l.no,
      sku: sku.code,
      desc: sku.desc,
      bin: binCode(l.bin),
      ordered: l.ordered,
      allocated: l.allocated,
      picked: l.picked,
      short: l.short,
      status: l.status,
      picker: pickerOn.get(lineKey(o.no, l.no)) ?? 0,
      task: taskOn.get(lineKey(o.no, l.no)) ?? 0,
    };
  });
}

/** A row of the order grid, with its lines. */
function orderView(o: WmsOrder, pickerOn: ReadonlyMap<number, number>, taskOn: ReadonlyMap<number, number>) {
  let unitsOrdered = 0;
  let unitsPicked = 0;
  let shortUnits = 0;
  let linesPicked = 0;
  let linesTotal = 0;
  for (const l of o.lines) {
    if (l.status === 'CANCELLED') continue;
    linesTotal += 1;
    unitsOrdered += l.ordered;
    unitsPicked += l.picked;
    shortUnits += l.short;
    if (l.status === 'PICKED' || (l.status === 'SHORT' && l.picked > 0)) linesPicked += 1;
  }
  const closed = isClosed(o.status);
  const dest = destinationAt(o.dest);
  return {
    no: o.no,
    code: orderCode(o.no),
    dest: { iso: dest.iso, flag: dest.flag, name: dest.name },
    source: customerAt(o.customer),
    priority: o.priority,
    wave: o.wave,
    status: o.status,
    linesTotal,
    linesPicked,
    unitsOrdered,
    unitsPicked,
    shortUnits,
    pct: unitsOrdered === 0 ? 0 : Math.floor((unitsPicked * 100) / unitsOrdered),
    shipBy: o.shipBy,
    created: o.created,
    closed: o.closed,
    late: o.late,
    exception: !closed && (EXCEPTION_STATUSES.has(o.status) || shortUnits > 0 || o.late),
    open: !closed,
    expedited: o.expedited,
    lines: lineViews(o, pickerOn, taskOn),
  };
}

/** The feed's two text columns for an event: what it refers to, and the detail. */
export function eventText(e: WmsEvent): { ref: string; detail: string } {
  const inbound = INBOUND_EVENTS.has(e.code);
  const order = e.order > 0 ? (inbound ? poCode(e.order) : orderCode(e.order)) : '';
  const ref = e.line > 0 ? `${order}/L${e.line}` : order;
  const sku = e.sku >= 0 ? skuAt(e.sku).code : '';
  const who = e.picker > 0 ? `  ${workerCode(e.picker)}` : '';
  switch (e.code) {
    case 'ORD CRT':
      return { ref, detail: `${e.qty} units` };
    case 'WAVE REL':
      return { ref, detail: `W-${pad(e.qty, 4)}` };
    case 'ALLOC':
      return { ref, detail: `${sku}  ${e.qty}/${e.of}` };
    case 'ALLOC SHORT':
      return { ref, detail: `${sku}  short ${e.qty}/${e.of}` };
    case 'PICK START':
      return { ref, detail: `${sku}  0/${e.qty}${who}` };
    case 'PICK CONF':
      return { ref, detail: `${sku}  ${e.qty}/${e.of}${who}` };
    case 'SHORT PICK':
      return { ref, detail: `${sku}  short ${e.qty}/${e.of}${who}` };
    case 'SHIP':
      return { ref, detail: `${e.qty}/${e.of} units` };
    case 'CUTOFF MISS':
      return { ref, detail: 'ship-by passed' };
    case 'PRIO':
      return { ref, detail: `P${e.qty}` };
    case 'ASSIGN':
      return { ref, detail: `${sku}${who}` };
    case 'CANCEL':
      return { ref, detail: e.line > 0 ? `${sku}  ${e.qty} units` : 'order' };
    case 'EXPEDITE':
      return { ref, detail: 'P1, later truck' };
    case 'PO CRT':
      return { ref, detail: `${e.of} ${e.of === 1 ? 'line' : 'lines'}  ${e.qty} units` };
    case 'ARRIVE':
      return { ref, detail: `${e.qty} units in the yard` };
    case 'PO LATE':
      return { ref, detail: 'missed its appointment' };
    case 'DOCK':
      return { ref, detail: `door D${e.qty}` };
    case 'RCV':
      return { ref, detail: `${sku}  ${e.qty}/${e.of}${who}` };
    case 'RCV SHORT':
      return { ref, detail: `${sku}  short ${e.qty}/${e.of}` };
    case 'DAMAGE':
      return { ref, detail: `${sku}  ${e.qty} damaged` };
    case 'PUTAWAY':
      return { ref, detail: `${sku}  +${e.qty} units${who}` };
    case 'PO CLOSE':
      return { ref, detail: `${e.qty}/${e.of} units` };
    case 'CYCLE CNT':
      return { ref: sku, detail: e.qty === e.of ? `${e.qty} units, matched` : `${e.qty} counted, system ${e.of}` };
    case 'ADJUST':
      return { ref: sku, detail: `${e.qty > 0 ? '+' : ''}${e.qty} units` };
    case 'PLAN':
      return { ref: '', detail: planText(e) };
    case 'HIRE':
      return { ref: workerCode(e.picker), detail: `hired to ${e.line === 1 ? 'pick' : 'receive'}, crew ${e.qty}` };
    case 'DOOR':
      return { ref: `D${e.qty}`, detail: `dock door ${e.qty} open` };
    case 'MOVE':
      return { ref: workerCode(e.picker), detail: `to ${e.line === 1 ? 'picking' : 'receiving'}, ${e.qty} ${e.qty === 1 ? 'task' : 'tasks'} waiting${e.of === 1 ? ' (balance)' : ''}` };
    default:
      return { ref, detail: '' };
  }
}

/** The Plan page's names for its choices (W7), as the feed shows them. */
export const PICK_RULE_NAMES: Readonly<Record<(typeof WMS_PICK_RULES)[number], string>> = { priority: 'Priority first', cutoff: 'Cutoff first', nearest: 'Nearest bin' };
export const RELEASE_NAMES: Readonly<Record<(typeof WMS_RELEASE_MODES)[number], string>> = { waves: 'Timed waves', continuous: 'Continuous', manual: 'Manual' };
export const LABOR_NAMES: Readonly<Record<(typeof WMS_LABOR_MODES)[number], string>> = { fixed: 'Fixed', balance: 'Balance by need' };

function planText(e: WmsEvent): string {
  if (e.line === 1) return `Pick order: ${PICK_RULE_NAMES[WMS_PICK_RULES[e.qty] ?? 'priority']}`;
  if (e.line === 2) return `Release: ${RELEASE_NAMES[WMS_RELEASE_MODES[e.qty] ?? 'waves']}`;
  if (e.line === 4) return `Waves every ${Math.floor(e.qty / T.wmsMinuteTicks.value)} min`;
  if (e.line === 5) return `Labour: ${LABOR_NAMES[WMS_LABOR_MODES[e.qty] ?? 'fixed']}`;
  return `Crew: ${e.qty} picking, ${e.of - e.qty} receiving`;
}

function eventViews(events: readonly WmsEvent[]): WmsEventView[] {
  const seen = new Map<string, number>();
  const out: WmsEventView[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as WmsEvent;
    const base = `${e.tick}-${e.code}-${e.order}-${e.line}-${e.sku}-${e.picker}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const inbound = INBOUND_EVENTS.has(e.code);
    out.push({
      key: n === 1 ? base : `${base}#${n}`,
      tick: e.tick,
      code: e.code,
      order: inbound ? 0 : e.order,
      po: inbound ? e.order : 0,
      worker: WORKER_EVENTS.has(e.code) ? e.picker : 0,
      ...eventText(e),
      exception: EXCEPTION_EVENTS.has(e.code),
    });
  }
  return out;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.floor((part * 100) / whole);
}

/** A row of the inbound grid (W6), with its lines. */
function poView(po: WmsPo, receiverOn: ReadonlyMap<number, number>): WmsPoView {
  let unitsExpected = 0;
  let unitsReceived = 0;
  let unitsDamaged = 0;
  let unitsShort = 0;
  let linesReceived = 0;
  for (const l of po.lines) {
    unitsExpected += l.expected;
    unitsReceived += l.received;
    unitsDamaged += l.damaged;
    unitsShort += l.short;
    if (l.status === 'RECEIVED' || l.status === 'STORED') linesReceived += 1;
  }
  const open = po.status !== 'CLOSED';
  return {
    no: po.no,
    code: poCode(po.no),
    supplier: supplierAt(po.supplier).name,
    status: po.status,
    created: po.created,
    appt: po.appt,
    arrived: po.arrived,
    closed: po.closed,
    late: po.late,
    door: po.door,
    linesTotal: po.lines.length,
    linesReceived,
    unitsExpected,
    unitsReceived,
    unitsDamaged,
    unitsShort,
    pct: unitsExpected === 0 ? 0 : Math.floor((unitsReceived * 100) / unitsExpected),
    exception: open && (po.late || unitsDamaged > 0 || unitsShort > 0),
    open,
    lines: po.lines.map((l) => {
      const sku = skuAt(l.sku);
      return {
        no: l.no,
        sku: sku.code,
        desc: sku.desc,
        bin: binCode(l.bin),
        expected: l.expected,
        received: l.received,
        damaged: l.damaged,
        short: l.short,
        status: l.status,
        receiver: receiverOn.get(lineKey(po.no, l.no)) ?? 0,
        ...binPlace(l.bin),
      };
    }),
  };
}

/** The inbound page (W6): POs open first (oldest first), then closed (newest first), and its KPIs. */
function inboundView(w: WmsState): { pos: WmsPoView[]; inboundKpis: WmsInboundKpis } {
  const receiverOn = new Map<number, number>();
  for (const t of w.tasks) if (t.kind !== 'PICK' && t.status === 'ACTIVE') receiverOn.set(lineKey(t.ref, t.line), t.worker);
  const rows = w.pos.map((po) => poView(po, receiverOn));
  const open = rows.filter((po) => po.open).sort((a, b) => a.appt - b.appt || a.no - b.no);
  const closed = rows.filter((po) => !po.open).sort((a, b) => b.closed - a.closed || b.no - a.no);
  let recentIn = 0;
  for (const n of w.recentIn) recentIn += n;
  const s = w.inbound;
  const inboundKpis: WmsInboundKpis = {
    open: open.length,
    inTransit: open.filter((po) => po.status === 'IN TRANSIT').length,
    atDock: open.filter((po) => po.status === 'ARRIVED' || po.status === 'RECEIVING').length,
    doorsBusy: open.filter((po) => po.status === 'RECEIVING').length,
    doorsTotal: w.doors,
    receiversBusy: w.workers.filter((p) => p.role === 'receive' && p.task > 0).length,
    receiversTotal: w.workers.filter((p) => p.role === 'receive').length,
    unitsPerHour: Math.floor((recentIn * 60 * T.wmsMinuteTicks.value) / (WMS_RATE_BUCKETS * WMS_RATE_BUCKET_TICKS)),
    exceptions: open.filter((po) => po.exception).length,
    onTimePct: s.posClosed === 0 ? null : Math.floor((Math.max(0, s.posClosed - closedLate(w, s.posLate)) * 100) / s.posClosed),
  };
  return { pos: [...open, ...closed], inboundKpis };
}

/** Late POs that have closed: every late PO counted, less the late ones still open. */
function closedLate(w: WmsState, posLate: number): number {
  let openLate = 0;
  for (const po of w.pos) if (po.status !== 'CLOSED' && po.late) openLate += 1;
  return posLate - openLate;
}

/** The inventory page (W6): one row per SKU and its KPIs. */
function inventoryView(w: WmsState): { stock: WmsStockView[]; inventoryKpis: WmsInventoryKpis } {
  const waiting = waitingUnits(w);
  const { onOrder, dock } = inboundUnits(w);
  const stock = w.inventory.map((s): WmsStockView => {
    const sku = skuAt(s.sku);
    const available = Math.max(0, s.onHand - s.allocated);
    const demand = waiting[s.sku] ?? 0;
    const status: WmsStockStatus = demand > available ? 'SHORT' : available === 0 ? 'OUT' : available < T.wmsReorderUnits.value ? 'LOW' : 'OK';
    return {
      index: s.sku,
      sku: sku.code,
      desc: sku.desc,
      bin: binCode(s.bin),
      ...binPlace(s.bin),
      onHand: s.onHand,
      allocated: s.allocated,
      available,
      onOrder: onOrder[s.sku] ?? 0,
      dock: dock[s.sku] ?? 0,
      demand,
      picked: s.picked,
      counted: s.counted,
      variance: s.variance,
      status,
    };
  });
  let onHand = 0;
  let available = 0;
  let ordered = 0;
  for (const row of stock) {
    onHand += row.onHand;
    available += row.available;
    ordered += row.onOrder + row.dock;
  }
  const inventoryKpis: WmsInventoryKpis = {
    skus: stock.length,
    onHand,
    available,
    onOrder: ordered,
    low: stock.filter((row) => row.status !== 'OK').length,
    short: stock.filter((row) => row.status === 'SHORT').length,
    accuracyPct: pct(w.inbound.countsAccurate, w.inbound.counts),
  };
  return { stock, inventoryKpis };
}

/** A task, ready to show (W8). `orders` gives a pick task its priority; `doors` a receive task its door. */
function taskView(t: WmsTask, orders: ReadonlyMap<number, WmsOrder>, doors: ReadonlyMap<number, number>): WmsTaskView {
  const sku = skuAt(t.sku);
  const pick = t.kind === 'PICK';
  const door = pick ? 0 : (doors.get(t.ref) ?? 0);
  return {
    no: t.no,
    code: taskCode(t.no),
    kind: t.kind,
    status: t.status,
    order: pick ? t.ref : 0,
    po: pick ? 0 : t.ref,
    ref: `${pick ? orderCode(t.ref) : poCode(t.ref)}/L${t.line}`,
    sku: sku.code,
    desc: sku.desc,
    where: t.kind === 'RECEIVE' ? (door > 0 ? `Dock D${door}` : 'Dock') : binCode(t.bin),
    qty: t.qty,
    done: t.done,
    priority: pick ? (orders.get(t.ref)?.priority ?? 0) : 0,
    worker: t.worker,
    created: t.created,
    started: t.started,
    finished: t.finished,
  };
}

/** Tasks a worker's page lists as done, newest first. */
const DONE_SHOWN = 8;

function workerView(p: WmsWorker, tasks: ReadonlyMap<number, WmsTask>, done: readonly WmsTask[], doors: ReadonlyMap<number, number>, toView: (t: WmsTask) => WmsTaskView): WmsWorkerView {
  const active = tasks.get(p.task);
  const task = active === undefined ? null : toView(active);
  const queue = p.queue.map((no) => tasks.get(no)).filter((t): t is WmsTask => t !== undefined).map(toView);
  const mine = done.filter((t) => t.worker === p.id).slice(0, DONE_SHOWN).map(toView);
  const time = p.stats.busy + p.stats.walking + p.stats.idle;
  return {
    id: p.id,
    name: workerCode(p.id),
    role: p.role,
    state: active === undefined ? 'idle' : p.walk > 0 ? 'walking' : 'working',
    task,
    queue,
    done: mine,
    at: p.at,
    ...binPlace(p.at),
    walk: p.walk,
    door: active?.kind === 'RECEIVE' ? (doors.get(active.ref) ?? 0) : 0,
    pct: task === null || task.qty === 0 ? 0 : Math.min(100, Math.floor((task.done * 100) / task.qty)),
    stats: p.stats,
    utilPct: pct(p.stats.busy, time),
  };
}

/** The dock schedule (W8): the appointment slots from the one now under way to the end of the day, with the POs booked into each. */
function scheduleView(w: WmsState, tick: number): WmsSlotView[] {
  const slot = T.wmsApptSlotTicks.value;
  const from = Math.floor(tick / slot) * slot;
  const byAt = new Map<number, WmsSlotView['pos'][number][]>();
  for (const po of w.pos) {
    if (po.appt < from && po.status === 'CLOSED') continue;
    if (po.appt < from && po.status !== 'IN TRANSIT' && po.status !== 'ARRIVED') continue;
    const list = byAt.get(po.appt) ?? [];
    list.push({ no: po.no, code: poCode(po.no), supplier: supplierAt(po.supplier).name, status: po.status, late: po.late, door: po.door });
    byAt.set(po.appt, list);
  }
  const ats = [...byAt.keys()].sort((a, b) => a - b);
  return ats.map((at) => ({ at, pos: byAt.get(at) ?? [] }));
}

/** What the WMS screens read (docs/wms-plan.md; RULES 10). */
export function wmsView(w: WmsState, tick: number): WmsView {
  const pickerOn = new Map<number, number>();
  const taskOn = new Map<number, number>();
  for (const t of w.tasks) {
    if (t.kind !== 'PICK' || (t.status !== 'OPEN' && t.status !== 'QUEUED' && t.status !== 'ACTIVE')) continue;
    const key = lineKey(t.ref, t.line);
    taskOn.set(key, t.no);
    if (t.status === 'ACTIVE') pickerOn.set(key, t.worker);
  }
  const rows = w.orders.map((o) => orderView(o, pickerOn, taskOn));
  const open = rows.filter((o) => o.open);
  const closed = rows.filter((o) => !o.open).sort((a, b) => b.closed - a.closed || b.no - a.no);
  const s = w.stats;
  let recent = 0;
  for (const n of w.recent) recent += n;
  let recentPay = 0;
  for (const n of w.recentPay) recentPay += n;
  // A warehouse hour is 60 warehouse minutes of wmsMinuteTicks ticks.
  const hourTicks = 60 * T.wmsMinuteTicks.value;
  const windowTicks = WMS_RATE_BUCKETS * WMS_RATE_BUCKET_TICKS;
  const pickers = w.workers.filter((p) => p.role === 'pick');
  const kpis: WmsKpis = {
    open: open.length,
    linesPerHour: Math.floor((recent * hourTicks) / windowTicks),
    fillRatePct: pct(s.unitsShipped, s.unitsOrdered),
    otifPct: pct(s.otif, s.shipped),
    exceptions: open.filter((o) => o.exception).length,
    pickersBusy: pickers.filter((p) => p.task > 0).length,
    pickersTotal: pickers.length,
    shipped: s.shipped,
    earnedPerHour: Math.floor((recentPay * hourTicks) / windowTicks),
  };
  const tasks = new Map<number, WmsTask>();
  for (const t of w.tasks) tasks.set(t.no, t);
  const orders = new Map<number, WmsOrder>();
  for (const o of w.orders) orders.set(o.no, o);
  const doors = new Map<number, number>();
  for (const po of w.pos) if (po.door > 0) doors.set(po.no, po.door);
  const toView = (t: WmsTask): WmsTaskView => taskView(t, orders, doors);
  const done = w.tasks.filter((t) => t.status === 'DONE').sort((a, b) => b.finished - a.finished || b.no - a.no);
  const workers = w.workers.map((p) => workerView(p, tasks, done, doors, toView));
  let busy = 0;
  let time = 0;
  for (const p of w.workers) {
    busy += p.stats.busy;
    time += p.stats.busy + p.stats.walking + p.stats.idle;
  }
  const waiting = w.tasks.filter((t) => t.status === 'OPEN');
  const crewKpis: WmsCrewKpis = {
    crew: w.workers.length,
    working: workers.filter((p) => p.state === 'working').length,
    walking: workers.filter((p) => p.state === 'walking').length,
    idle: workers.filter((p) => p.state === 'idle').length,
    pickOpen: waiting.filter((t) => t.kind === 'PICK').length,
    receiveOpen: waiting.filter((t) => t.kind !== 'PICK').length,
    utilPct: pct(busy, time),
  };
  return {
    rev: Math.floor((tick - 1) / T.wmsStepTicks.value),
    orders: [...open, ...closed],
    events: eventViews(w.events),
    kpis,
    workers,
    crewKpis,
    policy: w.policy,
    crew: w.workers.length,
    // Read only: the needs are counted, nothing is changed.
    needs: crewNeeds(w as unknown as MWms, tick),
    waveChoices: waveChoices(),
    growth: { hireCost: hireCost(w.workers.length), maxCrew: T.wmsMaxCrew.value, doorCost: doorCost(w.doors), maxDoors: T.wmsMaxDoors.value },
    layout: { aisles: WMS_AISLES, bays: WMS_BAYS, aisleGap: WMS_AISLE_GAP_BAYS, doors: w.doors },
    countries: w.dests.map((d, i) => ({ ...destinationAt(i), shipped: d.shipped, otif: d.otif, otifPct: pct(d.otif, d.shipped), goodwill: d.goodwill })),
    nextWaveIn: Math.max(0, w.nextWaveAt - tick),
    expediteCost: T.wmsExpediteCostCents.value,
    ...inboundView(w),
    schedule: scheduleView(w, tick),
    ...inventoryView(w),
    stats: w.stats,
    today: w.today,
    yesterday: w.yesterday,
  };
}
