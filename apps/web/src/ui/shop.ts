import type { ShopItem } from '@snacks/contracts';
import { FRIEND_NAME } from './labels.ts';

/**
 * The words on one card of the shop (RULES 8, K9), from the View's shop item:
 * the buy button (its price, or how many more points are needed), how many
 * the player has today, and the refund button's name when there is one.
 */
export interface ShopCardWords {
  readonly buy: string;
  readonly buyLabel: string;
  readonly owned: string;
  /** Null when nothing of this type was bought since the last Go. */
  readonly refundLabel: string | null;
  /** Not enough points: the card shows as off. */
  readonly short: boolean;
}

export function shopCard(item: ShopItem): ShopCardWords {
  const name = FRIEND_NAME[item.type];
  const short = item.shortfall > 0;
  return {
    buy: short ? `Need ${item.shortfall} more` : `⭐ ${item.price}`,
    buyLabel: short ? `${name} costs ${item.price} points. Need ${item.shortfall} more` : `Buy a ${name} for ${item.price} points`,
    owned: `You have ${item.owned}`,
    refundLabel: item.refund >= 0 ? `Give back a ${name} for ${item.price} points` : null,
    short,
  };
}
