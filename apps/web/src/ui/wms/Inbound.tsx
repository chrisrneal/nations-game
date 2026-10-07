import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { WmsEventView, WmsPoLineView, WmsPoView } from '@warehouse/contracts';
import { Chip, DataGrid, type Column } from './DataGrid.tsx';
import { PO_FILTERS, clock, countMatches, countdown, poMatches, poTone, type PoFilter } from './grid.ts';
import { EventLines } from './OrderDetail.tsx';

const EMPTY: Readonly<Record<PoFilter, string>> = {
  all: 'No purchase orders yet. Reorder planning raises the first within a second of opening.',
  open: 'Nothing on order: every PO is in.',
  transit: 'No trucks on the road.',
  dock: 'The yard and the doors are empty.',
  putaway: 'Nothing waiting for put-away.',
  exceptions: 'No exceptions. Every truck on time and in full.',
  closed: 'No PO has closed yet.',
};

function poKey(po: WmsPoView): number {
  return po.no;
}

function poClass(po: WmsPoView): string | undefined {
  return po.exception ? 'exc' : undefined;
}

/** The inbound grid's columns: the first four fit a 360 px phone. */
function poColumns(tickMs: number): readonly Column<WmsPoView>[] {
  return [
    { key: 'no', label: 'PO #', width: 84, render: (po) => po.code, sort: (po) => po.no },
    { key: 'status', label: 'Status', width: 96, className: 'c-status', render: (po) => <Chip tone={poTone(po.status)}>{po.status}</Chip>, sort: (po) => ['IN TRANSIT', 'ARRIVED', 'RECEIVING', 'PUTAWAY', 'CLOSED'].indexOf(po.status) },
    { key: 'supplier', label: 'Supplier', width: 104, className: 'c-supplier', render: (po) => po.supplier, sort: (po) => po.supplier },
    {
      key: 'pct',
      label: '%',
      width: 50,
      className: 'c-pct num',
      render: (po) => (
        <>
          {po.pct}
          <i className="row-bar" style={{ transform: `scaleX(${po.pct / 100})` }} aria-hidden="true" />
        </>
      ),
      sort: (po) => po.pct,
    },
    { key: 'units', label: 'Units', width: 86, className: 'num', render: (po) => `${po.unitsReceived}/${po.unitsExpected}`, sort: (po) => po.unitsExpected },
    { key: 'eta', label: 'ETA', width: 70, className: 'num', render: (po) => <span className={po.late ? 'late' : undefined}>{clock(po.eta, tickMs)}</span>, sort: (po) => po.eta },
    { key: 'door', label: 'Door', width: 52, className: 'num', render: (po) => (po.door === 0 ? '—' : `D${po.door}`), sort: (po) => po.door },
    { key: 'lines', label: 'Lines', width: 52, className: 'num', render: (po) => `${po.linesReceived}/${po.linesTotal}`, sort: (po) => po.linesTotal },
    { key: 'created', label: 'Created', width: 70, className: 'num', render: (po) => clock(po.created, tickMs), sort: (po) => po.created },
  ];
}

/**
 * The inbound page (W6): purchase orders the WMS raised to its suppliers, from
 * the road through the yard, the dock doors and receiving to put-away. Tap a
 * PO for its lines and history.
 */
