import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { AirportView } from '@nations/contracts';
import { formatCash } from './format.ts';
import { Sheet } from './Sheet.tsx';
import type { AirportStore } from './store.ts';

const pct = (bp: number): string => `+${Math.round((bp - 10_000) / 100)}%`;

/**
 * Selling the airport (RULES 10): what it is worth in slots, what slots do,
 * where you go next and its twist, and what resets. One confirm.
 */
export function SellSheet(props: { view: AirportView; store: AirportStore; onSell: () => void; onClose: () => void }): ReactElement {
  const { view, store, onSell, onClose } = props;
  const { slots } = view;
  const progress = useRef<HTMLElement>(null);
  const earned = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const e = update.view.run.earned;
        if (progress.current) progress.current.style.transform = `scaleX(${Math.min(1, e / slots.nextAt)})`;
        if (earned.current) earned.current.textContent = formatCash(e);
      }),
    [store, slots.nextAt],
  );
  const worth = slots.claimable;
  return (
    <Sheet title="Sell the airport" onClose={onClose}>
      <p className="sell-worth" data-testid="sell-worth">
        {worth === 0 ? 'Not worth a slot yet' : `Worth ${worth} ${worth === 1 ? 'slot' : 'slots'}`}
      </p>
      <p className="sheet-note">
        This airport has earned <span ref={earned} />. {worth === 0 ? 'The first slot' : 'One more slot'} at {formatCash(slots.nextAt)}.
      </p>
      <span className="bar bar-slots" aria-hidden="true">
        <i ref={progress} />
      </span>
      <dl className="sell-facts">
        <div>
          <dt>Every fare, forever</dt>
          <dd>
            {pct(slots.bonusBp)} → <strong>{pct(slots.bonusAfterBp)}</strong>
          </dd>
        </div>
        <div>
          <dt>Next city</dt>
          <dd data-testid="next-city">{slots.nextCity.name}</dd>
        </div>
      </dl>
      <p className="twist">{slots.nextCity.twist}</p>
      <p className="sheet-note">Cash, upgrades and gates start again. Slots and lifetime numbers stay.</p>
      <button type="button" className="btn btn-primary btn-wide" disabled={worth === 0} onClick={onSell} data-testid="confirm-sell">
        {worth === 0 ? 'Keep building' : `Sell and fly to ${slots.nextCity.name}`}
      </button>
    </Sheet>
  );
}
