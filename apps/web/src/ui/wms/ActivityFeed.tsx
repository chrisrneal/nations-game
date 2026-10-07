import type { ReactElement } from 'react';
import type { WmsEventView } from '@warehouse/contracts';
import { clock } from './grid.ts';
import { EventLines } from './OrderDetail.tsx';

/**
 * The activity feed (docs/wms-plan.md slice 5): a console docked at the bottom
 * of the WMS. Collapsed, it shows the latest event; open, the latest 200,
 * newest first, exceptions in red. Tapping an event opens its order, or its
 * purchase order on the inbound page (W6).
 */
export function ActivityFeed(props: { events: readonly WmsEventView[]; tickMs: number; open: boolean; onToggle: () => void; onOpen: (event: WmsEventView) => void }): ReactElement {
  const { events, tickMs, open } = props;
  const latest = events[0];
  const exceptions = events.filter((e) => e.exception).length;
  return (
    <section className={`wms-feed${open ? ' wms-feed-open' : ''}`} aria-label="Activity">
      <button type="button" className="wms-feed-toggle" aria-expanded={open} onClick={props.onToggle} data-testid="wms-feed-toggle">
        <span className="wms-feed-caret" aria-hidden="true">
          {open ? '▼' : '▲'}
        </span>
        <span className="wms-feed-label">Activity</span>
        {exceptions > 0 && <span className="wms-feed-exc">{exceptions}!</span>}
        {!open && latest !== undefined && (
          <span className={`wms-feed-latest${latest.exception ? ' exc' : ''}`}>
            {clock(latest.tick, tickMs)} {latest.code} {latest.ref}
          </span>
        )}
      </button>
      {open && (
        <div className="wms-feed-list" data-testid="wms-feed">
          {events.length === 0 ? <p className="wms-empty">No activity yet.</p> : <EventLines events={events} tickMs={tickMs} onOpen={props.onOpen} />}
        </div>
      )}
    </section>
  );
}
