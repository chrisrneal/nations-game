import { memo, useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WmsOrderView } from '@warehouse/contracts';
import { clock, rowSignature, statusTone, type Sort, type SortKey } from './grid.ts';

/** Where the grid was scrolled, kept by the screen so going back to it lands in the same place. */
export interface GridScroll {
  top: number;
  left: number;
}

const COLUMNS: readonly { readonly key: SortKey; readonly label: string; readonly className: string }[] = [
  { key: 'no', label: 'Order #', className: 'c-no' },
  { key: 'dest', label: 'Dest', className: 'c-dest' },
  { key: 'status', label: 'Status', className: 'c-status' },
  { key: 'lines', label: 'Lines', className: 'c-lines num' },
  { key: 'pct', label: '%', className: 'c-pct num' },
  { key: 'priority', label: 'Pri', className: 'c-pri' },
  { key: 'wave', label: 'Wave', className: 'c-wave num' },
  { key: 'units', label: 'Units', className: 'c-units num' },
  { key: 'shipBy', label: 'Ship-by', className: 'c-time num' },
  { key: 'created', label: 'Created', className: 'c-time num' },
];

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
 */
export function OrderGrid(props: {
  orders: readonly WmsOrderView[];
  tickMs: number;
  sort: Sort | null;
  selected: ReadonlySet<number>;
  scroll: GridScroll;
  onSort: (key: SortKey) => void;
  onOpen: (no: number) => void;
}): ReactElement {
  const { scroll } = props;
  const box = useRef<HTMLDivElement>(null);
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
    <div className="wms-grid" ref={box} data-testid="wms-grid">
      <table>
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
          {props.orders.map((o) => (
            <Row key={o.no} order={o} tickMs={props.tickMs} selected={props.selected.has(o.no)} onOpen={props.onOpen} />
          ))}
        </tbody>
      </table>
      {props.orders.length === 0 && <p className="wms-empty">No orders here.</p>}
    </div>
  );
}
