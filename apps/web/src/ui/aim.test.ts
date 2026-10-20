import { describe, expect, it } from 'vitest';
import type { FriendType, FriendView, SquareKind } from '@snacks/contracts';
import { aimSquares, healSquares, patternCells, throwLine, type AimBoard } from './aim.ts';

const FACINGS: Readonly<Record<FriendType, readonly number[]>> = {
  straight: [0, 2, 4, 6],
  diagonal: [1, 3, 5, 7],
  short: [0, 1, 2, 3, 4, 5, 6, 7],
  bouncer: [0, 1, 2, 3, 4, 5, 6, 7],
  nurse: [0],
};

/**
 * A board drawn as text, one row per string: `.` open, `=` path, `L` lunchbox,
 * `T` tree, `P` parents' table, `F` a friend (Straight facing up), `K` a kid
 * on the path, `@` the friend being aimed. Cells count row by row.
 */
function board(rows: readonly string[], type: FriendType = 'straight', facing = 0): { view: AimBoard; friend: FriendView } {
  const width = rows[0]!.length;
  const squares: SquareKind[] = [];
  const friends: FriendView[] = [];
  const kids: { id: number; cell: number }[] = [];
  let me: FriendView | null = null;
  rows.join('').split('').forEach((ch, cell) => {
    squares.push(ch === '=' || ch === 'K' ? 'path' : ch === 'L' ? 'lunchbox' : ch === 'T' ? 'obstacle' : ch === 'P' ? 'table' : 'open');
    if (ch === 'F') friends.push({ id: 100 + cell, type: 'straight', cell, facing: 0, target: -1, picker: false });
    if (ch === 'K') kids.push({ id: kids.length + 1, cell });
    if (ch === '@') {
      me = { id: 1, type, cell, facing, target: -1, picker: false };
      friends.push(me);
    }
  });
  if (me === null) throw new Error('no @ on the board');
  return { view: { width, height: rows.length, squares, friends, kids, facings: FACINGS }, friend: me };
}

const sorted = (m: ReadonlyMap<number, number>): [number, number][] => [...m.entries()].sort((a, b) => a[0] - b[0]);

describe('tap-to-aim squares (RULES 5)', () => {
  it('a Straight can aim at every square on its four lines, up to the first thing in the way', () => {
    const { view, friend } = board([
      '..T..', // 0-4
      '.....', // 5-9
      'F.@.=', // 10-14: a friend on the left, an empty path square on the right
      '.....', // 15-19
      '..K..', // 20-24: a kid below
    ]);
    // Up: 7, then the tree at 2 (it stops the throw, but you can still aim at it).
    // Right: 13, the empty path at 14 lets the snack through to the edge.
    // Down: 17, then the kid at 22. Left: 11, then the friend at 10.
    expect(sorted(aimSquares(view, friend))).toEqual([
      [2, 0],
      [7, 0],
      [10, 6],
      [11, 6],
      [13, 2],
      [14, 2],
      [17, 4],
      [22, 4],
    ]);
  });

  it('a Diagonal aims along its four diagonals and stops at a lunchbox', () => {
    const { view, friend } = board(['L....', '.....', '..@..', '.....', '....P'], 'diagonal', 1);
    expect(sorted(aimSquares(view, friend))).toEqual([
      [0, 7],
      [4, 1],
      [6, 7],
      [8, 1],
      [16, 5],
      [18, 3],
      [20, 5],
      [24, 3],
    ]);
  });

  it('a Short aims at the eight squares around it, and fewer at the edge', () => {
    const middle = board(['...', '.@.', '...'], 'short');
    expect(sorted(aimSquares(middle.view, middle.friend))).toEqual([
      [0, 7],
      [1, 0],
      [2, 1],
      [3, 6],
      [5, 2],
      [6, 5],
      [7, 4],
      [8, 3],
    ]);
    const corner = board(['@..', '...', '...'], 'short');
    expect(sorted(aimSquares(corner.view, corner.friend))).toEqual([
      [1, 2],
      [3, 4],
      [4, 3],
    ]);
  });

  it('a Bouncer aims at its eight L-hops, jumping over anything', () => {
    const { view, friend } = board(['.....', '.TTT.', '.T@T.', '.TTT.', '.....'], 'bouncer');
    // Knight hops clockwise from "1 right, 2 up" (facing 0).
    expect(sorted(aimSquares(view, friend))).toEqual([
      [1, 7],
      [3, 0],
      [5, 6],
      [9, 1],
      [15, 5],
      [19, 2],
      [21, 4],
      [23, 3],
    ]);
  });

  it('a Nurse has no facing, so nothing to aim at', () => {
    const { view, friend } = board(['...', '.@.', '...'], 'nurse');
    expect(aimSquares(view, friend).size).toBe(0);
  });

  it('a friend in the tray has nothing to aim at', () => {
    const { view, friend } = board(['...', '.@.', '...']);
    expect(aimSquares(view, { ...friend, cell: -1 }).size).toBe(0);
  });
});

