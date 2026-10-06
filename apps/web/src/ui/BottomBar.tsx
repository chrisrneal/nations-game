import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView, BoostId } from '@warehouse/contracts';
import { BoostBar } from './BoostBar.tsx';
import { formatCash, formatDuration } from './format.ts';
import { nextGoal, secondsUntil } from './goal.ts';
import type { WarehouseStore } from './store.ts';

/**
 * The thumb zone: what the warehouse is staged for, the next goal with a
 * countdown, the boosts, and the Upgrades button (primary actions in the
 * bottom third).
 */
export function BottomBar(props: { view: WarehouseView; store: WarehouseStore; onUpgrades: () => void; onSell: () => void; onBoost: (id: BoostId) => void }): ReactElement {
  const { view, store, onUpgrades, onSell, onBoost } = props;
  const eta = useRef<HTMLSpanElement>(null);
  const goal = nextGoal(view);
  const affordable = view.upgrades.filter((u) => u.affordable).length;
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        if (eta.current === null || goal === null || goal.cost === null) return;
        const s = secondsUntil(goal.cost, update.view.cash, update.view.incomePerSec);
        eta.current.textContent = s === null ? '' : s === 0 ? 'ready' : `in ${formatDuration(s)}`;
      }),
    [store, goal],
  );
  return (
    <footer className="bottom">
      <p className="hint" data-testid="bottleneck">
        {view.bottleneck.text}
        {view.bottleneck.kind === 'picking' && <span className="muted"> Tap the line for a lane.</span>}
      </p>
      {goal !== null && goal.cost !== null && (
        <p className="goal" data-testid="goal">
          Next: {goal.nextName ?? goal.name} · {formatCash(goal.cost)} <span ref={eta} className="muted" />
        </p>
      )}
      <BoostBar boosts={view.boosts} tickMs={view.tickMs} store={store} onBoost={onBoost} />
      <div className="actions">
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
    </footer>
  );
}
