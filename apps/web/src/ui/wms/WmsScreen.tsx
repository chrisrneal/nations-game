import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { WmsAction, WmsActionName, WmsEventView, WmsPolicy, WmsTaskView } from '@warehouse/contracts';
import type { WarehouseHost } from '../../platform/index.ts';
import { formatCash, type ClockShape } from '../format.ts';
import type { WarehouseStore } from '../store.ts';
import { ActivityFeed } from './ActivityFeed.tsx';
import { CrewList, WorkerDetail } from './Crew.tsx';
import { Countries } from './Countries.tsx';
import { LineActions, OrderActions, ReleaseBar } from './Actions.tsx';
import { FILTERS, PAGES, countdown, filterCounts, matches, nextSort, sortOrders, type Sort, type SortKey, type WmsFilter, type WmsPage } from './grid.ts';
import { InboundGrid, PoDetail } from './Inbound.tsx';
import { InventoryGrid } from './Inventory.tsx';
import { KpiStrip, crewKpis, floorKpis, inboundKpis, inventoryKpis, outboundKpis } from './KpiStrip.tsx';
import { OrderDetail } from './OrderDetail.tsx';
import { OrderGrid, type GridScroll } from './OrderGrid.tsx';
import { NeedsPanel } from './Labour.tsx';
import { PICK_RULES, Plan, RELEASE_MODES, waveName } from './Plan.tsx';
import { WmsFloor } from './WmsFloor.tsx';
import { useWms } from './useWms.ts';
import './wms.css';

/** What an empty grid says, by filter (slice 9). */
const EMPTY: Readonly<Record<WmsFilter, string>> = {
  all: 'No orders yet. The first arrive within half a warehouse hour.',
  open: 'Nothing open: every order has shipped.',
  picking: 'No order is being picked right now.',
  exceptions: 'No exceptions. Everything is flowing.',
  shipped: 'Nothing shipped yet.',
};

const DONE: Readonly<Record<WmsActionName, string>> = {
  release: 'Wave released',
  priority: 'Priority changed',
  hold: 'On hold',
  unhold: 'Hold released',
  assign: 'Picker assigned',
  cancelLine: 'Line cancelled',
  expedite: 'Expedited',
  policy: 'Plan changed',
  hire: 'Hired',
  door: 'Dock door opened',
  role: 'Worker moved',
};

/** What the "Wave in" KPI says: the countdown under timed waves, else how orders are released (W7). */
function waveText(policy: WmsPolicy, nextWaveIn: number, time: ClockShape): string {
  return policy.release === 'waves' ? countdown(nextWaveIn, time) : policy.release === 'continuous' ? 'Live' : 'Manual';
}

/** The plan in a line, for the floor (W7, W9). */
function planLine(policy: WmsPolicy, crew: number, time: ClockShape): string {
  const pick = PICK_RULES.find((r) => r.id === policy.pick)?.name ?? '';
  const release = RELEASE_MODES.find((r) => r.id === policy.release)?.name ?? '';
  const every = policy.release === 'waves' ? ` ${waveName(policy.waveTicks, time)}` : '';
  return `${pick} · ${release}${every} · ${policy.pickers} pick / ${crew - policy.pickers} receive${policy.labor === 'balance' ? ' · balance' : ''}`;
}

/**
 * The warehouse management system (docs/wms-plan.md), the whole game since
 * W8: the live floor the WMS runs (Floor), purchase orders and the dock
 * schedule (In), customer orders and their countries (Out), every SKU's bin
 * (Stock), the crew and their tasks (Crew), and the operating plan the player
 * sets, with hiring and dock doors (Plan). The page never scrolls sideways;
 * only the grids do. The tabs are under the thumb. Actions are commands sent
 * through the host; the sim decides, and the answer shows as a short note.
 * `top` is the clock and money bar (App).
 */
