import type { FriendType } from '@snacks/contracts';

/**
 * Directions and throw patterns (RULES 5).
 *
 * A facing is a number 0-7. For Straight, Diagonal and Short it is a compass
 * direction, clockwise from up: 0 up, 1 up-right, 2 right, 3 down-right,
 * 4 down, 5 down-left, 6 left, 7 up-left. For a Bouncer it is one of the 8
 * knight hops, clockwise from "1 right, 2 up". A Nurse has facing 0.
 */
export const COMPASS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export const KNIGHT: readonly (readonly [number, number])[] = [
  [1, -2],
  [2, -1],
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
];

/** The facings each type may take, in the order a tap turns through them. */
export const FACINGS: Readonly<Record<FriendType, readonly number[]>> = {
  straight: [0, 2, 4, 6],
  diagonal: [1, 3, 5, 7],
  short: [0, 1, 2, 3, 4, 5, 6, 7],
  bouncer: [0, 1, 2, 3, 4, 5, 6, 7],
  nurse: [0],
};

/** Types that throw, in the order the generator and solver try them. */
export const THROWERS: readonly FriendType[] = ['straight', 'diagonal', 'short', 'bouncer'];

/** Up, right, down, left: the squares that count as "next to" a lunchbox (D4). */
export const SIDES: readonly (readonly [number, number])[] = [COMPASS[0]!, COMPASS[2]!, COMPASS[4]!, COMPASS[6]!];

export function isLine(type: FriendType): boolean {
  return type === 'straight' || type === 'diagonal';
}

/** The step a throw takes: a compass step for lines and Short, a knight hop for a Bouncer. */
export function throwStep(type: FriendType, facing: number): readonly [number, number] {
  const table = type === 'bouncer' ? KNIGHT : COMPASS;
  const step = table[facing];
  if (step === undefined) throw new Error(`No facing ${facing}`);
  return step;
}

export function validFacing(type: FriendType, facing: number): boolean {
  return FACINGS[type].includes(facing);
}
