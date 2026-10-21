import { describe, expect, it } from 'vitest';
import type { Catalogue, ProfileView } from '@snacks/contracts';
import { bookCount, bookPages, earnText, pageStickers, revealItems, turnPage } from './book.ts';

const catalogue: Catalogue = {
  pages: [
    { id: 'a', kind: 'daily', name: 'A' },
    { id: 'b', kind: 'daily', name: 'B' },
    { id: 'gold', kind: 'bonus', name: 'Gold' },
  ],
  stickers: [
    { id: 'a-1', kind: 'daily', page: 'a', name: 'One' },
    { id: 'a-2', kind: 'daily', page: 'a', name: 'Two' },
    { id: 'b-1', kind: 'daily', page: 'b', name: 'Three' },
    { id: 'gold-1', kind: 'bonus', page: 'gold', name: 'Gold one' },
  ],
  cosmetics: [{ id: 'party-hat', slot: 'hat', streak: 3, name: 'Party hat' }],
};

const profile = (over: Partial<ProfileView> = {}): ProfileView => ({
  id: 'p1', name: '', avatar: 'dog', mode: 'main', streak: 0, best: 0, today: null, recent: [],
  stickers: [], cosmetics: [], worn: { hat: null, outfit: null }, unseen: { stickers: [], cosmetics: [] }, ...over,
});

describe('the sticker book’s pages', () => {
  it('main mode has every page, Kindy has no gold page (it has no bonus round)', () => {
    expect(bookPages('main', catalogue).map((p) => p.id)).toEqual(['a', 'b', 'gold']);
    expect(bookPages('kindy', catalogue).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('lists a page’s stickers in book order', () => {
    expect(pageStickers(catalogue, 'a').map((s) => s.id)).toEqual(['a-1', 'a-2']);
  });

  it('counts earned stickers against what that child’s book can hold', () => {
    const earned = [{ id: 'a-1', kind: 'daily', day: 1, seen: true }, { id: 'gold-1', kind: 'bonus', day: 1, seen: true }] as const;
    expect(bookCount(profile({ stickers: earned }), catalogue)).toEqual({ earned: 2, total: 4 });
    expect(bookCount(profile({ mode: 'kindy', stickers: earned }), catalogue)).toEqual({ earned: 1, total: 3 });
  });
});

describe('the reveal', () => {
  it('shows each unseen sticker, then each unseen hat, and nothing already seen', () => {
    const p = profile({
      unseen: { stickers: [{ id: 'b-1', kind: 'daily', day: 1, seen: false }, { id: 'gold-1', kind: 'bonus', day: 1, seen: false }], cosmetics: [{ id: 'party-hat', day: 1, streak: 3, seen: false }] },
    });
    expect(revealItems(p, catalogue).map((r) => [r.kind, r.id, r.note])).toEqual([
      ['sticker', 'b-1', 'New sticker'],
      ['sticker', 'gold-1', 'Bonus sticker'],
      ['cosmetic', 'party-hat', '3 days in a row'],
    ]);
    expect(revealItems(profile(), catalogue)).toEqual([]);
  });
});

describe('small helpers', () => {
  it('says how a hat is earned', () => expect(earnText(catalogue.cosmetics[0]!)).toBe('3 days in a row'));
  it('turns pages round at the ends', () => {
    expect(turnPage(0, -1, 5)).toBe(4);
    expect(turnPage(4, 1, 5)).toBe(0);
    expect(turnPage(2, 1, 5)).toBe(3);
    expect(turnPage(0, 1, 0)).toBe(0);
  });
});
