import type { WmsEvent, WmsEventCode, WmsEventView, WmsKpis, WmsLineView, WmsOrder, WmsOrderStatus, WmsState, WmsView } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { WMS_RATE_BUCKETS, WMS_RATE_BUCKET_TICKS, binCode, destinationAt, isClosed, orderCode, skuAt } from './catalog.ts';

const EXCEPTION_STATUSES: ReadonlySet<WmsOrderStatus> = new Set(['SHORT', 'ON HOLD', 'BACKORDER']);
const EXCEPTION_EVENTS: ReadonlySet<WmsEventCode> = new Set(['ALLOC SHORT', 'SHORT PICK', 'CUTOFF MISS', 'HOLD', 'CANCEL']);

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function pickerName(id: number): string {
  return `Picker ${pad(id, 2)}`;
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
  for (const l of o.lines) {
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
    linesTotal: o.lines.length,
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
    lines: lineViews(o, pickerOn),
  };
}

/** The feed's two text columns for an event: what it refers to, and the detail. */
export function eventText(e: WmsEvent): { ref: string; detail: string } {
  const order = e.order > 0 ? orderCode(e.order) : '';
  const ref = e.line > 0 ? `${order}/L${e.line}` : order;
  const sku = e.sku >= 0 ? skuAt(e.sku).code : '';
  const who = e.picker > 0 ? `  ${pickerName(e.picker)}` : '';
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
    out.push({ key: n === 1 ? base : `${base}#${n}`, tick: e.tick, code: e.code, order: e.order, ...eventText(e), exception: EXCEPTION_EVENTS.has(e.code) });
  }
  return out;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.floor((part * 100) / whole);
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
  };
}
