import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COSMETICS, MILESTONES, STICKERS, STICKER_PAGES, cosmeticFor, stickerFor } from './stickers.ts';

const ids = (kind: 'daily' | 'bonus'): string[] => STICKERS.filter((s) => s.kind === kind).map((s) => s.id);

describe('the catalogue (RULES 9a)', () => {
  it('has unique ids, whole pages and a page for every sticker', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const page of STICKER_PAGES) {
      const on = STICKERS.filter((s) => s.page === page.id);
      expect(on.length).toBeGreaterThan(0);
      expect(on.length).toBeLessThanOrEqual(6);
      expect(on.every((s) => s.kind === page.kind)).toBe(true);
    }
    expect(STICKERS.every((s) => STICKER_PAGES.some((p) => p.id === s.page))).toBe(true);
  });

  it('keeps daily stickers and bonus stickers in their own pools', () => {
    expect(ids('daily').length).toBe(24);
    expect(ids('bonus').length).toBe(6);
  });

  it('gives each streak milestone exactly one hat or outfit, in the order 3, 7, 14, 30', () => {
    expect(MILESTONES).toEqual([3, 7, 14, 30]);
    expect(COSMETICS.map((c) => c.streak)).toEqual([3, 7, 14, 30]);
    expect(COSMETICS.map((c) => c.slot)).toEqual(['hat', 'outfit', 'hat', 'outfit']);
  });
});

describe('which sticker a day gives (deterministic, not random at claim time)', () => {
  it('is the same for the same profile, day and book, every time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 19_000, max: 22_000 }), fc.constantFrom('daily' as const, 'bonus' as const), (n, day, kind) => {
        const id = `p${n}`;
        expect(stickerFor(id, day, kind, new Set())).toBe(stickerFor(id, day, kind, new Set()));
      }),
    );
  });

  it('comes from the right pool and is never one the profile already has', () => {
    fc.assert(
      fc.property(fc.integer({ min: 19_000, max: 22_000 }), fc.subarray(ids('daily')), (day, owned) => {
        const got = stickerFor('p1', day, 'daily', new Set(owned));
        if (owned.length === ids('daily').length) expect(got).toBeNull();
        else {
          expect(ids('daily')).toContain(got);
          expect(owned).not.toContain(got);
        }
      }),
    );
  });

  it('differs between profiles on the same day (their books fill in different orders)', () => {
    const first = new Set(Array.from({ length: 12 }, (_, i) => stickerFor(`p${i + 1}`, 20_400, 'daily', new Set())));
    expect(first.size).toBeGreaterThan(4);
  });

  it('fills a whole book with one new sticker a day, then gives nothing more', () => {
    const owned = new Set<string>();
    for (let day = 20_400; day < 20_424; day++) {
      const id = stickerFor('p2', day, 'daily', owned);
      expect(id).not.toBeNull();
      owned.add(id!);
    }
    expect(owned.size).toBe(24);
    expect(stickerFor('p2', 20_424, 'daily', owned)).toBeNull();
  });
});

describe('which hat or outfit a streak gives', () => {
  it('gives the milestone’s item once, on exactly that streak', () => {
    for (const c of COSMETICS) {
      expect(cosmeticFor(c.streak, new Set())).toBe(c.id);
      expect(cosmeticFor(c.streak, new Set([c.id]))).toBeNull();
    }
    for (const streak of [0, 1, 2, 4, 5, 6, 8, 13, 15, 29, 31, 100]) expect(cosmeticFor(streak, new Set())).toBeNull();
  });
});
