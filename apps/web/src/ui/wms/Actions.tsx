import { useState, type ReactElement } from 'react';
import type { WmsAction, WmsLineView, WmsOrderView, WmsPriority, WmsWorkerView } from '@warehouse/contracts';
import { formatCash } from '../format.ts';

type Submit = (action: WmsAction) => void;

const PRIORITIES: readonly WmsPriority[] = [1, 2, 3];

/** An order's actions (slice 7): priority, hold, expedite. Every one is a command; the sim decides. */
export function OrderActions(props: { order: WmsOrderView; cash: number; expediteCost: number; submit: Submit }): ReactElement | null {
  const { order: o, submit } = props;
  if (!o.open) return null;
  const held = o.status === 'ON HOLD';
  const canExpedite = !o.expedited && !o.late && props.cash >= props.expediteCost;
  return (
    <div className="wms-actions" data-testid="wms-order-actions">
      <div className="wms-seg" role="group" aria-label="Priority">
        {PRIORITIES.map((p) => (
          <button key={p} type="button" aria-pressed={o.priority === p} className={`pri-${p}`} onClick={() => submit({ action: 'priority', order: o.no, priority: p })}>
            P{p}
          </button>
        ))}
      </div>
      <button type="button" className={`wms-btn${held ? ' wms-btn-on' : ''}`} onClick={() => submit({ action: held ? 'unhold' : 'hold', order: o.no })} data-testid="wms-hold">
        {held ? 'Release hold' : 'Hold'}
      </button>
      <button type="button" className="wms-btn wms-btn-gold" disabled={!canExpedite} onClick={() => submit({ action: 'expedite', order: o.no })} data-testid="wms-expedite">
        {o.expedited ? 'Expedited' : `Expedite ${formatCash(props.expediteCost)}`}
      </button>
    </div>
  );
}

/** What a picker is on now, and how many tasks it has lined up after it (W8). */
function pickerLabel(p: WmsWorkerView): string {
  const now = p.task === null ? 'idle' : p.task.ref;
  return p.queue.length > 0 ? `${now} +${p.queue.length}` : now;
}

/** A line's actions (slice 7): put a picker on it now (it drops what it is on and its queue), or cancel it (a second tap confirms). */
export function LineActions(props: { order: WmsOrderView; line: WmsLineView; pickers: readonly WmsWorkerView[]; submit: Submit }): ReactElement {
  const { order: o, line: l, submit } = props;
  const [confirm, setConfirm] = useState(false);
  const assignable = (o.status === 'ALLOCATED' || o.status === 'PICKING') && (l.status === 'ALLOCATED' || l.status === 'PICKING');
  const cancellable =
    ['NEW', 'RELEASED', 'ALLOCATED', 'PICKING', 'BACKORDER', 'ON HOLD'].includes(o.status) &&
    (l.status === 'OPEN' || l.status === 'ALLOCATED' || l.status === 'PICKING' || (l.status === 'SHORT' && l.picked === 0));
  return (
    <div className="wms-line-actions" data-testid="wms-line-actions">
      <p className="wms-line-head">
        L{l.no} {l.sku} · {l.bin}
      </p>
      {assignable ? (
        <div className="wms-pickers" role="group" aria-label="Put a picker on this line">
          {props.pickers.map((p) => (
            <button key={p.id} type="button" className="wms-picker" aria-pressed={l.picker === p.id} onClick={() => submit({ action: 'assign', picker: p.id, order: o.no, line: l.no })}>
              <b>{p.name}</b>
              <span>{pickerLabel(p)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="wms-note">Pickers can be put on allocated lines only.</p>
      )}
      <button
        type="button"
        className={`wms-btn${confirm ? ' wms-btn-danger' : ''}`}
        disabled={!cancellable}
        onClick={() => {
          if (!confirm) setConfirm(true);
          else submit({ action: 'cancelLine', order: o.no, line: l.no });
        }}
        data-testid="wms-cancel-line"
      >
        {confirm ? `Confirm: cancel L${l.no}` : 'Cancel line'}
      </button>
    </div>
  );
}

/** The release bar (slice 7): under the grid while NEW orders are being chosen for a wave. */
export function ReleaseBar(props: { chosen: number; newOrders: number; onAll: () => void; onRelease: () => void; onDone: () => void }): ReactElement {
  return (
    <div className="wms-release" data-testid="wms-release-bar">
      <button type="button" className="wms-btn" onClick={props.onDone}>
        Done
      </button>
      <button type="button" className="wms-btn" onClick={props.onAll} disabled={props.newOrders === 0}>
        All NEW ({props.newOrders})
      </button>
      <button type="button" className="wms-btn wms-btn-primary" onClick={props.onRelease} disabled={props.chosen === 0} data-testid="wms-release">
        Release {props.chosen}
      </button>
    </div>
  );
}
