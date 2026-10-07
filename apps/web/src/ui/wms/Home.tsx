import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import { formatCash } from '../format.ts';
import type { WarehouseStore } from '../store.ts';

/**
 * The money bar over the WMS home (W7): the stars (a tap opens the stars
 * sheet), the site, cash (written every tick, P7), income a second and
 * settings, in one row so the floor gets the height.
 */
export function HomeTop(props: { view: WarehouseView; store: WarehouseStore; onSettings: () => void; onStars: () => void }): ReactElement {
  const { view, store, onSettings, onStars } = props;
  const cash = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const el = cash.current;
        if (el === null) return;
        const text = formatCash(update.view.cash);
        if (el.textContent !== text) el.textContent = text;
        if (update.events.some((e) => e.type === 'departed' || e.type === 'wmsShipped') && el.getAnimations?.().length === 0) {
          el.animate?.([{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
        }
      }),
    [store],
  );
  const boosted = view.boostedIncomePerSec > view.incomePerSec;
  return (
    <div className="home-top">
      <button
        type="button"
        className={`stars-btn${view.stars.perks.some((p) => p.unlocksOnSale) ? ' soon' : ''}`}
        aria-label={`${view.stars.owned} ${view.stars.owned === 1 ? 'star' : 'stars'}: perks`}
        onClick={onStars}
        data-testid="open-stars"
      >
        ★ {view.stars.owned}
      </button>
      <span className="home-site" data-testid="site">
        {view.site.name}
      </span>
      <span className="home-money">
        <span ref={cash} className="home-cash" data-testid="cash" />
        <span className={`home-income${boosted ? ' income-boosted' : ''}`} data-testid="income">
          +{formatCash(boosted ? view.boostedIncomePerSec : view.incomePerSec)}/s{boosted ? ' ⚡' : ''}
        </span>
      </span>
      <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings} data-testid="settings">
        ⚙
      </button>
    </div>
  );
}

/**
 * The thumb zone of the WMS home (W7): the docks (the trucks and the idle
 * flow, where most of the money is still made), Upgrades, and Sell once the
 * warehouse is worth a star.
 */
export function HomeActions(props: { view: WarehouseView; onDocks: () => void; onUpgrades: () => void; onSell: () => void }): ReactElement {
  const { view, onDocks, onUpgrades, onSell } = props;
  const affordable = view.upgrades.filter((u) => u.affordable).length;
  const ready = view.boosts.filter((b) => b.ready && b.locked === null).length;
  return (
    <div className="home-actions">
      <button type="button" className="btn btn-wide" onClick={onDocks} data-testid="open-docks" aria-label={`Docks: ${view.docks.length} trucks loading, boosts and the idle floor`}>
        Docks
        {ready > 0 && (
          <span className="count" aria-label={`${ready} boosts ready`}>
            ⚡{ready}
          </span>
        )}
      </button>
      <button type="button" className="btn btn-primary btn-wide" onClick={onUpgrades} data-testid="open-upgrades">
        Upgrades
        {affordable > 0 && (
          <span className="count" aria-label={`${affordable} affordable`}>
            {affordable}
          </span>
        )}
      </button>
      {view.stars.claimable > 0 && (
        <button type="button" className="btn btn-wide btn-sell" onClick={onSell} data-testid="open-sell">
          Sell +{view.stars.claimable}
        </button>
      )}
    </div>
  );
}
