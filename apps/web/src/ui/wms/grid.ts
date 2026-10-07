import type { WmsOrderStatus, WmsOrderView } from '@warehouse/contracts';

/** The filter chips above the order grid. */
export type WmsFilter = 'all' | 'open' | 'picking' | 'exceptions' | 'shipped';

export const FILTERS: readonly { readonly id: WmsFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'picking', label: 'Picking' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'shipped', label: 'Shipped' },
];

export function matches(o: WmsOrderView, filter: WmsFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return o.open;
    case 'picking':
      return o.status === 'PICKING';
    case 'exceptions':
      return o.exception;
    case 'shipped':
      return o.status === 'SHIPPED';
  }
}

export function filterCounts(orders: readonly WmsOrderView[]): Record<WmsFilter, number> {
  const counts: Record<WmsFilter, number> = { all: 0, open: 0, picking: 0, exceptions: 0, shipped: 0 };
  for (const o of orders) for (const f of FILTERS) if (matches(o, f.id)) counts[f.id] += 1;
  return counts;
}

/** An order's statuses in the order it moves through them, then the exceptions: sorting by status follows the flow. */
export const STATUS_FLOW: readonly WmsOrderStatus[] = ['NEW', 'RELEASED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED', 'STAGED', 'LOADED', 'SHIPPED', 'SHORT', 'BACKORDER', 'ON HOLD', 'CANCELLED'];

/** The colour family of a status chip: grey new, blue released, amber picking, green on its way, red exceptions, struck-through cancelled. */
export type StatusTone = 'new' | 'released' | 'picking' | 'done' | 'bad' | 'cancelled';

export function statusTone(status: WmsOrderStatus): StatusTone {
  switch (status) {
    case 'NEW':
      return 'new';
    case 'RELEASED':
    case 'ALLOCATED':
      return 'released';
    case 'PICKING':
      return 'picking';
    case 'PICKED':
    case 'PACKED':
    case 'STAGED':
    case 'LOADED':
    case 'SHIPPED':
      return 'done';
    case 'SHORT':
    case 'BACKORDER':
    case 'ON HOLD':
      return 'bad';
    case 'CANCELLED':
      return 'cancelled';
  }
}

export type SortKey = 'no' | 'dest' | 'status' | 'lines' | 'pct' | 'priority' | 'wave' | 'units' | 'shipBy' | 'created';

export interface Sort {
  readonly key: SortKey;
  /** 1 ascending, -1 descending. */
  readonly dir: 1 | -1;
}

function sortValue(o: WmsOrderView, key: SortKey): number | string {
  switch (key) {
    case 'no':
      return o.no;
    case 'dest':
      return o.dest.iso;
    case 'status':
      return STATUS_FLOW.indexOf(o.status);
    case 'lines':
      return o.linesTotal === 0 ? 0 : o.linesPicked / o.linesTotal;
    case 'pct':
      return o.pct;
    case 'priority':
      return o.priority;
    case 'wave':
      return o.wave;
    case 'units':
      return o.unitsOrdered;
    case 'shipBy':
      return o.shipBy;
    case 'created':
      return o.created;
  }
}

/** Sorted by `sort` (ties by order number), or the view's own order (open first) with no sort. Never changes `orders`. */
export function sortOrders(orders: readonly WmsOrderView[], sort: Sort | null): WmsOrderView[] {
  if (sort === null) return [...orders];
  return [...orders].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return c * sort.dir || a.no - b.no;
  });
}

/** Tapping a header: sort by it ascending, then descending, then back to no sort. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current === null || current.key !== key) return { key, dir: 1 };
  if (current.dir === 1) return { key, dir: -1 };
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** A tick as WMS time since opening, minutes and seconds run together: tick 408 at 250 ms is T+0142. */
export function clock(tick: number, tickMs: number): string {
  const s = Math.max(0, Math.floor((tick * tickMs) / 1000));
  return `T+${pad2(Math.floor(s / 60))}${pad2(s % 60)}`;
}

/** Time left to a tick as m:ss, or -m:ss once it has passed. */
export function countdown(ticks: number, tickMs: number): string {
  const s = Math.floor((Math.abs(ticks) * tickMs) / 1000);
  return `${ticks < 0 ? '-' : ''}${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** The parts of a row that change what it shows; a row re-renders only when this does. */
export function rowSignature(o: WmsOrderView): string {
  return `${o.status}|${o.linesPicked}|${o.unitsPicked}|${o.pct}|${o.priority}|${o.wave}|${o.late ? 1 : 0}|${o.exception ? 1 : 0}|${o.shipBy}`;
}

/** The grid's row height and header height in CSS px; wms.css sets the same (slice 9). */
export const ROW_H = 36;
export const HEAD_H = 40;

/**
 * Which rows to render (slice 9): the ones on screen plus a margin either
 * side, in steps of `chunk` rows, so scrolling re-renders the grid once every
 * few rows instead of every frame. `end` is exclusive.
 */
export function rowWindow(scrollTop: number, viewHeight: number, total: number, chunk = 4, margin = 8): { start: number; end: number } {
  const first = Math.max(0, Math.floor((scrollTop - HEAD_H) / ROW_H) - margin);
  const start = Math.min(Math.floor(first / chunk) * chunk, Math.max(0, total - 1));
  const shown = Math.ceil(viewHeight / ROW_H) + 2 * margin + chunk;
  return { start: Math.max(0, start), end: Math.min(total, start + shown) };
}