export function WmsScreen(props: { store: WarehouseStore; host: WarehouseHost; top?: ReactNode }): ReactElement {
  const { store, host } = props;
  const live = useWms(store);
  const [filter, setFilter] = useState<WmsFilter>('all');
  const [sort, setSort] = useState<Sort | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [feed, setFeed] = useState(false);
  const [page, setPage] = useState<WmsPage>('floor');
  const [countries, setCountries] = useState(false);
  const [openPo, setOpenPo] = useState<number | null>(null);
  const [worker, setWorker] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set());
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  // One object for the screen's life: the grid writes its scroll into it when it unmounts and reads it back when it returns.
  const [scroll] = useState<GridScroll>(() => ({ top: 0, left: 0 }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (feed) setFeed(false);
      else if (page === 'crew' && worker !== null) setWorker(null);
      else if (page === 'inbound' && openPo !== null) setOpenPo(null);
      else if (page === 'outbound' && open !== null) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openPo, page, feed, worker]);
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
      // Only NEW orders count: `marked` keeps the chosen ones that are still NEW, so the handler needs no orders and rows keep their memo.
      setChosen((c) => {
        const next = new Set(c);
        if (!next.delete(no)) next.add(no);
        return next;
      });
    },
    [choosing],
  );
  const openOrder = useCallback((no: number) => {
    setPage('outbound');
    setCountries(false);
    setChoosing(false);
    setOpen(no);
    setLine(null);
  }, []);
  const openPurchase = useCallback((no: number) => {
    setPage('inbound');
    setOpenPo(no);
  }, []);
  const openWorker = useCallback((id: number) => {
    setPage('crew');
    setWorker(id);
  }, []);
  const openTask = useCallback(
    (t: WmsTaskView) => {
      if (t.order > 0) openOrder(t.order);
      else if (t.po > 0) openPurchase(t.po);
    },
    [openOrder, openPurchase],
  );
  const openFromFeed = useCallback((e: WmsEventView) => {
    if (e.order === 0 && e.po === 0 && e.worker > 0) {
      setPage('crew');
      setWorker(e.worker);
    } else if (e.po > 0) {
      setPage('inbound');
      setOpenPo(e.po);
    } else {
      setPage('outbound');
      setCountries(false);
      setOpen(e.order);
      setLine(null);
    }
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
  const wave = live === null ? '' : waveText(live.wms.policy, live.wms.nextWaveIn, live.time);
  const kpis =
    live === null
      ? []
      : page === 'inbound'
        ? inboundKpis(live.wms.inboundKpis)
        : page === 'inventory'
          ? inventoryKpis(live.wms.inventoryKpis)
          : page === 'outbound'
            ? outboundKpis(live.wms.kpis, wave)
            : page === 'crew'
              ? crewKpis(live.wms.crewKpis)
              : floorKpis(live.wms.kpis, live.wms.inboundKpis, wave);

  return (
    <div className={`wms${props.top === undefined ? '' : ' wms-home'}`} aria-label="Warehouse management system" data-testid="wms">
      {props.top}
      {live !== null && <KpiStrip items={kpis} />}
      {live === null ? (
        <p className="wms-empty">Connecting…</p>
      ) : (
        <>
          {page === 'floor' ? (
            <>
              <button type="button" className="wms-plan-chip" onClick={() => setPage('plan')} data-testid="wms-plan-chip">
                <span className="muted">Plan</span> {planLine(live.wms.policy, live.wms.crew, live.time)} <span aria-hidden="true">›</span>
              </button>
              <WmsFloor store={store} onWorker={openWorker} onOrder={openOrder} onPo={openPurchase} />
            </>
          ) : page === 'plan' ? (
            <Plan
              policy={live.wms.policy}
              crew={live.wms.crew}
              doors={live.wms.layout.doors}
              growth={live.wms.growth}
              cash={live.cash}
              needs={live.wms.needs}
              waveChoices={live.wms.waveChoices}
              newOrders={newOrders}
              time={live.time}
              submit={submit}
            />
          ) : page === 'crew' ? (
            worker !== null ? (
              <WorkerDetail
                worker={live.wms.workers.find((p) => p.id === worker)}
                time={live.time}
                sameRole={live.wms.workers.filter((p) => p.role === live.wms.workers.find((q) => q.id === worker)?.role).length}
                onBack={() => setWorker(null)}
                onTask={openTask}
                submit={submit}
              />
            ) : (
              <CrewList workers={live.wms.workers} onOpen={setWorker}>
                <NeedsPanel needs={live.wms.needs} labor={live.wms.policy.labor} time={live.time} submit={submit} />
              </CrewList>
            )
          ) : page === 'inbound' ? (
            openPo !== null ? (
              <PoDetail po={live.wms.pos.find((p) => p.no === openPo)} events={live.wms.events.filter((e) => e.po === openPo)} tick={live.tick} time={live.time} onBack={() => setOpenPo(null)} />
            ) : (
              <InboundGrid pos={live.wms.pos} schedule={live.wms.schedule} time={live.time} day={live.day} onOpen={setOpenPo} />
            )
          ) : page === 'inventory' ? (
            <InventoryGrid stock={live.wms.stock} time={live.time} />
          ) : open !== null ? (
            <OrderDetail
              order={detail}
              events={live.wms.events.filter((e) => e.order === open)}
              tick={live.tick}
              time={live.time}
              goodwill={live.wms.countries.find((c) => c.iso === detail?.dest.iso)?.goodwill ?? null}
              onBack={() => setOpen(null)}
              selectedLine={line}
              onSelectLine={(no) => setLine((l) => (l === no ? null : no))}
              lineActions={(l) => (detail === undefined ? null : <LineActions key={`${detail.no}/${l.no}`} order={detail} line={l} pickers={live.wms.workers.filter((p) => p.role === 'pick')} submit={submit} />)}
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
                    setCountries(false);
                  }}
                  data-testid="wms-choose"
                >
                  Release…
                </button>
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={!countries && filter === f.id}
                    className="wms-filter"
                    onClick={() => {
                      setFilter(f.id);
                      setCountries(false);
                    }}
                    data-testid={`wms-filter-${f.id}`}
                  >
                    {f.label} <span className="num">{counts[f.id]}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={countries}
                  className="wms-filter"
                  onClick={() => {
                    setCountries(true);
                    setChoosing(false);
                    setChosen(new Set());
                  }}
                  data-testid="wms-countries-tab"
                >
                  Countries
                </button>
              </div>
              {countries ? (
                <Countries countries={live.wms.countries} />
              ) : (
                <OrderGrid orders={shown} time={live.time} sort={sort} selected={marked} scroll={scroll} onSort={onSort} onOpen={onOpen} empty={EMPTY[filter]} />
              )}
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
          <ActivityFeed events={live.wms.events} time={live.time} open={feed} onToggle={() => setFeed((f) => !f)} onOpen={openFromFeed} />
        </>
      )}
      <nav className="wms-nav" aria-label="WMS pages">
        <div className="wms-tabs" role="tablist">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={page === p.id}
              onClick={() => {
                // A second tap on the page you are on goes back to its list.
                if (p.id === page) {
                  setOpen(null);
                  setOpenPo(null);
                  setWorker(null);
                }
                setPage(p.id);
              }}
              data-testid={`wms-tab-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </nav>
      {note !== null && (
        <div className={`wms-note-toast${note.bad ? ' bad' : ''}`} role="status">
          {note.text}
        </div>
      )}
    </div>
  );
}
