import type { Catalogue, CosmeticDef, Mode, ProfileView, StickerDef, StickerPage } from '@snacks/contracts';

/**
 * What the sticker book shows (RULES 9a, K12), worked out from the profile's
 * view and the host's catalogue. Pure, so it is tested without a browser.
 */

/**
 * The pages a child's book has. A Kindy child has no bonus round (RULES 8,
 * 11), so the gold page, which only a bonus round fills, is left out of their
 * book instead of sitting there empty for ever.
 */
export function bookPages(mode: Mode, catalogue: Catalogue): readonly StickerPage[] {
  return catalogue.pages.filter((p) => mode === 'main' || p.kind === 'daily');
}

export function pageStickers(catalogue: Catalogue, page: string): readonly StickerDef[] {
  return catalogue.stickers.filter((s) => s.page === page);
}

/** Stickers earned out of those this child's book can hold. */
export function bookCount(profile: ProfileView, catalogue: Catalogue): { earned: number; total: number } {
  const pages = new Set(bookPages(profile.mode, catalogue).map((p) => p.id));
  const total = catalogue.stickers.filter((s) => pages.has(s.page)).length;
  const earned = profile.stickers.filter((s) => catalogue.stickers.some((d) => d.id === s.id && pages.has(d.page))).length;
  return { earned, total };
}

/** What the reveal shows, in the order it pops up: stickers, then a hat or outfit. */
export interface RevealItem {
  readonly kind: 'sticker' | 'cosmetic';
  readonly id: string;
  readonly name: string;
  /** "Streak hat" and so on, for main mode. */
  readonly note: string;
}

export function revealItems(profile: ProfileView, catalogue: Catalogue): readonly RevealItem[] {
  const stickers = profile.unseen.stickers.flatMap((s): RevealItem[] => {
    const def = catalogue.stickers.find((d) => d.id === s.id);
    return def === undefined ? [] : [{ kind: 'sticker', id: def.id, name: def.name, note: s.kind === 'bonus' ? 'Bonus sticker' : 'New sticker' }];
  });
  const cosmetics = profile.unseen.cosmetics.flatMap((c): RevealItem[] => {
    const def = catalogue.cosmetics.find((d) => d.id === c.id);
    return def === undefined ? [] : [{ kind: 'cosmetic', id: def.id, name: def.name, note: `${c.streak} days in a row` }];
  });
  return [...stickers, ...cosmetics];
}

/** How a hat or outfit is earned, in main mode's words. */
export function earnText(def: CosmeticDef): string {
  return `${def.streak} days in a row`;
}

/** The next page, wrapping round at either end so the arrows never go dead. */
export function turnPage(index: number, by: 1 | -1, pages: number): number {
  return pages <= 0 ? 0 : (index + by + pages) % pages;
}
