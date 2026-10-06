import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import { formatCash } from './format.ts';
import { Sheet } from './Sheet.tsx';
import type { WarehouseStore } from './store.ts';

const pct = (bp: number): string => `+${Math.round((bp - 10_000) / 100)}%`;

/**
 * Selling the warehouse (RULES 10): what it is worth in stars, what stars do,
 * the perks the sale unlocks (RULES 10a), where you go next and its twist, and
 * what resets. One confirm.
 */
export function SellSheet(props: { view: WarehouseView; store: WarehouseStore; onSell: () => void; onClose: () => void }): ReactElement {
  const { view, store, onSell, onClose } = props;
  const { stars } = view;
  const progress = useRef<HTMLElement>(null);
  const earned = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const e = update.view.run.earned;
        if (progress.current) progress.current.style.transform = `scaleX(${Math.min(1, e / stars.nextAt)})`;
        if (earned.current) earned.current.textContent = formatCash(e);
      }),
    [store, stars.nextAt],
  );
  const worth = stars.claimable;
  const perks = stars.perks.filter((p) => p.unlocksOnSale);
  return (
    <Sheet title="Sell the warehouse" onClose={onClose}>
      <p className="sell-worth" data-testid="sell-worth">
        {worth === 0 ? 'Not worth a star yet' : `Worth ${worth} ${worth === 1 ? 'star' : 'stars'}`}
      </p>
      <p className="sheet-note">
        This warehouse has earned <span ref={earned} />. {worth === 0 ? 'The first star' : 'One more star'} at {formatCash(stars.nextAt)}.
      </p>
      <span className="bar bar-stars" aria-hidden="true">
        <i ref={progress} />
      </span>
      <dl className="sell-facts">
        <div>
          <dt>Pay per order, forever</dt>
          <dd>
            {pct(stars.bonusBp)} → <strong>{pct(stars.bonusAfterBp)}</strong>
          </dd>
        </div>
        <div>
          <dt>Next site</dt>
          <dd data-testid="next-site">{stars.nextSite.name}</dd>
        </div>
      </dl>
      {perks.length > 0 && (
        <p className="sell-perks" data-testid="sell-perks">
          New {perks.length === 1 ? 'perk' : 'perks'}: {perks.map((p) => `${p.name} (${p.effect.charAt(0).toLowerCase()}${p.effect.slice(1)})`).join(', ')}
        </p>
      )}
      <p className="twist">{stars.nextSite.twist}</p>
      <p className="sheet-note">Cash, upgrades and docks start again. Stars and lifetime numbers stay.</p>
      <button type="button" className="btn btn-primary btn-wide" disabled={worth === 0} onClick={onSell} data-testid="confirm-sell">
        {worth === 0 ? 'Keep building' : `Sell and move to ${stars.nextSite.name}`}
      </button>
    </Sheet>
  );
}