export function InboundGrid(props: { pos: readonly WmsPoView[]; tickMs: number; onOpen: (no: number) => void }): ReactElement {
  const [filter, setFilter] = useState<PoFilter>('all');
  const counts = useMemo(() => countMatches(props.pos, PO_FILTERS, poMatches), [props.pos]);
  const shown = useMemo(() => props.pos.filter((po) => poMatches(po, filter)), [props.pos, filter]);
  const columns = useMemo(() => poColumns(props.tickMs), [props.tickMs]);
  return (
    <>
      <div className="wms-filters" role="tablist" aria-label="Filter purchase orders">
        {PO_FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="wms-filter" onClick={() => setFilter(f.id)} data-testid={`wms-po-filter-${f.id}`}>
            {f.label} <span className="num">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <DataGrid rows={shown} columns={columns} rowKey={poKey} rowClass={poClass} onOpen={props.onOpen} empty={EMPTY[filter]} testId="wms-inbound" />
    </>
  );
}

function Field(props: { label: string; children: ReactNode; className?: string | undefined }): ReactElement {
  return (
    <div className={props.className}>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function PoLineRow(props: { line: WmsPoLineView }): ReactElement {
  const l = props.line;
  const bad = l.short > 0 || l.damaged > 0;
  return (
    <tr className={bad ? 'short' : undefined}>
      <th scope="row" className="c-line num">
        {l.no}
      </th>
      <td className="c-sku">
        {l.sku}
        <span className="c-desc">{l.desc}</span>
      </td>
      <td className="c-bin">{l.bin}</td>
      <td className="num">{l.expected}</td>
      <td className="num">
        {l.received}
        {l.short > 0 && <span className="short-qty"> −{l.short}</span>}
        {l.damaged > 0 && <span className="short-qty"> ✕{l.damaged}</span>}
      </td>
      <td className="c-lstatus">
        <span className={`lstatus lstatus-${l.status.toLowerCase()}`}>{l.status}</span>
        {l.receiver > 0 && <span className="muted"> R{String(l.receiver).padStart(2, '0')}</span>}
      </td>
    </tr>
  );
}

/** One purchase order (W6): its summary, lines (short and damaged units in red) and its own activity. */
export function PoDetail(props: { po: WmsPoView | undefined; events: readonly WmsEventView[]; tick: number; tickMs: number; onBack: () => void }): ReactElement {
  const { po, tickMs } = props;
  return (
    <div className="wms-detail" data-testid="wms-po-detail">
      <div className="wms-detail-bar">
        <button type="button" className="wms-back" onClick={props.onBack} data-testid="wms-po-back">
          ‹ Inbound
        </button>
        {po !== undefined && (
          <>
            <h3 className="wms-detail-title">{po.code}</h3>
            <Chip tone={poTone(po.status)}>{po.status}</Chip>
          </>
        )}
      </div>
      {po === undefined ? (
        <p className="wms-empty">This PO has left the grid.</p>
      ) : (
        <div className="wms-detail-body">
          <dl className="wms-summary">
            <Field label="Supplier">{po.supplier}</Field>
            <Field label="Door">{po.door === 0 ? '—' : `D${po.door}`}</Field>
            <Field label="ETA" className={po.late ? 'late' : undefined}>
              {clock(po.eta, tickMs)} {po.status === 'IN TRANSIT' && <span className="muted">({countdown(po.eta - props.tick, tickMs)})</span>}
              {po.late && ' LATE'}
            </Field>
            <Field label="Arrived">{po.arrived === 0 ? '—' : clock(po.arrived, tickMs)}</Field>
            <Field label="Created">{clock(po.created, tickMs)}</Field>
            <Field label="Closed">{po.closed === 0 ? '—' : clock(po.closed, tickMs)}</Field>
            <Field label="Lines">
              {po.linesReceived}/{po.linesTotal}
            </Field>
            <Field label="Units">
              {po.unitsReceived}/{po.unitsExpected} · {po.pct}%
            </Field>
            <Field label="Short" className={po.unitsShort > 0 ? 'late' : undefined}>
              {po.unitsShort}
            </Field>
            <Field label="Damaged" className={po.unitsDamaged > 0 ? 'late' : undefined}>
              {po.unitsDamaged}
            </Field>
          </dl>
          <div className="wms-progress" aria-hidden="true">
            <i style={{ transform: `scaleX(${po.pct / 100})` }} />
          </div>
          <div className="wms-lines">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="c-line num">
                    L
                  </th>
                  <th scope="col">SKU · Desc</th>
                  <th scope="col">Bin</th>
                  <th scope="col" className="num">
                    Exp
                  </th>
                  <th scope="col" className="num">
                    Rcv
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <PoLineRow key={l.no} line={l} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="wms-note">Counted-in units reach their bin after a short put-away. Short (−) units never came; damaged (✕) units are written off.</p>
          <h4 className="wms-subhead">Activity</h4>
          {props.events.length > 0 && <EventLines events={props.events} tickMs={tickMs} />}
          <p className="wms-note">The log keeps the latest 200 events of the whole WMS; older ones for this PO have scrolled out.</p>
        </div>
      )}
    </div>
  );
}
