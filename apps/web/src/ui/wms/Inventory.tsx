import { useMemo, useState, type ReactElement } from 'react';
import type { WmsStockView } from '@warehouse/contracts';
import { Chip, DataGrid, type Column } from './DataGrid.tsx';
import { STOCK_FILTERS, clock, countMatches, signed, stockMatches, stockTone, type StockFilter } from './grid.ts';

const EMPTY: Readonly<Record<StockFilter, string>> = {
  all: 'No SKUs.',
  short: 'Every SKU can cover the order lines waiting for it.',
  low: 'Every SKU is above its reorder point.',
  inbound: 'Nothing on order.',
};

const STATUS_ORDER = ['SHORT', 'OUT', 'LOW', 'OK'];

function stockKey(row: WmsStockView): number {
  return row.index;
}

function stockClass(row: WmsStockView): string | undefined {
  return row.status === 'SHORT' || row.status === 'OUT' ? 'exc' : undefined;
}

/** The inventory grid's columns: SKU, status, available and on hand fit a 360 px phone. */
function stockColumns(tickMs: number): readonly Column<WmsStockView>[] {
  return [
    {
      key: 'sku',
      label: 'SKU',
      width: 96,
      className: 'c-skucell',
      render: (row) => (
        <>
          {row.sku}
          <span className="c-desc">{row.desc}</span>
        </>
      ),
      sort: (row) => row.sku,
    },
    { key: 'status', label: 'Status', width: 74, className: 'c-status', render: (row) => <Chip tone={stockTone(row.status)}>{row.status}</Chip>, sort: (row) => STATUS_ORDER.indexOf(row.status) },
    { key: 'available', label: 'Avail', width: 58, className: 'num', render: (row) => row.available, sort: (row) => row.available },
    { key: 'onHand', label: 'On hand', width: 70, className: 'num', render: (row) => row.onHand, sort: (row) => row.onHand },
    { key: 'allocated', label: 'Alloc', width: 58, className: 'num', render: (row) => row.allocated, sort: (row) => row.allocated },
    {
      key: 'inbound',
      label: 'Inbound',
      width: 74,
      className: 'num',
      render: (row) => (row.onOrder + row.dock === 0 ? '—' : `+${row.onOrder + row.dock}`),
      sort: (row) => row.onOrder + row.dock,
    },
    { key: 'demand', label: 'Demand', width: 70, className: 'num', render: (row) => <span className={row.demand > row.available ? 'late' : undefined}>{row.demand}</span>, sort: (row) => row.demand },
    { key: 'bin', label: 'Bin', width: 78, className: 'c-bincell', render: (row) => row.bin, sort: (row) => row.bin },
    { key: 'picked', label: 'Picked', width: 66, className: 'num', render: (row) => row.picked, sort: (row) => row.picked },
    { key: 'counted', label: 'Counted', width: 70, className: 'num', render: (row) => (row.counted < 0 ? '—' : clock(row.counted, tickMs)), sort: (row) => row.counted },
    {
      key: 'variance',
      label: 'Var',
      width: 52,
      className: 'num',
      render: (row) => <span className={row.variance < 0 ? 'late' : undefined}>{signed(row.variance)}</span>,
      sort: (row) => row.variance,
    },
  ];
}

/**
 * The inventory page (W6): every SKU's bin with what is on hand, allocated to
 * order lines, free, on its way in and waiting for it, how much has been
 * picked out, and its last cycle count. Planning reorders anything under its
 * reorder point (LOW); SHORT means the order lines waiting for it (Demand)
 * need more than is free.
 */
export function InventoryGrid(props: { stock: readonly WmsStockView[]; tickMs: number }): ReactElement {
  const [filter, setFilter] = useState<StockFilter>('all');
  const counts = useMemo(() => countMatches(props.stock, STOCK_FILTERS, stockMatches), [props.stock]);
  const shown = useMemo(() => props.stock.filter((row) => stockMatches(row, filter)), [props.stock, filter]);
  const columns = useMemo(() => stockColumns(props.tickMs), [props.tickMs]);
  return (
    <>
      <div className="wms-filters" role="tablist" aria-label="Filter SKUs">
        {STOCK_FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="wms-filter" onClick={() => setFilter(f.id)} data-testid={`wms-stock-filter-${f.id}`}>
            {f.label} <span className="num">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <DataGrid rows={shown} columns={columns} rowKey={stockKey} rowClass={stockClass} empty={EMPTY[filter]} testId="wms-inventory" />
    </>
  );
}
