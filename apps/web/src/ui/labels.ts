import type { FriendType, KidOutcome, KidView, SnackEnd, SnackId, WaveResult } from '@snacks/contracts';

/**
 * Words and symbols for the grey-squares screen (build step 6): plain
 * letters, chess symbols for the throw patterns and emoji for the snacks.
 * The art comes later (step 8).
 */

export const SNACK_EMOJI: Readonly<Record<SnackId, string>> = {
  apple: '🍎',
  cookie: '🍪',
  banana: '🍌',
  cheese: '🧀',
  pretzel: '🥨',
  grapes: '🍇',
};

export const SNACK_NAME: Readonly<Record<SnackId, string>> = {
  apple: 'Apple',
  cookie: 'Cookie',
  banana: 'Banana',
  cheese: 'Cheese stick',
  pretzel: 'Pretzel',
  grapes: 'Grapes',
};

/** Chess symbols: the friend throws the way that piece moves. */
export const FRIEND_GLYPH: Readonly<Record<FriendType, string>> = {
  straight: '♜',
  diagonal: '♝',
  short: '♚',
  bouncer: '♞',
  nurse: '✚',
};

export const FRIEND_NAME: Readonly<Record<FriendType, string>> = {
  straight: 'Straight',
  diagonal: 'Diagonal',
  short: 'Short',
  bouncer: 'Bouncer',
  nurse: 'Nurse',
};

export const FRIEND_HOW: Readonly<Record<FriendType, string>> = {
  straight: 'throws in a straight line, up, down or sideways',
  diagonal: 'throws in a diagonal line',
  short: 'throws one square, any way',
  bouncer: 'jumps a snack in an L, over anything',
  nurse: 'heals tummy aches next to it',
};

/** The order friend types appear in the tray and shop. */
export const FRIEND_ORDER: readonly FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];

/** Compass steps and knight hops by facing (the same tables as the sim's geometry, for drawing only). */
const COMPASS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
const KNIGHT: readonly (readonly [number, number])[] = [
  [1, -2],
  [2, -1],
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
];

export function stepOf(type: FriendType, facing: number): readonly [number, number] {
  return (type === 'bouncer' ? KNIGHT : COMPASS)[facing] ?? [0, -1];
}

/** Degrees to turn an up-arrow so it points the way a friend throws. */
export function facingAngle(type: FriendType, facing: number): number {
  const [dx, dy] = stepOf(type, facing);
  return Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
}

export const SHIRTS = ['#e86a6a', '#f2b544', '#6cc37a', '#5aa8e6', '#b48be0', '#e889c4'];

const END_WORDS: Readonly<Record<SnackEnd, string>> = {
  fed: 'was eaten',
  ache: 'gave a tummy ache',
  bounced: 'bounced off',
  wasted: 'was not needed',
  edge: 'flew off the board',
  blocked: 'hit something',
  dropped: 'fell on the ground',
  nurse: 'was stopped by a Nurse',
  loop: 'went round in circles',
};

export function snackEndWords(end: SnackEnd): string {
  return END_WORDS[end];
}

/** One line about a kid after a wave. */
export function kidLine(outcome: KidOutcome, label: string): string {
  const ate = outcome.ate === null ? '' : SNACK_NAME[outcome.ate];
  switch (outcome.end) {
    case 'happy':
      return `${label} ate the ${ate} and went home happy 😋`;
    case 'healed':
      return `${label} got a tummy ache from the ${ate}. The Nurse helped, so ${label} stays one more wave 🩹`;
    case 'waits':
      return `${label} is still hungry and waits for the next wave`;
    case 'hungry':
      return outcome.ache ? `${label} got a tummy ache from the ${ate} and went home hungry 🤢` : `${label} got no snack and went home hungry 😢`;
  }
}

/** A short summary of a wave for the result panel. */
export function waveSummary(wave: WaveResult): string {
  const fed = wave.kids.filter((k) => k.end === 'happy').length;
  const parts = [`Wave ${wave.wave}: ${fed} of ${wave.kids.length} fed`];
  if (wave.points > 0) parts.push(`+${wave.points} ⭐`);
  if (wave.wentHungry > 0) parts.push(`${wave.wentHungry} went home hungry`);
  return parts.join(' · ');
}

/** "the kid in the hat" etc. drawn as small emoji on a kid's square. */
export function kidBadges(kid: KidView): string {
  return `${kid.look.hat ? '🎩' : ''}${kid.look.glasses ? '👓' : ''}${kid.look.backpack ? '🎒' : ''}`;
}
