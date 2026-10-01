import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { AirportView } from '@nations/contracts';
import { formatCash, formatDuration } from './format.ts';
import { nextGoal, secondsUntil } from './goal.ts';
import type { AirportStore } from './store.ts';

/**
 * The thumb zone: what the airport is waiting for, the next goal with a
 * countdown, and the Upgrades button (primary actions in the bottom third).
 */
export function BottomBar(props: { view: AirportView; store: AirportStore; onUpgrades: () => void }): ReactElement {
  const { view, store, onUpgrades } = props;
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
      </p>
      {goal !== null && goal.cost !== null && (
        <p className="goal" data-testid="goal">
          Next: {goal.nextName ?? goal.name} · {formatCash(goal.cost)} <span ref={eta} className="muted" />
        </p>
      )}
      <button type="button" className="btn btn-primary btn-wide" onClick={onUpgrades} data-testid="open-upgrades">
        Upgrades
        {affordable > 0 && (
          <span className="count" aria-label={`${affordable} affordable`}>
            {affordable}
          </span>
        )}
      </button>
    </footer>
  );
}
