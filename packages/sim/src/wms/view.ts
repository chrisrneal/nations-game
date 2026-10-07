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
  WmsState,
  WmsStockStatus,
  WmsStockView,
  WmsView,
} from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, binCode, destinationAt, isClosed, orderCode, poCode, skuAt, supplierAt } from './catalog.ts';
import { inboundUnits, waitingUnits } from './inbound.ts';

const EXCEPTION_STATUSES: ReadonlySet<WmsOrderStatus> = new Set(['SHORT', 'ON HOLD', 'BACKORDER']);
const EXCEPTION_EVENTS: ReadonlySet<WmsEventCode> = new Set(['ALLOC SHORT', 'SHORT PICK', 'CUTOFF MISS', 'HOLD', 'CANCEL', 'PO LATE', 'RCV SHORT', 'DAMAGE', 'ADJUST']);
/** Events whose `order` field is a PO number (W6). */
const INBOUND_EVENTS: ReadonlySet<WmsEventCode> = new Set(['PO CRT', 'ARRIVE', 'PO LATE', 'DOCK', 'RCV', 'RCV SHORT', 'DAMAGE', 'PUTAWAY', 'PO CLOSE']);

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function pickerName(id: number): string {
  return `Picker ${pad(id, 2)}`;
}

export function receiverName(id: number): string {
  return `Rcvr ${pad(id, 2)}`;
}

function lineViews(o: WmsOrder, pickerOn: ReadonlyMap<string, number>): WmsLineView[] {
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
      picker: pickerOn.get(`${o.no}/${l.no}`) ?? 0,
    };
  });
}

/** A row of the order grid, with its lines. */
function orderView(o: WmsOrder, contracts: readonly string[], pickerOn: ReadonlyMap<string, number>) {
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
    source: contracts[Math.min(o.source, contracts.length - 1)] ?? '',
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
    lines: lineViews(o, pickerOn),
  };
}

/** The feed's two text columns for an event: what it refers to, and the detail. */
export function eventText(e: WmsEvent): { ref: string; detail: string } {
  const inbound = INBOUND_EVENTS.has(e.code);
  const order = e.order > 0 ? (inbound ? poCode(e.order) : orderCode(e.order)) : '';
  const ref = e.line > 0 ? `${order}/L${e.line}` : order;
  const sku = e.sku >= 0 ? skuAt(e.sku).code : '';
  const who = e.picker > 0 ? `  ${inbound ? receiverName(e.picker) : pickerName(e.picker)}` : '';
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
    case 'REPLEN':
      return { ref: sku, detail: `+${e.qty} units` };
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
      return { ref, detail: 'ETA passed' };
    case 'DOCK':
      return { ref, detail: `door D${e.qty}` };
    case 'RCV':
      return { ref, detail: `${sku}  ${e.qty}/${e.of}${who}` };
    case 'RCV SHORT':
      return { ref, detail: `${sku}  short ${e.qty}/${e.of}` };
    case 'DAMAGE':
      return { ref, detail: `${sku}  ${e.qty} damaged` };
    case 'PUTAWAY':
      return { ref, detail: `${sku}  +${e.qty} units` };
    case 'PO CLOSE':
      return { ref, detail: `${e.qty}/${e.of} units` };
    case 'CYCLE CNT':
      return { ref: sku, detail: e.qty === e.of ? `${e.qty} units, matched` : `${e.qty} counted, system ${e.of}` };
    case 'ADJUST':
      return { ref: sku, detail: `${e.qty > 0 ? '+' : ''}${e.qty} units` };
    default:
      return { ref, detail: '' };
  }
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
    out.push({ key: n === 1 ? base : `${base}#${n}`, tick: e.tick, code: e.code, order: inbound ? 0 : e.order, po: inbound ? e.order : 0, ...eventText(e), exception: EXCEPTION_EVENTS.has(e.code) });
  }
  return out;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.floor((part * 100) / whole);
}

/** A row of the inbound grid (W6), with its lines. */
function poView(po: WmsPo, receiverOn: ReadonlyMap<string, number>): WmsPoView {
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
    eta: po.eta,
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
        receiver: receiverOn.get(`${po.no}/${l.no}`) ?? 0,
      };
    }),
  };
}

/** The inbound page (W6): POs open first (oldest first), then closed (newest first), and its KPIs. */
function inboundView(w: WmsState, windowSec: number): { pos: WmsPoView[]; inboundKpis: WmsInboundKpis } {
  const receiverOn = new Map<string, number>();
  for (const rc of w.receivers) if (rc.po > 0) receiverOn.set(`${rc.po}/${rc.line}`, rc.id);
  const rows = w.pos.map((po) => poView(po, receiverOn));
  const open = rows.filter((po) => po.open);
  const closed = rows.filter((po) => !po.open).sort((a, b) => b.closed - a.closed || b.no - a.no);
  let recentIn = 0;
  for (const n of w.recentIn) recentIn += n;
  const s = w.inbound;
  const inboundKpis: WmsInboundKpis = {
    open: open.length,
    inTransit: open.filter((po) => po.status === 'IN TRANSIT').length,
    atDock: open.filter((po) => po.status === 'ARRIVED' || po.status === 'RECEIVING').length,
    doorsBusy: open.filter((po) => po.status === 'RECEIVING').length,
    doorsTotal: T.wmsDockDoors.value,
    receiversBusy: w.receivers.filter((rc) => rc.po > 0).length,
    receiversTotal: w.receivers.length,
    unitsPerHour: Math.floor((recentIn * 3600) / windowSec),
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

/**
 * What the WMS screens read (docs/wms-plan.md slices 3-8). `contracts` names
 * the customer accounts, `payCents` is an idle order's pay now (the expedite
 * price is a number of those).
 */
export function wmsView(w: WmsState, tick: number, contracts: readonly string[], payCents: number): WmsView {
  const pickerOn = new Map<string, number>();
  for (const p of w.pickers) if (p.order > 0) pickerOn.set(`${p.order}/${p.line}`, p.id);
  const rows = w.orders.map((o) => orderView(o, contracts, pickerOn));
  const open = rows.filter((o) => o.open);
  const closed = rows.filter((o) => !o.open).sort((a, b) => b.closed - a.closed || b.no - a.no);
  const s = w.stats;
  const windowSec = (WMS_RATE_BUCKETS * WMS_RATE_BUCKET_TICKS * T.tickMs.value) / 1000;
  let recent = 0;
  for (const n of w.recent) recent += n;
  const kpis: WmsKpis = {
    open: open.length,
    linesPerHour: Math.floor((recent * 3600) / windowSec),
    fillRatePct: pct(s.unitsShipped, s.unitsOrdered),
    otifPct: pct(s.otif, s.shipped),
    exceptions: open.filter((o) => o.exception).length,
    pickersBusy: w.pickers.filter((p) => p.order > 0).length,
    pickersTotal: w.pickers.length,
    shipped: s.shipped,
  };
  return {
    rev: Math.floor((tick - 1) / T.wmsStepTicks.value),
    orders: [...open, ...closed],
    events: eventViews(w.events),
    kpis,
    pickers: w.pickers.map((p) => ({ id: p.id, order: p.order, line: p.line })),
    countries: w.dests.map((d, i) => ({ ...destinationAt(i), shipped: d.shipped, otif: d.otif, otifPct: pct(d.otif, d.shipped), goodwill: d.goodwill })),
    nextWaveIn: Math.max(0, w.nextWaveAt - tick),
    expediteCost: payCents * T.wmsExpediteCostOrders.value,
    ...inboundView(w, windowSec),
    ...inventoryView(w),
  };
}
