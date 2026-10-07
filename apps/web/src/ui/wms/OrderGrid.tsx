import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { WmsOrderView } from '@warehouse/contracts';
import { ROW_H, clock, rowSignature, rowWindow, statusTone, type Sort, type SortKey } from './grid.ts';

/** Where the grid was scrolled, kept by the screen so going back to it lands in the same place. */
export interface GridScroll {
  top: number;
  left: number;
}

/** Columns, with fixed widths in px (slice 9): a fixed table layout never re-measures columns when rows come and go. The first five fit a 360 px phone. */
const COLUMNS: readonly { readonly key: SortKey; readonly label: string; readonly className: string; readonly width: number }[] = [
  { key: 'no', label: 'Order #', className: 'c-no', width: 76 },
  { key: 'dest', label: 'Dest', className: 'c-dest', width: 66 },
  { key: 'status', label: 'Status', className: 'c-status', width: 96 },
  { key: 'lines', label: 'Lines', className: 'c-lines num', width: 52 },
  { key: 'pct', label: '%', className: 'c-pct num', width: 50 },
  { key: 'priority', label: 'Pri', className: 'c-pri', width: 40 },
  { key: 'wave', label: 'Wave', className: 'c-wave num', width: 66 },
  { key: 'units', label: 'Units', className: 'c-units num', width: 76 },
  { key: 'shipBy', label: 'Ship-by', className: 'c-time num', width: 70 },
  { key: 'created', label: 'Created', className: 'c-time num', width: 70 },
];
const TABLE_WIDTH = COLUMNS.reduce((n, c) => n + c.width, 0);

export function StatusChip(props: { status: WmsOrderView['status'] }): ReactElement {
  return <span className={`chip chip-${statusTone(props.status)}`}>{props.status}</span>;
}

const Row = memo(
  function Row(props: { order: WmsOrderView; tickMs: number; selected: boolean; onOpen: (no: number) => void }): ReactElement {
    const { order: o, tickMs, onOpen } = props;
    return (
      <tr className={o.exception ? 'exc' : undefined} aria-selected={props.selected} onClick={() => onOpen(o.no)} data-order={o.no}>
        <th scope="row" className="c-no">
          {o.code}
        </th>
        <td className="c-dest">
          <span aria-hidden="true">{o.dest.flag}</span> {o.dest.iso}
        </td>
        <td className="c-status">
          <StatusChip status={o.status} />
        </td>
        <td className="c-lines num">
          {o.linesPicked}/{o.linesTotal}
        </td>
        <td className="c-pct num">
          {o.pct}
          <i className="row-bar" style={{ transform: `scaleX(${o.pct / 100})` }} aria-hidden="true" />
        </td>
        <td className={`c-pri pri-${o.priority}`}>P{o.priority}</td>
        <td className="c-wave num">{o.wave === 0 ? '—' : `W-${String(o.wave).padStart(4, '0')}`}</td>
        <td className="c-units num">
          {o.unitsPicked}/{o.unitsOrdered}
        </td>
        <td className={`c-time num${o.late ? ' late' : ''}`}>{clock(o.shipBy, tickMs)}</td>
        <td className="c-time num">{clock(o.created, tickMs)}</td>
      </tr>
    );
  },
  (a, b) => a.selected === b.selected && a.tickMs === b.tickMs && a.onOpen === b.onOpen && rowSignature(a.order) === rowSignature(b.order),
);

/**
 * The order grid (docs/wms-plan.md slice 3): dense rows, a sticky header and
 * Order # column, more columns by scrolling sideways inside the grid only.
 * Rows are keyed by order number, so a live update never moves the scroll.
 * Only the rows near the screen are rendered (slice 9: 300 orders scroll at
 * full speed on a slow phone); spacer rows keep the scroll height true.
 */
export function OrderGrid(props: {
  orders: readonly WmsOrderView[];
  tickMs: number;
  sort: Sort | null;
  selected: ReadonlySet<number>;
  scroll: GridScroll;
  onSort: (key: SortKey) => void;
  onOpen: (no: number) => void;
  /** What to say when no order matches the filter. */
  empty: string;
}): ReactElement {
  const { scroll, orders } = props;
  const box = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState(() => rowWindow(scroll.top, 740, orders.length));
  // The grid's height, kept by a ResizeObserver: reading clientHeight on every scroll forces a layout each time.
  const height = useRef(740);
  const measure = useCallback(() => {
    const el = box.current;
    if (el === null) return;
    const next = rowWindow(el.scrollTop, height.current, orders.length);
    setWin((w) => (w.start === next.start && w.end === next.end ? w : next));
  }, [orders.length]);
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    height.current = el.clientHeight;
    measure();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      height.current = entry.contentRect.height;
      measure();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  // Scroll events can come several a frame; measure once, at the start of the next frame.
  const pending = useRef(0);
  const onScroll = useCallback(() => {
    if (pending.current !== 0) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      measure();
    });
  }, [measure]);
  useLayoutEffect(() => () => cancelAnimationFrame(pending.current), []);
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    el.scrollTop = scroll.top;
    el.scrollLeft = scroll.left;
    return () => {
      scroll.top = el.scrollTop;
      scroll.left = el.scrollLeft;
    };
  }, [scroll]);
  return (
    <div className="wms-grid" ref={box} onScroll={onScroll} data-testid="wms-grid">
      <table style={{ width: TABLE_WIDTH }}>
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = props.sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={c.className} aria-sort={active ? (props.sort?.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => props.onSort(c.key)}>
                    {c.label}
                    {active && <span aria-hidden="true">{props.sort?.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {win.start > 0 && (
            <tr className="spacer" aria-hidden="true">
              <td colSpan={COLUMNS.length} style={{ height: win.start * ROW_H }} />
            </tr>
          )}
          {orders.slice(win.start, win.end).map((o) => (
            <Row key={o.no} order={o} tickMs={props.tickMs} selected={props.selected.has(o.no)} onOpen={props.onOpen} />
          ))}
          {win.end < orders.length && (
            <tr className="spacer" aria-hidden="true">
              <td colSpan={COLUMNS.length} style={{ height: (orders.length - win.end) * ROW_H }} />
            </tr>
          )}
        </tbody>
      </table>
      {orders.length === 0 && <p className="wms-empty">{props.empty}</p>}
    </div>
  );
}
