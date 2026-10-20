import type { GameView, KindyHint, WaveResult } from '@snacks/contracts';
import { lineEnds } from './aim.ts';

/**
 * Kindy mode's pictures, hints and spoken lines (RULES 11). No text is ever
 * shown in Kindy play: every picture is drawn by CSS from a `data-pic`
 * attribute (Pic.tsx), and words exist only as spoken lines and as labels
 * for screen readers.
 */

/** Something on the Kindy screen a hint's hand can point at. */
export type Spot =
  | { readonly kind: 'cell'; readonly cell: number }
  | { readonly kind: 'tray'; readonly friend: number }
  | { readonly kind: 'basket' }
  | { readonly kind: 'go' };

/** Where the hand goes: first `from` (skipped when the child has already picked that friend), then `to`. */
export interface HintPath {
  readonly from: Spot | null;
  readonly to: Spot;
}

/** The friend's own square on the board, or its button in the tray. */
function friendSpot(view: GameView, id: number): Spot | null {
  const friend = view.friends.find((f) => f.id === id);
  if (friend === undefined) return null;
  return friend.cell >= 0 ? { kind: 'cell', cell: friend.cell } : { kind: 'tray', friend: id };
}

/**
 * What a hint points at on the screen as it stands. `selected` is the friend
 * the child has picked (in the tray or on the board), if any: then the hand
 * goes straight to where that friend goes.
 */
export function hintPath(view: GameView, hint: KindyHint, selected: number | null): HintPath | null {
  if (hint.kind === 'go') return { from: null, to: { kind: 'go' } };
  const from = selected === hint.friend ? null : friendSpot(view, hint.friend);
  if (hint.kind === 'place') return { from, to: { kind: 'cell', cell: hint.cell } };
  if (hint.kind === 'tray') return { from, to: { kind: 'basket' } };
  const friend = view.friends.find((f) => f.id === hint.friend);
  if (friend === undefined) return null;
  const end = [...lineEnds(view, friend)].find(([, facing]) => facing === hint.facing);
  return end === undefined ? null : { from, to: { kind: 'cell', cell: end[0] } };
}

/** What the phone's voice says with each hint (D16): a few words, for a 4-year-old. */
export const HINT_LINES: Readonly<Record<KindyHint['kind'], string>> = {
  place: 'Put the thrower here!',
  aim: 'Tap here to throw this way!',
  tray: 'Put this one back in the basket!',
  go: 'Press the green button!',
};

/** How a kid reacts at the end of a wave: a happy dance, or a head shake when a wrong snack bounced off them. */
export function kidReaction(wave: WaveResult, kid: number): 'happy' | 'shake' | 'waits' {
  if (wave.kids.some((k) => k.kid === kid && k.end === 'happy')) return 'happy';
  return wave.snacks.some((s) => s.kid === kid && s.end === 'bounced') ? 'shake' : 'waits';
}

/** One slot a kid of the day, filled as each is fed: the row of faces at the top of the Kindy screen. Kindy has one kid a wave. */
export function fedSlots(view: Pick<GameView, 'fed' | 'waves'>): readonly boolean[] {
  return Array.from({ length: Math.max(view.waves, view.fed) }, (_, i) => i < view.fed);
}

/** The part of the night gone by, 0 to 1: the moon's place on the picture countdown to the next puzzle at midnight. */
export function nightGone(msToMidnight: number): number {
  const day = 86_400_000;
  return Math.min(1, Math.max(0, 1 - msToMidnight / day));
}
