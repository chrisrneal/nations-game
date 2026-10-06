import type { ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import { Sheet } from './Sheet.tsx';

/** Welcome to the new site: its twist, and what the stars now add, perks included (RULES 10a). */
export function SiteIntro(props: { view: WarehouseView; onClose: () => void }): ReactElement {
  const { view, onClose } = props;
  const perks = view.stars.perks.filter((p) => p.unlocked);
  return (
    <Sheet title={`Welcome to ${view.site.name}`} onClose={onClose}>
      <p className="twist" data-testid="site-twist">
        {view.site.twist}
      </p>
      <p className="sheet-note">
        {view.stars.owned} {view.stars.owned === 1 ? 'star' : 'stars'}: every pay here is +{Math.round((view.stars.bonusBp - 10_000) / 100)}%.
        {perks.length > 0 && ` Perks: ${perks.map((p) => p.name).join(', ')}.`}
      </p>
      <button type="button" className="btn btn-primary btn-wide" onClick={onClose} data-testid="open-site">
        Open the warehouse
      </button>
    </Sheet>
  );
}
