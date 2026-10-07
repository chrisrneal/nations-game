import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { WarehouseStore } from '../store.ts';
import { FILTERS, countdown, filterCounts, matches, nextSort, sortOrders, type Sort, type SortKey, type WmsFilter } from './grid.ts';
import { ActivityFeed } from './ActivityFeed.tsx';
import { KpiStrip } from './KpiStrip.tsx';
import { OrderDetail } from './OrderDetail.tsx';
import { OrderGrid, type GridScroll } from './OrderGrid.tsx';
import { useWms } from './useWms.ts';
import './wms.css';

/**
 * The warehouse management system (docs/wms-plan.md): a full-screen,
 * terminal-style view of the WMS orders over the warehouse. The page never
 * scrolls sideways; only the grid does.
 */
export function WmsScreen(props: { store: WarehouseStore; onClose: () => void }): ReactElement {
  const { store, onClose } = props;
  const live = useWms(store);
  const [filter, setFilter] = useState<WmsFilter>('all');
  const [sort, setSort] = useState<Sort | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [feed, setFeed] = useState(false);
  // One object for the screen's life: the grid writes its scroll into it when it unmounts and reads it back when it returns.
  const [scroll] = useState<GridScroll>(() => ({ top: 0, left: 0 }));
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (feed) setFeed(false);
      else if (open !== null) setOpen(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open, feed]);
  const onSort = useCallback((key: SortKey) => setSort((s) => nextSort(s, key)), []);
  const onOpen = useCallback((no: number) => setOpen(no), []);
  const openFromFeed = useCallback((no: number) => {
    setOpen(no);
    setFeed(false);
  }, []);
  const selected = useMemo(() => new Set(open === null ? [] : [open]), [open]);
  const orders = live?.wms.orders;
  const counts = useMemo(() => filterCounts(orders ?? []), [orders]);
  const shown = useMemo(
    () =>
      sortOrders(
        (orders ?? []).filter((o) => matches(o, filter)),
        sort,
      ),
    [orders, filter, sort],
  );

  return (
    <div className="wms" role="dialog" aria-modal="true" aria-label="Warehouse management system" data-testid="wms">
      <header className="wms-head">
        <button type="button" className="wms-back" onClick={onClose} aria-label="Back to the floor" data-testid="wms-close">
          ‹ Floor
        </button>
        <h2 className="wms-title">WMS · Orders</h2>
        {live !== null && (
          <span className="wms-wave" data-testid="wms-next-wave">
            Wave in {countdown(live.wms.nextWaveIn, live.tickMs)}
          </span>
        )}
      </header>
      {live !== null && <KpiStrip kpis={live.wms.kpis} />}
      {live === null ? (
        <p className="wms-empty">Connecting…</p>
      ) : (
        <>
          {open !== null ? (
            <OrderDetail order={orders?.find((o) => o.no === open)} events={live.wms.events.filter((e) => e.order === open)} tick={live.tick} tickMs={live.tickMs} onBack={() => setOpen(null)} />
          ) : (
            <>
              <div className="wms-filters" role="tablist" aria-label="Filter orders">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="wms-filter" onClick={() => setFilter(f.id)} data-testid={`wms-filter-${f.id}`}>
                    {f.label} <span className="num">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <OrderGrid orders={shown} tickMs={live.tickMs} sort={sort} selected={selected} scroll={scroll} onSort={onSort} onOpen={onOpen} />
            </>
          )}
          <ActivityFeed events={live.wms.events} tickMs={live.tickMs} open={feed} onToggle={() => setFeed((f) => !f)} onOpen={openFromFeed} />
        </>
      )}
    </div>
  );
}
