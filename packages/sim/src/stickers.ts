import type { Catalogue, CosmeticDef, StickerDef, StickerKind, StickerPage } from '@snacks/contracts';
import { mix32 } from './rng.ts';

/**
 * The sticker book and the wardrobe (RULES 9a, decision record K12).
 *
 * Cosmetic only. Nothing here is read by the puzzle, the generator, the
 * solver or the engine (a test keeps it so): it decides which sticker or hat
 * a finished day gives, and nothing else. Which sticker is a function of the
 * profile's id, the puzzle's day and what the book already holds, so it is
 * the same however and whenever it is claimed. No clock, no unseeded
 * randomness.
 */

/** Streak lengths that give a hat or an outfit. */
export const MILESTONES: readonly number[] = [3, 7, 14, 30];

export const STICKER_PAGES: readonly StickerPage[] = [
  { id: 'snacks', kind: 'daily', name: 'Snacks' },
  { id: 'friends', kind: 'daily', name: 'Friends' },
  { id: 'sky', kind: 'daily', name: 'Sunny day' },
  { id: 'school', kind: 'daily', name: 'School' },
  { id: 'gold', kind: 'bonus', name: 'Gold' },
];

const page = (id: string, kind: StickerKind, items: readonly (readonly [string, string])[]): StickerDef[] => items.map(([key, name]) => ({ id: `${id}-${key}`, kind, page: id, name }));

/** Every sticker, in book order: five pages of six. */
export const STICKERS: readonly StickerDef[] = [
  ...page('snacks', 'daily', [['apple', 'Apple'], ['cookie', 'Cookie'], ['banana', 'Banana'], ['cheese', 'Cheese stick'], ['pretzel', 'Pretzel'], ['grapes', 'Grapes']]),
  ...page('friends', 'daily', [['straight', 'Straight friend'], ['diagonal', 'Diagonal friend'], ['short', 'Short friend'], ['bouncer', 'Bouncer friend'], ['nurse', 'Nurse'], ['lunchbox', 'Lunchbox']]),
  ...page('sky', 'daily', [['sun', 'Sun'], ['moon', 'Moon'], ['sunrise', 'Sunrise'], ['balloon', 'Balloons'], ['party', 'Party'], ['sparkle', 'Sparkle']]),
  ...page('school', 'daily', [['house', 'Home'], ['trophy', 'Trophy'], ['bulb', 'Bright idea'], ['heart', 'Heart'], ['basket', 'Basket'], ['plaster', 'Plaster']]),
  ...page('gold', 'bonus', [['apple', 'Gold apple'], ['cookie', 'Gold cookie'], ['banana', 'Gold banana'], ['cheese', 'Gold cheese stick'], ['pretzel', 'Gold pretzel'], ['grapes', 'Gold grapes']]),
];

/** The hats and outfits, one per milestone. They go on the player's own avatar only (RULES 9a). */
export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'party-hat', slot: 'hat', streak: 3, name: 'Party hat' },
  { id: 'scarf', slot: 'outfit', streak: 7, name: 'Scarf' },
  { id: 'crown', slot: 'hat', streak: 14, name: 'Crown' },
  { id: 'cape', slot: 'outfit', streak: 30, name: 'Cape' },
];

/** FNV-1a over the string's UTF-16 units, finished with the RNG's own mixer: whole numbers only. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return mix32(h);
}

/**
 * The sticker a finished day gives: a place in the kind's pool worked out from
 * the profile and the day, then the first one the profile does not have yet,
 * going on round the pool. Null once the pool is complete.
 */
export function stickerFor(profileId: string, day: number, kind: StickerKind, owned: ReadonlySet<string>): string | null {
  const pool = STICKERS.filter((s) => s.kind === kind);
  const start = hash(`${profileId}|${kind}|${day}`) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const sticker = pool[(start + i) % pool.length]!;
    if (!owned.has(sticker.id)) return sticker.id;
  }
  return null;
}

/** The hat or outfit a streak of exactly this length gives, unless the profile has it already. */
export function cosmeticFor(streak: number, owned: ReadonlySet<string>): string | null {
  const found = COSMETICS.find((c) => c.streak === streak);
  return found !== undefined && !owned.has(found.id) ? found.id : null;
}

/** What the interface needs to draw the book: every page, sticker and cosmetic, earned or not. */
export const CATALOGUE: Catalogue = { pages: STICKER_PAGES, stickers: STICKERS, cosmetics: COSMETICS };
