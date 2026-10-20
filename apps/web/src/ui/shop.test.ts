import { describe, expect, it } from 'vitest';
import type { FriendType, ShopItem } from '@snacks/contracts';
import { FRIEND_BLURB } from './labels.ts';
import { shopCard } from './shop.ts';

const item = (over: Partial<ShopItem> = {}): ShopItem => ({ type: 'straight', price: 2, canBuy: true, shortfall: 0, owned: 0, refund: -1, ...over });
const TYPES: readonly FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];

describe('the shop’s cards (K9)', () => {
  it('a friend the player can afford: buy for its price', () => {
    expect(shopCard(item())).toEqual({ buy: '2', buyLabel: 'Buy a Straight for 2 points', owned: 'You have 0', refundLabel: null, short: false });
  });

  it('not enough points: the card is off and says how many more are needed', () => {
    expect(shopCard(item({ canBuy: false, shortfall: 2, owned: 1 }))).toMatchObject({ buy: 'Need 2 more', buyLabel: 'Straight costs 2 points. Need 2 more', owned: 'You have 1', short: true });
    expect(shopCard(item({ canBuy: false, shortfall: 1 })).buy).toBe('Need 1 more');
  });

  it('a friend bought this setup can be given back for its points', () => {
    expect(shopCard(item({ owned: 2, refund: 7 })).refundLabel).toBe('Give back a Straight for 2 points');
  });

  it('every friend has one short line a grade-4 reader can follow (its picture is art/Friend.tsx)', () => {
    for (const type of TYPES) {
      const line = FRIEND_BLURB[type];
      expect(line.length).toBeLessThanOrEqual(80);
      expect(line).toMatch(/^[A-Z].*\.$/);
      expect(line).not.toMatch(/rook|bishop|knight|king|chess|diagonal/i);
    }
  });
});
