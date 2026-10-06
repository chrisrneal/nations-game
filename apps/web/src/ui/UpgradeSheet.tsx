import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { WarehouseView, UpgradeId, UpgradeView } from '@warehouse/contracts';
import { formatCash, formatEffect } from './format.ts';
import { Sheet } from './Sheet.tsx';
import type { WarehouseStore } from './store.ts';

/** One upgrade: what it does now and next, its catch, and the buy button that fills as cash comes in. */
function UpgradeRow(props: { upgrade: UpgradeView; fixes: boolean; store: WarehouseStore; onBuy: (id: UpgradeId) => void }): ReactElement {
  const { upgrade: u, fixes, store, onBuy } = props;
  const progress = useRef<HTMLElement>(null);
  const row = useRef<HTMLLIElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        if (update.events.some((e) => e.type === 'bought' && e.payload.upgrade === u.id)) {
          row.current?.animate?.([{ transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
        }
        if (progress.current === null || u.cost === null) return;
        progress.current.style.transform = `scaleX(${Math.min(1, update.view.cash / u.cost)})`;
      }),
    [store, u.cost, u.id],
  );
  const maxed = u.cost === null;
  return (
    <li ref={row} className={`upgrade${fixes ? ' fixes' : ''}`} data-testid={`upgrade-${u.id}`}>
      <div className="upgrade-main">
        <div className="upgrade-title">
          <span className="upgrade-name">{u.name}</span>
          <span className="muted">Lv {u.level}</span>
          {fixes && !maxed && <span className="badge badge-fix">Bottleneck</span>}
        </div>
        <div className="upgrade-effect">
          {formatEffect(u.unit, u.now)}
          {u.next !== null && <> → {formatEffect(u.unit, u.next)}</>}
          {u.nextName !== null && <span className="muted"> · {u.nextName}</span>}
        </div>
        <div className="upgrade-catch">{u.catch}</div>
      </div>
      <button
        type="button"
        className="buy"
        disabled={!u.affordable}
        onClick={() => onBuy(u.id)}
        aria-label={maxed ? `${u.name}: maxed out` : `Buy ${u.name} for ${formatCash(u.cost ?? 0)}`}
        data-testid={`buy-${u.id}`}
      >
        {!maxed && u.locked === null && <i ref={progress} className="buy-progress" aria-hidden="true" />}
        <span className="buy-label">{maxed ? 'Max' : u.locked !== null ? u.locked : formatCash(u.cost ?? 0)}</span>
      </button>
    </li>
  );
}

/** Every upgrade in a bottom sheet, under the thumb. Stays open while buying. */
export function UpgradeSheet(props: { view: WarehouseView; store: WarehouseStore; onBuy: (id: UpgradeId) => void; onSell: () => void; onClose: () => void }): ReactElement {
  const { view, store, onBuy, onSell, onClose } = props;
  return (
    <Sheet title="Upgrades" onClose={onClose}>
      <p className="sheet-note">{view.bottleneck.text}</p>
      <ul className="upgrades" data-testid="upgrades">
        {view.upgrades.map((u) => (
          <UpgradeRow key={u.id} upgrade={u} fixes={view.bottleneck.fix.includes(u.id)} store={store} onBuy={onBuy} />
        ))}
      </ul>
      <button type="button" className="btn sell-row" onClick={onSell} data-testid="sell-row">
        <span>Sell the warehouse</span>
        <span className="muted">
          {view.stars.claimable === 0 ? `first star at ${formatCash(view.stars.nextAt)} earned` : `worth ${view.stars.claimable} ${view.stars.claimable === 1 ? 'star' : 'stars'}`}
        </span>
      </button>
    </Sheet>
  );
}
