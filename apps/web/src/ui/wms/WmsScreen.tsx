import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { WmsAction, WmsActionName } from '@warehouse/contracts';
import type { WarehouseHost } from '../../platform/index.ts';
import { formatCash } from '../format.ts';
import type { WarehouseStore } from '../store.ts';
import { ActivityFeed } from './ActivityFeed.tsx';
import { Countries } from './Countries.tsx';
import { LineActions, OrderActions, ReleaseBar } from './Actions.tsx';
import { FILTERS, countdown, filterCounts, matches, nextSort, sortOrders, type Sort, type SortKey, type WmsFilter } from './grid.ts';
import { KpiStrip } from './KpiStrip.tsx';
import { OrderDetail } from './OrderDetail.tsx';
import { OrderGrid, type GridScroll } from './OrderGrid.tsx';
import { useWms } from './useWms.ts';
import './wms.css';

const DONE: Readonly<Record<WmsActionName, string>> = {
  release: 'Wave released',
  priority: 'Priority changed',
  hold: 'On hold',
  unhold: 'Hold released',
  assign: 'Picker assigned',
  cancelLine: 'Line cancelled',
  expedite: 'Expedited',
};

/**
 * The warehouse management system (docs/wms-plan.md): a full-screen,
 * terminal-style view of the WMS orders over the warehouse. The page never
 * scrolls sideways; only the grid does. Actions (slice 7) are commands sent
 * through the host; the sim decides, and the answer shows as a short note.
 */
export function WmsScreen(props: { store: WarehouseStore; host: WarehouseHost; onClose: () => void }): ReactElement {
  const { store, host, onClose } = props;
  const live = useWms(store);
  const [filter, setFilter] = useState<WmsFilter>('all');
  const [sort, setSort] = useState<Sort | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [feed, setFeed] = useState(false);
  const [page, setPage] = useState<'orders' | 'countries'>('orders');
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set());
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
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
  useEffect(
    () =>
      store.onFrame((update) => {
        for (const e of update.events) {
          if (e.type === 'rejected' && e.payload.command === 'wms') setNote({ text: e.payload.reason, bad: true });
          if (e.type === 'wms') setNote({ text: `${DONE[e.payload.action]}${e.payload.cents > 0 ? ` · ${formatCash(e.payload.cents)}` : ''}`, bad: false });
        }
      }),
    [store],
  );
  useEffect(() => {
    if (note === null) return;
    const timer = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(timer);
  }, [note]);

  const submit = useCallback((action: WmsAction) => void host.submit({ type: 'wms', payload: action }), [host]);
  const onSort = useCallback((key: SortKey) => setSort((s) => nextSort(s, key)), []);
  const orders = live?.wms.orders;
  const onOpen = useCallback(
    (no: number) => {
      if (!choosing) {
        setOpen(no);
        setLine(null);
        return;
      }
      if (orders?.find((o) => o.no === no)?.status !== 'NEW') return;
      setChosen((c) => {
        const next = new Set(c);
        if (!next.delete(no)) next.add(no);
        return next;
      });
    },
    [choosing, orders],
  );
  const openFromFeed = useCallback((no: number) => {
    setPage('orders');
    setOpen(no);
    setLine(null);
    setFeed(false);
  }, []);
  const counts = useMemo(() => filterCounts(orders ?? []), [orders]);
  const shown = useMemo(
    () =>
      sortOrders(
        (orders ?? []).filter((o) => matches(o, filter)),
        sort,
      ),
    [orders, filter, sort],
  );
  const newOrders = useMemo(() => (orders ?? []).filter((o) => o.status === 'NEW').map((o) => o.no), [orders]);
  const marked = useMemo(() => (choosing ? new Set([...chosen].filter((no) => newOrders.includes(no))) : new Set(open === null ? [] : [open])), [choosing, chosen, newOrders, open]);
  const detail = open === null ? undefined : orders?.find((o) => o.no === open);

  return (
    <div className="wms" role="dialog" aria-modal="true" aria-label="Warehouse management system" data-testid="wms">
      <header className="wms-head">
        <button type="button" className="wms-back" onClick={onClose} aria-label="Back to the floor" data-testid="wms-close">
          ‹ Floor
        </button>
        <h2 className="wms-title">WMS</h2>
        <div className="wms-tabs" role="tablist" aria-label="WMS page">
          <button type="button" role="tab" aria-selected={page === 'orders'} onClick={() => setPage('orders')} data-testid="wms-tab-orders">
            Orders
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'countries'}
            onClick={() => {
              setPage('countries');
              setOpen(null);
            }}
            data-testid="wms-tab-countries"
          >
            Countries
          </button>
        </div>
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
          {page === 'countries' ? (
            <Countries countries={live.wms.countries} />
          ) : open !== null ? (
            <OrderDetail
              order={detail}
              events={live.wms.events.filter((e) => e.order === open)}
              tick={live.tick}
              tickMs={live.tickMs}
              goodwill={live.wms.countries.find((c) => c.iso === detail?.dest.iso)?.goodwill ?? null}
              onBack={() => setOpen(null)}
              selectedLine={line}
              onSelectLine={(no) => setLine((l) => (l === no ? null : no))}
              lineActions={(l) => (detail === undefined ? null : <LineActions key={`${detail.no}/${l.no}`} order={detail} line={l} pickers={live.wms.pickers} submit={submit} />)}
            >
              {detail !== undefined && <OrderActions order={detail} cash={live.cash} expediteCost={live.wms.expediteCost} submit={submit} />}
            </OrderDetail>
          ) : (
            <>
              <div className="wms-filters" role="tablist" aria-label="Filter orders">
                <button
                  type="button"
                  className={`wms-filter wms-choose${choosing ? ' on' : ''}`}
                  aria-pressed={choosing}
                  onClick={() => {
                    setChoosing((c) => !c);
                    setChosen(new Set());
                  }}
                  data-testid="wms-choose"
                >
                  Release…
                </button>
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="wms-filter" onClick={() => setFilter(f.id)} data-testid={`wms-filter-${f.id}`}>
                    {f.label} <span className="num">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <OrderGrid orders={shown} tickMs={live.tickMs} sort={sort} selected={marked} scroll={scroll} onSort={onSort} onOpen={onOpen} />
              {choosing && (
                <ReleaseBar
                  chosen={marked.size}
                  newOrders={newOrders.length}
                  onAll={() => setChosen(new Set(newOrders))}
                  onDone={() => {
                    setChoosing(false);
                    setChosen(new Set());
                  }}
                  onRelease={() => {
                    submit({ action: 'release', orders: [...marked] });
                    setChosen(new Set());
                    setChoosing(false);
                  }}
                />
              )}
            </>
          )}
          <ActivityFeed events={live.wms.events} tickMs={live.tickMs} open={feed} onToggle={() => setFeed((f) => !f)} onOpen={openFromFeed} />
        </>
      )}
      {note !== null && (
        <div className={`wms-note-toast${note.bad ? ' bad' : ''}`} role="status">
          {note.text}
        </div>
      )}
    </div>
  );
}
