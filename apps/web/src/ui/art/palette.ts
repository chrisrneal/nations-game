import type { FriendType, SnackId } from '@snacks/contracts';

/**
 * The art's colours and marks (docs/ART.md): a sunny schoolyard at lunchtime.
 * One warm brown ink for every outline, flat fills, one soft highlight.
 *
 * Colour is never the only cue (K9): every snack colour a clue can name has
 * its own mark (a triangle for red, a square for brown...), shown on the
 * lunchbox's tag, in the snack key and in the clue's icons, and every shirt
 * colour has its own pattern, so a colour-blind player can still solve
 * "Not red" or "Not their sister's".
 */

/** The outline colour of everything. */
export const INK = '#4a3428';
/** Outline width in the 48-unit art box: about 2 px at 40 px. */
export const LINE = 2.5;

/** A mark a colour wears so it can be told apart without seeing colour. */
export type ColourMark = 'triangle' | 'square' | 'star' | 'diamond' | 'leaf';

/** Every snack colour RULES 4 names: its fill and its mark. Marks are all different (art.test.ts). */
export const SNACK_COLOURS: Readonly<Record<string, { readonly fill: string; readonly mark: ColourMark }>> = {
  red: { fill: '#e8483f', mark: 'triangle' },
  brown: { fill: '#b9783f', mark: 'square' },
  yellow: { fill: '#ffd23f', mark: 'star' },
  orange: { fill: '#ff9a2e', mark: 'diamond' },
  green: { fill: '#79c64e', mark: 'leaf' },
};

/** How each snack is drawn: its outline and the pattern on it. No two snacks share both (art.test.ts). */
export const SNACK_DRAWN: Readonly<Record<SnackId, { readonly silhouette: string; readonly pattern: string }>> = {
  apple: { silhouette: 'round with a stem and a leaf', pattern: 'a shine' },
  cookie: { silhouette: 'flat disc with a bite out', pattern: 'chocolate chips' },
  banana: { silhouette: 'long curved moon', pattern: 'a ridge and dark tips' },
  cheese: { silhouette: 'long straight stick', pattern: 'holes and a peeled strip' },
  pretzel: { silhouette: 'twisted knot', pattern: 'salt grains' },
  grapes: { silhouette: 'bunch of little balls', pattern: 'a stem and a leaf on top' },
};

/** A shirt pattern: sisters share colour and pattern, everyone else on the board differs (RULES 6). */
export type ShirtPattern = 'stripes' | 'dots' | 'star' | 'checks' | 'zigzag' | 'heart';

/** Shirt `look.shirt` 0-5: a colour and a pattern each, both different (art.test.ts). */
export const SHIRTS: readonly { readonly fill: string; readonly ink: string; readonly pattern: ShirtPattern }[] = [
  { fill: '#ef6f6c', ink: '#a8322f', pattern: 'stripes' },
  { fill: '#f7c548', ink: '#a8740c', pattern: 'dots' },
  { fill: '#6cc37a', ink: '#2f7a3d', pattern: 'star' },
  { fill: '#5aa8e6', ink: '#245f9e', pattern: 'checks' },
  { fill: '#b48be0', ink: '#6a3fa8', pattern: 'zigzag' },
  { fill: '#f08cc4', ink: '#a83a7a', pattern: 'heart' },
];

/** Skin and hair: looks only, picked from the kid's id (or their sister group, so sisters look alike). */
export const SKINS = ['#fbd9bd', '#f1bf96', '#d49a6a', '#a8704a', '#7a4e33'];
export const HAIRS = ['#3b2a20', '#7a4421', '#e0a83a', '#1f1a17', '#b8532c', '#5b3a6e'];

/** Each friend type's colour, the same on the board, in the tray, in the shop and in its pattern diagram. */
export const FRIEND_COLOURS: Readonly<Record<FriendType, string>> = {
  straight: '#2f6fd6',
  diagonal: '#8a56d6',
  short: '#e08a12',
  bouncer: '#139aa6',
  nurse: '#e0567a',
};

/** The board: grass for the playground, sandy paving for the path. */
export const GROUND = {
  grass: '#a7d96f',
  grassAlt: '#9ccf63',
  path: '#f4dca8',
  pathAlt: '#ecd096',
};
