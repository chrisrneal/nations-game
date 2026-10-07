import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { WmsEventView, WmsPoLineView, WmsPoView, WmsSlotView } from '@warehouse/contracts';
import { Chip, DataGrid, type Column } from './DataGrid.tsx';
import { PO_FILTERS, clock, countMatches, countdown, poMatches, poTone, type PoFilter } from './grid.ts';
import { EventLines } from './OrderDetail.tsx';
import { tickTime, type ClockShape } from '../format.ts';

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

/** The inbound grid's columns: PO, status, appointment and supplier fit a 360 px phone. */
function poColumns(time: ClockShape): readonly Column<WmsPoView>[] {
  return [
    { key: 'no', label: 'PO #', width: 84, render: (po) => po.code, sort: (po) => po.no },
    { key: 'status', label: 'Status', width: 96, className: 'c-status', render: (po) => <Chip tone={poTone(po.status)}>{po.status}</Chip>, sort: (po) => ['IN TRANSIT', 'ARRIVED', 'RECEIVING', 'PUTAWAY', 'CLOSED'].indexOf(po.status) },
    { key: 'appt', label: 'Appt', width: 60, className: 'num', render: (po) => <span className={po.late && po.open ? 'late' : undefined}>{clock(po.appt, time)}</span>, sort: (po) => po.appt },
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
    { key: 'door', label: 'Door', width: 52, className: 'num', render: (po) => (po.door === 0 ? '—' : `D${po.door}`), sort: (po) => po.door },
    { key: 'lines', label: 'Lines', width: 52, className: 'num', render: (po) => `${po.linesReceived}/${po.linesTotal}`, sort: (po) => po.linesTotal },
    { key: 'created', label: 'Created', width: 70, className: 'num', render: (po) => clock(po.created, time), sort: (po) => po.created },
  ];
}

/**
 * The inbound page (W6): purchase orders the WMS raised to its suppliers, from
 * the road through the yard, the dock doors and receiving to put-away. Tap a
 * PO for its lines and history.
 */
export function InboundGrid(props: { pos: readonly WmsPoView[]; schedule: readonly WmsSlotView[]; time: ClockShape; day: number; onOpen: (no: number) => void }): ReactElement {
  const [filter, setFilter] = useState<PoFilter>('all');
  const [plan, setPlan] = useState(false);
  const counts = useMemo(() => countMatches(props.pos, PO_FILTERS, poMatches), [props.pos]);
  const shown = useMemo(() => props.pos.filter((po) => poMatches(po, filter)), [props.pos, filter]);
  const columns = useMemo(() => poColumns(props.time), [props.time]);
  return (
    <>
      <div className="wms-filters" role="tablist" aria-label="Filter purchase orders">
        <button type="button" role="tab" aria-selected={plan} className="wms-filter wms-choose" onClick={() => setPlan(true)} data-testid="wms-po-schedule">
          Dock schedule
        </button>
        {PO_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={!plan && filter === f.id}
            className="wms-filter"
            onClick={() => {
              setFilter(f.id);
              setPlan(false);
            }}
            data-testid={`wms-po-filter-${f.id}`}
          >
            {f.label} <span className="num">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {plan ? (
        <DockSchedule schedule={props.schedule} time={props.time} day={props.day} onOpen={props.onOpen} />
      ) : (
        <DataGrid rows={shown} columns={columns} rowKey={poKey} rowClass={poClass} onOpen={props.onOpen} empty={EMPTY[filter]} testId="wms-inbound" />
      )}
    </>
  );
}

/**
 * The dock schedule (W8): every appointment slot from the one under way, with
 * the POs reorder planning booked into it, at most one a door. A late truck
 * keeps its slot and is docked first when it comes. Tap a PO to open it.
 */
function DockSchedule(props: { schedule: readonly WmsSlotView[]; time: ClockShape; day: number; onOpen: (no: number) => void }): ReactElement {
  if (props.schedule.length === 0) {
    return (
      <div className="dock-schedule" data-testid="dock-schedule">
        <p className="wms-empty">No appointments booked. Reorder planning books one when a SKU runs low.</p>
      </div>
    );
  }
  return (
    <ol className="dock-schedule" data-testid="dock-schedule">
      {props.schedule.map((slot) => (
        <li key={slot.at}>
          <span className="slot-time num">{tickTime(slot.at, props.time, props.day)}</span>
          <ul className="slot-pos">
            {slot.pos.map((po) => (
              <li key={po.no}>
                <button type="button" className={po.late && po.status !== 'CLOSED' ? 'late' : undefined} onClick={() => props.onOpen(po.no)}>
                  <b>{po.code}</b>
                  <span className="slot-supplier">{po.supplier}</span>
                  <Chip tone={poTone(po.status)}>{po.late && po.status === 'IN TRANSIT' ? 'LATE' : po.status}</Chip>
                  <span className="num muted">{po.door === 0 ? '' : `D${po.door}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
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
export function PoDetail(props: { po: WmsPoView | undefined; events: readonly WmsEventView[]; tick: number; time: ClockShape; onBack: () => void }): ReactElement {
  const { po, time } = props;
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
            <Field label="Appt" className={po.late ? 'late' : undefined}>
              {clock(po.appt, time)} {po.status === 'IN TRANSIT' && <span className="muted">({countdown(po.appt - props.tick, time)})</span>}
              {po.late && ' LATE'}
            </Field>
            <Field label="Arrived">{po.arrived === 0 ? '—' : clock(po.arrived, time)}</Field>
            <Field label="Created">{clock(po.created, time)}</Field>
            <Field label="Closed">{po.closed === 0 ? '—' : clock(po.closed, time)}</Field>
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
          <p className="wms-note">Receivers count each line in at the door; then the WMS gives a receiver a put-away task to take it to its bin, and only then can it be picked. Short (−) units never came; damaged (✕) units are written off.</p>
          <h4 className="wms-subhead">Activity</h4>
          {props.events.length > 0 && <EventLines events={props.events} time={time} />}
          <p className="wms-note">The log keeps the latest 200 events of the whole WMS; older ones for this PO have scrolled out.</p>
        </div>
      )}
    </div>
  );
}
