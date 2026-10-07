import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { nextSortKey, sortRows, type ColumnSort } from './grid.ts';
import type { StatusTone } from './grid.ts';

/** A coloured status chip (the order grid's colours). */
export function Chip(props: { tone: StatusTone; children: ReactNode }): ReactElement {
  return <span className={`chip chip-${props.tone}`}>{props.children}</span>;
}

export interface Column<R> {
  readonly key: string;
  readonly label: string;
  /** Width in CSS px: a fixed table layout, like the order grid. */
  readonly width: number;
  readonly className?: string;
  readonly render: (row: R) => ReactNode;
  /** What the column sorts by; without it the header does not sort. */
  readonly sort?: (row: R) => number | string;
}

/**
 * A small WMS grid (W6, the inbound and inventory pages): the order grid's
 * look, a sticky header and first column, more columns by scrolling sideways
 * inside the grid, and sort by header. These grids hold a few dozen rows at
 * most, so every row renders.
 */
export function DataGrid<R>(props: {
  rows: readonly R[];
  columns: readonly Column<R>[];
  rowKey: (row: R) => number;
  rowClass?: (row: R) => string | undefined;
  onOpen?: (key: number) => void;
  empty: string;
  testId: string;
}): ReactElement {
  const { columns, rowKey } = props;
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const rows = useMemo(() => {
    const column = sort === null ? undefined : columns.find((c) => c.key === sort.key);
    return column?.sort === undefined || sort === null ? props.rows : sortRows(props.rows, column.sort, sort.dir, rowKey);
  }, [props.rows, columns, sort, rowKey]);
  const width = columns.reduce((n, c) => n + c.width, 0);
  return (
    <div className="wms-grid" data-testid={props.testId}>
      <table style={{ width }}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const active = sort?.key === c.key;
              const className = [i === 0 ? 'c-no' : '', c.className ?? ''].join(' ').trim() || undefined;
              return (
                <th key={c.key} scope="col" className={className} aria-sort={active ? (sort?.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  {c.sort === undefined ? (
                    <span className="th-plain">{c.label}</span>
                  ) : (
                    <button type="button" onClick={() => setSort((s) => nextSortKey(s, c.key))}>
                      {c.label}
                      {active && <span aria-hidden="true">{sort?.dir === 1 ? '▲' : '▼'}</span>}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} className={props.rowClass?.(row)} onClick={props.onOpen === undefined ? undefined : () => props.onOpen?.(key)} data-row={key}>
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.key} scope="row" className={['c-no', c.className ?? ''].join(' ').trim()}>
                      {c.render(row)}
                    </th>
                  ) : (
                    <td key={c.key} className={c.className}>
                      {c.render(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="wms-empty">{props.empty}</p>}
    </div>
  );
}
