import type { ReactElement } from 'react';
import type { WmsOrderView, WmsShipDoorView } from '@warehouse/contracts';
import { clock, countdown } from './grid.ts';
import type { ClockShape } from '../format.ts';

/**
 * The outbound doors (decision record W10): each door's trailer, when it
 * leaves, how full it is, the orders loaded on it and the ones staged in its
 * lane waiting for a dock hand. A trailer leaves on time with whatever is
 * loaded; an order not loaded by then goes with the next. Tap an order to
 * open it.
 */
export function Trucks(props: { doors: readonly WmsShipDoorView[]; orders: readonly WmsOrderView[]; time: ClockShape; onOpen: (no: number) => void }): ReactElement {
  const { doors, time, onOpen } = props;
  const code = new Map(props.orders.map((o) => [o.no, o]));
  const chips = (nos: readonly number[], loaded: boolean): ReactElement[] =>
    nos.map((no) => {
      const o = code.get(no);
      return (
        <button key={no} type="button" className={`truck-order pri-${o?.priority ?? 3}${o?.late === true ? ' late' : ''}${loaded ? ' loaded' : ''}`} onClick={() => onOpen(no)}>
          {o?.code ?? `O-${no}`}
        </button>
      );
    });
  return (
    <ol className="trucks" data-testid="wms-trucks">
      {doors.map((d) => (
        <li key={d.door} className="truck-door" data-testid={`truck-${d.door}`}>
          <div className="truck-head">
            <b className="truck-code">{d.code}</b>
            <span className="muted">{d.trailer}</span>
            <span className="truck-leaves num">
              leaves {clock(d.departs, time)} <span className="muted">({countdown(d.departsIn, time)})</span>
            </span>
          </div>
          <div className="truck-fill" aria-hidden="true">
            <i style={{ transform: `scaleX(${d.pct / 100})` }} className={d.pct >= 90 ? 'full' : undefined} />
          </div>
          <p className="truck-nums">
            <span className="num">
              {d.loadedUnits}/{d.capacity}
            </span>{' '}
            units loaded · <span className="num">{d.loaded.length}</span> {d.loaded.length === 1 ? 'order' : 'orders'} on board · <span className="num">{d.staged.length}</span> staged
            {d.loaders > 0 && (
              <>
                {' '}
                · <span className="num">{d.loaders}</span> loading
              </>
            )}
          </p>
          {d.loaded.length + d.staged.length > 0 && (
            <div className="truck-orders">
              {chips(d.loaded, true)}
              {chips(d.staged, false)}
            </div>
          )}
        </li>
      ))}
      <li className="wms-note truck-note">
        Packed orders are staged at the door whose trailer will take them soonest; the dock crew load them, and each trailer leaves on its time with what is on it. Solid chips are on board, outlined ones wait in the lane. More doors (Plan › Grow) mean
        more trailers an hour and more room for a big wave.
      </li>
    </ol>
  );
}
