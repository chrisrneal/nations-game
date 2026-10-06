import type { ReactElement } from 'react';
import type { PerkView, WarehouseView } from '@warehouse/contracts';
import { Sheet } from './Sheet.tsx';

/** A perk's status in a few words: unlocked, the sale unlocks it, or how many stars it still needs. */
export function perkStatus(perk: PerkView, owned: number): string {
  if (perk.unlocked) return 'Unlocked';
  if (perk.unlocksOnSale) return 'Unlocks when you sell';
  const more = perk.stars - owned;
  return `${more} more ${more === 1 ? 'star' : 'stars'}`;
}

/**
 * The stars you own and what they give (RULES 10, 10a): the pay bonus, and the
 * ladder of perks, each unlocked by owning enough stars. Stars are never
 * spent. A sell button when this warehouse is worth a star.
 */
export function StarsSheet(props: { view: WarehouseView; onSell: () => void; onClose: () => void }): ReactElement {
  const { view, onSell, onClose } = props;
  const { stars } = view;
  return (
    <Sheet title="Stars" onClose={onClose}>
      <p className="sell-worth" data-testid="stars-owned">
        ★ {stars.owned}
      </p>
      <p className="sheet-note">
        {stars.owned === 0 ? 'Sell the warehouse to earn stars. Each one raises pay forever' : `Your stars add +${Math.round((stars.bonusBp - 10_000) / 100)}% to every order's pay`}, and
        owning more unlocks the perks below. Stars are never spent.
      </p>
      <ol className="perks" data-testid="perks">
        {stars.perks.map((perk) => (
          <li key={perk.id} className={`perk${perk.unlocked ? ' unlocked' : ''}${perk.unlocksOnSale ? ' soon' : ''}`} data-testid={`perk-${perk.id}`}>
            <span className="perk-stars" aria-label={`${perk.stars} stars`}>
              ★{perk.stars}
            </span>
            <span className="perk-main">
              <span className="perk-name">{perk.name}</span>
              <span className="perk-effect">{perk.effect}</span>
            </span>
            <span className="perk-status">{perkStatus(perk, stars.owned)}</span>
          </li>
        ))}
      </ol>
      {stars.claimable > 0 && (
        <button type="button" className="btn btn-wide btn-sell" onClick={onSell} data-testid="stars-sell">
          Sell for +{stars.claimable} ★
        </button>
      )}
    </Sheet>
  );
}