describe('the Nurse heal range (RULES 7, D3)', () => {
  it('is the squares around the Nurse within its reach, not its own', () => {
    expect([...healSquares(5, 5, 12, 1)].sort((a, b) => a - b)).toEqual([6, 7, 8, 11, 13, 16, 17, 18]);
    expect(healSquares(5, 5, 12, 2).size).toBe(24);
    expect([...healSquares(5, 5, 0, 1)].sort((a, b) => a - b)).toEqual([1, 5, 6]);
  });
});

describe('the next-throw preview (D12)', () => {
  it('runs from the friend to the square its next throw lands on', () => {
    const { view, friend } = board(['.....', '.....', '..@..', '.....', '..K..'], 'straight', 4);
    expect(throwLine(view, { ...friend, target: 22 })).toEqual({ from: [2, 2], to: [2, 4], lands: 'kid' });
  });

  it('runs off the board when the throw would leave it', () => {
    const line = board(['.....', '.....', '..@..', '.....', '.....'], 'straight', 2);
    expect(throwLine(line.view, line.friend)).toEqual({ from: [2, 2], to: [5, 2], lands: 'off' });
    const hop = board(['.....', '.....', '....@', '.....', '.....'], 'bouncer', 2);
    expect(throwLine(hop.view, hop.friend)).toEqual({ from: [4, 2], to: [6, 3], lands: 'off' });
  });

  it('says whether a friend catches it or it is lost', () => {
    const pass = board(['..F..', '.....', '..@..'], 'straight', 0);
    expect(throwLine(pass.view, { ...pass.friend, target: 2 })?.lands).toBe('friend');
    const drop = board(['.....', '..@..', '.....'], 'short', 2);
    expect(throwLine(drop.view, { ...drop.friend, target: 8 })?.lands).toBe('lost');
  });

  it('is not drawn for a Nurse or a friend in the tray', () => {
    const nurse = board(['...', '.@.', '...'], 'nurse');
    expect(throwLine(nurse.view, nurse.friend)).toBeNull();
    const tray = board(['...', '.@.', '...']);
    expect(throwLine(tray.view, { ...tray.friend, cell: -1 })).toBeNull();
  });
});

describe('tray diagrams', () => {
  it('draw each pattern on a 5 x 5 grid around the friend', () => {
    expect(patternCells('straight')).toHaveLength(8);
    expect(patternCells('straight')).toContainEqual([0, -2]);
    expect(patternCells('diagonal')).toContainEqual([2, 2]);
    expect(patternCells('short')).toHaveLength(8);
    expect(patternCells('short').every(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) === 1)).toBe(true);
    expect(patternCells('bouncer')).toContainEqual([1, -2]);
    expect(patternCells('bouncer').every(([x, y]) => Math.abs(x) + Math.abs(y) === 3)).toBe(true);
    expect(patternCells('nurse')).toHaveLength(8);
  });
});
