import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@snacks/sim';
import { COSMETIC_IDS } from '../ui/art/Cosmetics.tsx';
import { STICKER_PICTURE_IDS, StickerArt } from '../ui/art/Stickers.tsx';

/**
 * The sim's catalogue and the interface's pictures must agree (RULES 9a, K12):
 * a sticker or hat the sim can give is one the screen can draw, and the book
 * can be read without colour and without words.
 */

const colourless = (svg: string): string => svg.replace(/#[0-9a-fA-F]{3,8}\b/g, 'C').replace(/ class="[^"]*"/g, '').replace(/data-sticker="[^"]*"/g, '');

describe('the catalogue and its pictures agree', () => {
  it('every sticker the sim can give has a picture, and every picture is a sticker', () => {
    expect([...STICKER_PICTURE_IDS].sort()).toEqual(CATALOGUE.stickers.map((s) => s.id).sort());
  });

  it('every hat and outfit the sim can give has a drawing', () => {
    expect([...COSMETIC_IDS].sort()).toEqual(CATALOGUE.cosmetics.map((c) => c.id).sort());
  });

  it('no two stickers look the same once colour is taken out, so the book is readable without it', () => {
    const seen = new Map<string, string>();
    for (const { id } of CATALOGUE.stickers) {
      const plain = colourless(renderToStaticMarkup(h(StickerArt, { id })));
      expect(seen.get(plain), `${id} and ${seen.get(plain)} differ only in colour`).toBeUndefined();
      seen.set(plain, id);
    }
  });

  it('draws no text in any sticker, earned or locked, so Kindy can show them', () => {
    for (const { id } of CATALOGUE.stickers) {
      for (const locked of [false, true]) {
        const svg = renderToStaticMarkup(h(StickerArt, { id, locked }));
        expect(svg, id).not.toMatch(/<text|<title|<desc/);
      }
    }
  });

  it('a locked sticker is a silhouette of the same drawing, not hidden, and says nothing about itself', () => {
    const earned = renderToStaticMarkup(h(StickerArt, { id: 'snacks-apple', label: 'Apple' }));
    const locked = renderToStaticMarkup(h(StickerArt, { id: 'snacks-apple', locked: true, label: 'Apple' }));
    expect(locked).toContain('sticker-locked');
    expect(locked).not.toContain('Apple');
    expect(earned).toContain('aria-label="Apple"');
    const bare = (svg: string): string => colourless(svg).replace(' role="img" aria-label="Apple"', '').replace(/ aria-hidden="true"/g, '').replace(/<span +>/, '<span>');
    expect(bare(locked)).toBe(bare(earned));
  });

  it('has the book’s shape: 24 daily stickers on four pages, 6 bonus stickers on one, one hat or outfit per milestone', () => {
    expect(CATALOGUE.pages.map((p) => [p.id, CATALOGUE.stickers.filter((s) => s.page === p.id).length])).toEqual([['snacks', 6], ['friends', 6], ['sky', 6], ['school', 6], ['gold', 6]]);
    expect(CATALOGUE.cosmetics.map((c) => c.streak)).toEqual([3, 7, 14, 30]);
  });
});
