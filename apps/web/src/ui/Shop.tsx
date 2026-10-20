import type { ReactElement } from 'react';
import type { FriendType, GameView } from '@snacks/contracts';
import { PatternDiagram } from './Diagram.tsx';
import { FRIEND_BLURB, FRIEND_NAME, FRIEND_PIC } from './labels.ts';
import { Sheet } from './Sheet.tsx';
import { shopCard } from './shop.ts';

/**
 * The shop (RULES 8, K9), main mode only, between waves: a bottom sheet with
 * a card for each friend today's puzzle sells. A card shows a picture, the
 * friend's name, its throw pattern (the tray's diagram), one line on what it
 * does, how many the player has, and its price; with too few points the card
 * is off and says how many more are needed. A friend bought since the last
 * Go can be given back for its points. Everything comes from the View; a buy
 * or a refund is a command, and the tray under the sheet updates at once.
 */
export function Shop(props: { view: GameView; onBuy: (type: FriendType) => void; onRefund: (friend: number) => void; onClose: () => void }): ReactElement {
  const { view } = props;
  return (
    <Sheet title={`Shop · ⭐ ${view.points}`} label="Shop" className="shop-sheet" onClose={props.onClose}>
      <p className="sheet-note shop-note">Fed kids earn points. Friends you buy help for the rest of today. Changed your mind? Give one back before you press Go.</p>
      <ul className="shop">
        {view.shop.map((item) => {
          const words = shopCard(item);
          return (
            <li key={item.type} className={`shop-card t-${item.type}${words.short ? ' short' : ''}`} data-type={item.type}>
              <span className="shop-pic" role="img" aria-label={FRIEND_NAME[item.type]}>
                {FRIEND_PIC[item.type]}
              </span>
              <span className="shop-what">
                <strong className="shop-name">{FRIEND_NAME[item.type]}</strong>
                <span className="shop-owned">{words.owned}</span>
              </span>
              <span className="shop-buttons">
                {words.refundLabel !== null && (
                  <button type="button" className="btn btn-small shop-refund" aria-label={words.refundLabel} onClick={() => props.onRefund(item.refund)}>
                    ↩ Give back
                  </button>
                )}
                <button type="button" className="btn shop-buy" disabled={!item.canBuy} aria-label={words.buyLabel} onClick={() => props.onBuy(item.type)}>
                  {words.buy}
                </button>
              </span>
              <PatternDiagram type={item.type} className="shop-diagram" />
              <span className="shop-blurb">{FRIEND_BLURB[item.type]}</span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
