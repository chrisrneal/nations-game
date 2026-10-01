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
        if (cash.current) cash.current.textContent = formatCash(update.view.cash);
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
