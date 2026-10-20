import type { Board, Friend, FriendType, Lunchbox, Mode, Puzzle, PuzzleKid, SnackId, SquareKind } from '@snacks/contracts';

/**
 * Hand-made boards drawn as text, for tests and the harness. One row a string,
 * squares separated by spaces:
 *
 *   .   open             =   path (empty)       #  obstacle     T  table
 *   a c b h p g          a lunchbox: apple, cookie, banana, cheese, pretzel, grapes
 *   S0 D3 K5 B1          a friend on an open square: Straight, Diagonal, Short (K, as
 *                        in king), Bouncer, then its facing (geometry.ts)
 *   N                    a Nurse on an open square
 *   ka kh ...            a kid on a path square, wanting that snack
 *
 * Friends and kids are numbered from 1 in reading order.
 */
export interface Fixture {
  readonly board: Board;
  readonly friends: readonly Friend[];
  readonly kids: readonly { readonly id: number; readonly cell: number; readonly wants: SnackId }[];
}

const SNACK_LETTERS: Readonly<Record<string, SnackId>> = {
  a: 'apple',
  c: 'cookie',
  b: 'banana',
  h: 'cheese',
  p: 'pretzel',
  g: 'grapes',
};

const FRIEND_LETTERS: Readonly<Record<string, FriendType>> = {
  S: 'straight',
  D: 'diagonal',
  K: 'short',
  B: 'bouncer',
  N: 'nurse',
};

export interface FixturePuzzleOptions {
  readonly mode?: Mode;
  readonly waves?: number;
  /** The wave each kid arrives on, in kid order; all on wave 1 if left out. */
  readonly kidWaves?: readonly number[];
  /** The tray; the friends drawn on the board are always added to it, in the tray. */
  readonly tray?: readonly FriendType[];
  readonly shop?: readonly FriendType[];
  readonly hungryAllowed?: number;
}

/** A whole puzzle from a drawn board, for tests. Friends drawn on the board start in the tray. */
export function fixturePuzzle(rows: readonly string[], options: FixturePuzzleOptions = {}): Puzzle {
  const f = parseFixture(rows);
  const snacks = [...new Set(f.board.lunchboxes.map((l) => l.snack))];
  const kids: PuzzleKid[] = f.kids.map((k, i) => ({
    id: k.id,
    wave: options.kidWaves?.[i] ?? 1,
    cell: k.cell,
    wants: k.wants,
    look: { shirt: 0, hat: false, glasses: false, backpack: false, sister: 0 },
    clue: null,
  }));
  const waves = options.waves ?? Math.max(1, ...kids.map((k) => k.wave));
  return {
    mode: options.mode ?? 'main',
    round: 'practice',
    day: 0,
    seed: 0,
    board: f.board,
    snacks,
    kids,
    waves,
    tray: [...(options.tray ?? []), ...f.friends.map((fr) => fr.type)],
    shop: options.shop ?? [],
    hungryAllowed: options.hungryAllowed ?? 3,
    difficulty: new Array(waves).fill(0),
    witness: [],
  };
}

export function parseFixture(rows: readonly string[]): Fixture {
  const grid = rows.map((row) => row.trim().split(/\s+/));
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const squares: SquareKind[] = [];
  const lunchboxes: Lunchbox[] = [];
  const friends: Friend[] = [];
  const kids: { id: number; cell: number; wants: SnackId }[] = [];
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Row ${y} has ${row.length} squares, not ${width}`);
    row.forEach((token, x) => {
      const cell = y * width + x;
      const head = token[0] ?? '';
      const snack = SNACK_LETTERS[token];
      const friendType = FRIEND_LETTERS[head];
      if (token === '.') squares.push('open');
      else if (token === '=') squares.push('path');
      else if (token === '#') squares.push('obstacle');
      else if (token === 'T') squares.push('table');
      else if (snack !== undefined) {
        squares.push('lunchbox');
        lunchboxes.push({ cell, snack });
      } else if (head === 'k' && SNACK_LETTERS[token.slice(1)] !== undefined) {
        squares.push('path');
        kids.push({ id: kids.length + 1, cell, wants: SNACK_LETTERS[token.slice(1)]! });
      } else if (friendType !== undefined) {
        squares.push('open');
        const facing = friendType === 'nurse' ? 0 : Number(token.slice(1));
        if (!Number.isInteger(facing)) throw new Error(`Bad facing in "${token}"`);
        friends.push({ id: friends.length + 1, type: friendType, cell, facing });
      } else throw new Error(`Unknown square "${token}" at ${x},${y}`);
    });
  });
  return { board: { width, height, squares, lunchboxes }, friends, kids };
}
