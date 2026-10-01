import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { AirportView } from '@nations/contracts';
import { formatCash } from './format.ts';
import type { AirportStore } from './store.ts';

/** Cash and income per second at the top (written every tick, P7), the city, and settings. */
export function TopBar(props: { view: AirportView; store: AirportStore; onSettings: () => void }): ReactElement {
  const { view, store, onSettings } = props;
  const cash = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const el = cash.current;
        if (el === null) return;
        el.textContent = formatCash(update.view.cash);
        // A little bump when fares come in; skipped while one is still running.
        if (update.events.some((e) => e.type === 'departed') && el.getAnimations?.().length === 0) {
          el.animate?.([{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
        }
      }),
    [store],
  );
  return (
    <header className="top">
      <div className="top-row">
        <span className="city" data-testid="city">
          {view.city.name}
          {view.slots.owned > 0 && <span className="slots"> · {view.slots.owned} slots</span>}
        </span>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings} data-testid="settings">
          ⚙
        </button>
      </div>
      <div className="money">
        <span ref={cash} className="cash" data-testid="cash" />
        <span className="income" data-testid="income">
          +{formatCash(view.incomePerSec)}/s
        </span>
      </div>
    </header>
  );
}
