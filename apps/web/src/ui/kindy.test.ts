import { describe, expect, it } from 'vitest';
import type { FriendView, GameView, WaveResult } from '@snacks/contracts';
import { HINT_LINES, fedSlots, hintPath, kidReaction, nightGone } from './kindy.ts';

const friend = (id: number, cell: number, facing = 0): FriendView => ({ id, type: 'straight', cell, facing, target: -1, picker: false });

/** A 4 x 4 Kindy board: an apple box at 0, a kid on the path at 3, two friends. */
function view(friends: readonly FriendView[]): GameView {
  const squares = Array.from({ length: 16 }, (_, c) => (c === 0 ? 'lunchbox' : c % 4 === 3 ? 'path' : 'open')) as GameView['squares'];
  return {
    mode: 'kindy',
    round: 'daily',
    day: 1,
    seed: 1,
    width: 4,
    height: 4,
    squares,
    lunchboxes: [{ cell: 0, snack: 'apple' }],
    snacks: [],
    wave: 1,
    waves: 5,
    phase: 'setup',
    points: 0,
    hungry: 0,
    hungryAllowed: 0,
    fed: 2,
    friends,
    kids: [{ id: 1, cell: 3, label: 'A', look: { shirt: 0, hat: false, glasses: false, backpack: false, sister: 0 }, clue: null, facts: null, wants: 'apple', healed: false }],
    shop: [],
    loopWarning: false,
    lastWave: null,
    facings: { straight: [0, 2, 4, 6], diagonal: [1, 3, 5, 7], short: [0, 1, 2, 3, 4, 5, 6, 7], bouncer: [0, 1, 2, 3, 4, 5, 6, 7], nurse: [0] },
    hint: null,
    mainHint: null,
    hints: [],
  };
}

describe('where a Kindy hint points (RULES 11)', () => {
  it('place: from the friend in the tray to the square; straight to the square once the child picked that friend', () => {
    const v = view([friend(1, -1), friend(2, -1)]);
    expect(hintPath(v, { kind: 'place', friend: 1, cell: 1 }, null)).toEqual({ from: { kind: 'tray', friend: 1 }, to: { kind: 'cell', cell: 1 } });
    expect(hintPath(v, { kind: 'place', friend: 1, cell: 1 }, 1)).toEqual({ from: null, to: { kind: 'cell', cell: 1 } });
    // Picking the other friend doesn't count: the hand still starts at the right one.
    expect(hintPath(v, { kind: 'place', friend: 1, cell: 1 }, 2)?.from).toEqual({ kind: 'tray', friend: 1 });
  });

  it('a friend already out moves from its own square', () => {
    const v = view([friend(1, 9)]);
    expect(hintPath(v, { kind: 'place', friend: 1, cell: 1 }, null)?.from).toEqual({ kind: 'cell', cell: 9 });
  });

  it('aim: from the friend to the big square that throws that way (right, to the kid)', () => {
    const v = view([friend(1, 1)]);
    expect(hintPath(v, { kind: 'aim', friend: 1, facing: 2 }, null)).toEqual({ from: { kind: 'cell', cell: 1 }, to: { kind: 'cell', cell: 3 } });
    expect(hintPath(v, { kind: 'aim', friend: 1, facing: 2 }, 1)).toEqual({ from: null, to: { kind: 'cell', cell: 3 } });
    // Up is off the board: there is no square to tap, so no hand.
    expect(hintPath(v, { kind: 'aim', friend: 1, facing: 0 }, 1)).toBeNull();
  });

  it('tray: from the friend to the basket; go: the green button', () => {
    const v = view([friend(1, 9)]);
    expect(hintPath(v, { kind: 'tray', friend: 1 }, null)).toEqual({ from: { kind: 'cell', cell: 9 }, to: { kind: 'basket' } });
    expect(hintPath(v, { kind: 'go' }, null)).toEqual({ from: null, to: { kind: 'go' } });
  });

  it('has a short spoken line for every kind of hint', () => {
    expect(HINT_LINES.place).toBe('Put the thrower here!');
    for (const line of Object.values(HINT_LINES)) expect(line.split(' ').length).toBeLessThanOrEqual(7);
  });
});

describe('Kindy feedback in pictures', () => {
  const wave: WaveResult = {
    wave: 1,
    snacks: [
      { snack: 'cookie', picker: 1, lunchbox: 0, hops: [], beats: 2, end: 'bounced', kid: 2 },
      { snack: 'apple', picker: 2, lunchbox: 4, hops: [], beats: 2, end: 'fed', kid: 1 },
    ],
    kids: [
      { kid: 1, end: 'happy', ache: false, ate: 'apple' },
      { kid: 2, end: 'waits', ache: false, ate: null },
      { kid: 3, end: 'waits', ache: false, ate: null },
    ],
    points: 1,
    wentHungry: 0,
  };

  it('a fed kid dances; a wrong snack bounces off and the kid shakes their head; a kid with no snack just waits', () => {
    expect(kidReaction(wave, 1)).toBe('happy');
    expect(kidReaction(wave, 2)).toBe('shake');
    expect(kidReaction(wave, 3)).toBe('waits');
  });

  it('the row of faces fills one a fed kid', () => {
    expect(fedSlots({ fed: 2, waves: 5 })).toEqual([true, true, false, false, false]);
  });

  it('the picture countdown: the moon goes from evening to the next puzzle at midnight', () => {
    expect(nightGone(86_400_000)).toBe(0);
    expect(nightGone(43_200_000)).toBe(0.5);
    expect(nightGone(0)).toBe(1);
  });
});
