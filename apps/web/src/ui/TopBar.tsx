import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import { formatCash, short } from './format.ts';
import type { WarehouseStore } from './store.ts';

/** The dashboard's tiles: what each shows, from the latest view. */
const TILES = [
  { id: 'shipped', label: 'Shipped', value: (v: WarehouseView): string => short(v.run.orders) },
  { id: 'rate', label: 'Per min', value: (v: WarehouseView): string => short((v.ordersPerSec * 60) / 1000) },
  { id: 'backlog', label: 'Backlog', value: (v: WarehouseView): string => short(v.picking.backlog / 1000) },
  { id: 'stock', label: 'Stock', value: (v: WarehouseView): string => `${v.receiving.shelfCap === 0 ? 0 : Math.floor((v.receiving.stock / v.receiving.shelfCap) * 100)}%` },
] as const;

/** Which tile turns orange for each bottleneck (RULES 8). */
const WARN: Partial<Record<WarehouseView['bottleneck']['kind'], (typeof TILES)[number]['id']>> = { picking: 'backlog', stock: 'stock', orders: 'rate', timer: 'rate' };

/**
 * Cash and income per second at the top, and under them the dashboard: orders
 * shipped from this warehouse, orders a minute at today's levels, the backlog
 * and how full the shelves are (all written every tick, P7); the site, the
 * stars owned (a tap opens the stars sheet, RULES 10a), and settings.
 */
export function TopBar(props: { view: WarehouseView; store: WarehouseStore; onSettings: () => void; onStars: () => void }): ReactElement {
  const { view, store, onSettings, onStars } = props;
  const cash = useRef<HTMLSpanElement>(null);
  const tiles = useRef<HTMLDListElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const el = cash.current;
        if (el === null) return;
        el.textContent = formatCash(update.view.cash);
        const warn = WARN[update.view.bottleneck.kind];
        for (const tile of TILES) {
          const box = tiles.current?.querySelector<HTMLElement>(`[data-tile="${tile.id}"]`);
          if (box === null || box === undefined) continue;
          const dd = box.lastElementChild;
          if (dd !== null) dd.textContent = tile.value(update.view);
          box.classList.toggle('warn', warn === tile.id);
        }
        // A little bump when pays come in; skipped while one is still running.
        if (update.events.some((e) => e.type === 'departed') && el.getAnimations?.().length === 0) {
          el.animate?.([{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
        }
      }),
    [store],
  );
  return (
    <header className="top">
      <div className="top-row">
        <span className="site" data-testid="site">
          {view.site.name}
        </span>
        <span className="top-buttons">
          <button
            type="button"
            className={`stars-btn${view.stars.perks.some((p) => p.unlocksOnSale) ? ' soon' : ''}`}
            aria-label={`${view.stars.owned} ${view.stars.owned === 1 ? 'star' : 'stars'}: perks`}
            onClick={onStars}
            data-testid="open-stars"
          >
            ★ {view.stars.owned}
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings} data-testid="settings">
            ⚙
          </button>
        </span>
      </div>
      <div className="money">
        <span ref={cash} className="cash" data-testid="cash" />
        {view.boostedIncomePerSec > view.incomePerSec ? (
          <span className="income income-boosted" data-testid="income" title={`${formatCash(view.incomePerSec)}/s without boosts`}>
            +{formatCash(view.boostedIncomePerSec)}/s ⚡
          </span>
        ) : (
          <span className="income" data-testid="income">
            +{formatCash(view.incomePerSec)}/s
          </span>
        )}
      </div>
      <dl ref={tiles} className="kpis" data-testid="dashboard">
        {TILES.map((t) => (
          <div key={t.id} className="kpi" data-tile={t.id} data-testid={`kpi-${t.id}`}>
            <dt>{t.label}</dt>
            <dd />
          </div>
        ))}
      </dl>
    </header>
  );
}
