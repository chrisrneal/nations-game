import type { FriendType, HintTopic, KidOutcome, KidView, MainHint, SnackEnd, SnackId, WaveResult } from '@snacks/contracts';

/**
 * Words for the screen: snack and friend names, what happened in a wave, the
 * kids' letters. The pictures are in art/ (K10).
 */

export const SNACK_NAME: Readonly<Record<SnackId, string>> = {
  apple: 'Apple',
  cookie: 'Cookie',
  banana: 'Banana',
  cheese: 'Cheese stick',
  pretzel: 'Pretzel',
  grapes: 'Grapes',
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

/** One line in the shop for each friend, for a grade-4 reader (RULES 5, 7). */
export const FRIEND_BLURB: Readonly<Record<FriendType, string>> = {
  straight: 'Throws a snack in a straight line: up, down, left or right.',
  diagonal: 'Throws a snack corner to corner, along a slanted line.',
  short: 'Passes a snack to a square right next to it.',
  bouncer: 'Bounces a snack in an L shape, over anything in the way.',
  nurse: 'Doesn’t throw. Helps a kid near it get over a tummy ache.',
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
      return `${label} ate the ${ate} and went home happy`;
    case 'healed':
      return `${label} got a tummy ache from the ${ate}. The Nurse helped, so ${label} stays one more wave`;
    case 'waits':
      return `${label} is still hungry and waits for the next wave`;
    case 'hungry':
      return outcome.ache ? `${label} got a tummy ache from the ${ate} and went home hungry` : `${label} got no snack and went home hungry`;
  }
}

/** A short summary of a wave for the result panel. */
export function waveSummary(wave: WaveResult): string {
  const fed = wave.kids.filter((k) => k.end === 'happy').length;
  const parts = [`Wave ${wave.wave}: ${fed} of ${wave.kids.length} fed`];
  if (wave.points > 0) parts.push(`+${wave.points} points`);
  if (wave.wentHungry > 0) parts.push(`${wave.wentHungry} went home hungry`);
  return parts.join(' · ');
}

/** What a kid wears, in words, for their clue card: "Wears a hat and glasses." */
export function kidLooks(kid: KidView): string {
  const wears = [kid.look.hat ? 'a hat' : '', kid.look.glasses ? 'glasses' : '', kid.look.backpack ? 'a backpack' : ''].filter((w) => w !== '');
  if (wears.length === 0) return '';
  const list = wears.length === 1 ? wears[0]! : `${wears.slice(0, -1).join(', ')} and ${wears[wears.length - 1]!}`;
  return `Wears ${list}.`;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A kid's letter from their id: the same letters the View gives (KidView.label). */
export function kidLetter(id: number): string {
  return LETTERS[(id - 1) % LETTERS.length] ?? '?';
}

/** What the result overlay lists after a wave: kids by letter. */
export interface WaveReport {
  readonly fed: readonly string[];
  readonly aches: readonly string[];
  readonly healed: readonly string[];
  readonly hungry: readonly string[];
  readonly points: number;
}

export function waveReport(wave: WaveResult, label: (kid: number) => string): WaveReport {
  const of = (keep: (k: KidOutcome) => boolean): string[] => wave.kids.filter(keep).map((k) => label(k.kid));
  return {
    fed: of((k) => k.end === 'happy'),
    aches: of((k) => k.ache),
    healed: of((k) => k.end === 'healed'),
    hungry: of((k) => k.end === 'hungry'),
    points: wave.points,
  };
}

/** Kids who went home hungry today against how many may (RULES 8). */
export function hungryOf(hungry: number, allowed: number): string {
  return hungry > allowed ? `${hungry} of ${allowed}: too many` : `${hungry} of ${allowed}`;
}

/** A clue in fewer letters for a crowded row of cards (3 or 4 kids at once). Every fact stays; the full card is a tap away. */
export function shortClue(clue: string): string {
  const text = clue
    .replace(/^Something /, '')
    .replace(/^Same as the kid in the hat$/, 'same as hat')
    .replace(/^Same as the kid with glasses$/, 'same as glasses')
    .replace(/their sister’s/, 'sister’s');
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const TOPIC_WORDS: Readonly<Record<HintTopic, string>> = {
  colour: 'its colour',
  feel: 'how it feels',
  taste: 'how it tastes',
  shape: 'its shape',
  hat: 'the kid in the hat',
  glasses: 'the kid with glasses',
  sister: 'their sister',
};

const and = (words: readonly string[]): string => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]!}`);

/**
 * The hint showing, in a 9-year-old's words (RULES 8b). `label` is the kid's
 * letter; `type` the friend standing where tier 3 put one.
 */
export function hintLine(hint: MainHint, label: string, type: FriendType | null): string {
  switch (hint.tier) {
    case 0:
      return 'Every kid gets the right snack. Press Go!';
    case 1: {
      const traits = hint.about.filter((t) => t !== 'hat' && t !== 'glasses' && t !== 'sister').map((t) => TOPIC_WORDS[t]);
      const kids = hint.about.filter((t) => t === 'hat' || t === 'glasses' || t === 'sister').map((t) => TOPIC_WORDS[t]);
      const parts = [traits.length > 0 ? `is about ${and(traits)}` : '', kids.length > 0 ? `points at ${and(kids)}` : ''].filter((p) => p !== '');
      return `Kid ${label} next: their card ${parts.join(', and ')}.`;
    }
    case 2:
      return `Kid ${label}’s snack is in the glowing lunchbox.`;
    case 3:
      return hint.placed >= 0 && type !== null ? `A ${FRIEND_NAME[type]} is in place for kid ${label}. Hint again for the next step.` : `A friend in kid ${label}’s way went back to the tray.`;
  }
}

/** Hints used, in words: "none", "1 hint", "4 hints". */
export function hintsText(n: number): string {
  return n === 0 ? 'none' : n === 1 ? '1 hint' : `${n} hints`;
}

/** Hints used today: every wave's added up. */
export function hintsToday(hints: readonly number[]): number {
  return hints.reduce((a, b) => a + b, 0);
}
