import type { ReactElement, ReactNode } from 'react';
import type { WmsEventView, WmsLineView, WmsOrderView } from '@warehouse/contracts';
import { clock, countdown } from './grid.ts';
import { payFactor } from './Countries.tsx';
import { StatusChip } from './OrderGrid.tsx';

const PRIORITY_NAMES = ['', 'Expedite', 'High', 'Standard'] as const;

function Field(props: { label: string; children: ReactNode; className?: string | undefined }): ReactElement {
  return (
    <div className={props.className}>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function LineRow(props: { line: WmsLineView; selected: boolean; onSelect: (no: number) => void }): ReactElement {
  const l = props.line;
  const className = [l.short > 0 ? 'short' : '', l.status === 'CANCELLED' ? 'cancelled' : ''].join(' ').trim();
  return (
    <tr className={className === '' ? undefined : className} aria-selected={props.selected} onClick={() => props.onSelect(l.no)}>
      <th scope="row" className="c-line num">
        {l.no}
      </th>
      <td className="c-sku">
        {l.sku}
        <span className="c-desc">{l.desc}</span>
      </td>
      <td className="c-bin">{l.bin}</td>
      <td className="num">{l.ordered}</td>
      <td className="num">
        {l.picked}
        {l.short > 0 && <span className="short-qty"> −{l.short}</span>}
      </td>
      <td className="c-lstatus">
        <span className={`lstatus lstatus-${l.status.toLowerCase()}`}>{l.status}</span>
        {l.picker > 0 && <span className="muted"> P{String(l.picker).padStart(2, '0')}</span>}
      </td>
    </tr>
  );
}

/** Activity lines, newest first: a few lines of the WMS console. Tapping one opens its order or PO. */
export function EventLines(props: { events: readonly WmsEventView[]; tickMs: number; onOpen?: (event: WmsEventView) => void }): ReactElement {
  const { onOpen } = props;
  return (
    <ol className="wms-log">
      {props.events.map((e) => (
        <li key={e.key} className={e.exception ? 'exc' : undefined}>
          <button type="button" disabled={onOpen === undefined || (e.order === 0 && e.po === 0)} onClick={() => onOpen?.(e)}>
            <span className="t">{clock(e.tick, props.tickMs)}</span>
            <span className="code">{e.code}</span>
            <span className="ref">{e.ref}</span>
            <span className="detail">{e.detail}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * One order (docs/wms-plan.md slice 4): a header summary, its lines with
 * shorts in red, and its own activity. `children` is the order's action bar
 * and `lineActions` the chosen line's (slice 7); tapping a line chooses it. The log keeps the latest 200 events of the whole WMS, so an old
 * order's history may have scrolled out of it.
 */
export function OrderDetail(props: {
  order: WmsOrderView | undefined;
  events: readonly WmsEventView[];
  tick: number;
  tickMs: number;
  /** The destination country's goodwill (slice 8), or null if unknown. */
  goodwill: number | null;
  onBack: () => void;
  selectedLine: number | null;
  onSelectLine: (no: number) => void;
  lineActions?: (line: WmsLineView) => ReactNode;
  children?: ReactNode;
}): ReactElement {
  const { order: o, tickMs } = props;
  const chosen = o?.lines.find((l) => l.no === props.selectedLine);
  return (
    <div className="wms-detail" data-testid="wms-detail">
      <div className="wms-detail-bar">
        <button type="button" className="wms-back" onClick={props.onBack} data-testid="wms-detail-back">
          ‹ Orders
        </button>
        {o !== undefined && (
          <>
            <h3 className="wms-detail-title">{o.code}</h3>
            <StatusChip status={o.status} />
          </>
        )}
      </div>
      {o === undefined ? (
        <p className="wms-empty">This order has left the grid.</p>
      ) : (
        <div className="wms-detail-body">
          <dl className="wms-summary">
            <Field label="Dest">
              <span aria-hidden="true">{o.dest.flag}</span> {o.dest.iso} · {o.dest.name}
            </Field>
            <Field label="Customer">{o.source}</Field>
            <Field label="Goodwill" className={props.goodwill !== null && props.goodwill < 40 ? 'late' : undefined}>
              {props.goodwill === null ? '—' : `${props.goodwill} · pay ${payFactor(props.goodwill)}`}
            </Field>
            <Field label="Expedited">{o.expedited ? 'Yes' : 'No'}</Field>
            <Field label="Priority" className={`pri-${o.priority}`}>
              P{o.priority} {PRIORITY_NAMES[o.priority]}
            </Field>
            <Field label="Wave">{o.wave === 0 ? '—' : `W-${String(o.wave).padStart(4, '0')}`}</Field>
            <Field label="Ship-by" className={o.late ? 'late' : undefined}>
              {clock(o.shipBy, tickMs)} {o.open && <span className="muted">({countdown(o.shipBy - props.tick, tickMs)})</span>}
              {o.late && ' LATE'}
            </Field>
            <Field label="Created">{clock(o.created, tickMs)}</Field>
            <Field label="Lines">
              {o.linesPicked}/{o.linesTotal}
            </Field>
            <Field label="Units">
              {o.unitsPicked}/{o.unitsOrdered} · {o.pct}%{o.shortUnits > 0 && <span className="late"> · short {o.shortUnits}</span>}
            </Field>
          </dl>
          <div className="wms-progress" aria-hidden="true">
            <i style={{ transform: `scaleX(${o.pct / 100})` }} />
          </div>
          {props.children}
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
                    Ord
                  </th>
                  <th scope="col" className="num">
                    Pick
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l) => (
                  <LineRow key={l.no} line={l} selected={props.selectedLine === l.no} onSelect={props.onSelectLine} />
                ))}
              </tbody>
            </table>
          </div>
          {chosen !== undefined && props.lineActions?.(chosen)}
          <h4 className="wms-subhead">Activity</h4>
          {props.events.length > 0 && <EventLines events={props.events} tickMs={tickMs} />}
          <p className="wms-note">The log keeps the latest 200 events of the whole WMS; older ones for this order have scrolled out.</p>
        </div>
      )}
    </div>
  );
}
