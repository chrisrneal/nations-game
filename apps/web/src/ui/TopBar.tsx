import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import { formatCash } from './format.ts';
import type { WarehouseStore } from './store.ts';

/** Cash and income per second at the top (written every tick, P7), the site, and settings. */
export function TopBar(props: { view: WarehouseView; store: WarehouseStore; onSettings: () => void }): ReactElement {
  const { view, store, onSettings } = props;
  const cash = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const el = cash.current;
        if (el === null) return;
        el.textContent = formatCash(update.view.cash);
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
          {view.stars.owned > 0 && <span className="stars"> · {view.stars.owned} stars</span>}
        </span>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings} data-testid="settings">
          ⚙
        </button>
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
    </header>
  );
}
