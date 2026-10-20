import type { FriendType, FriendView, GameView } from '@snacks/contracts';
import { stepOf } from './labels.ts';

/**
 * What the setup screen highlights around a friend (RULES 5, 7): the squares
 * a tap can aim it at, a Nurse's heal range, and the line to where its next
 * throw lands (D12). Drawing only: the sim decides where snacks really go.
 */

/** The parts of the View aiming needs. */
export type AimBoard = Pick<GameView, 'width' | 'height' | 'squares' | 'facings'> & {
  readonly friends: readonly Pick<FriendView, 'id' | 'cell'>[];
  readonly kids: readonly { readonly id: number; readonly cell: number }[];
};

function onBoard(view: Pick<AimBoard, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < view.width && y < view.height;
}

/** A throw passes over this square: empty playground, or a path square with no kid on it. */
function passesOver(view: AimBoard, cell: number): boolean {
  const square = view.squares[cell];
  if (square !== 'open' && square !== 'path') return false;
  return !view.friends.some((f) => f.cell === cell) && !view.kids.some((k) => k.cell === cell);
}

/**
 * Every square a tap can aim this friend at, and the facing it sets. Straight
 * and Diagonal: each square along each line, up to and including the first
 * thing in the way. Short: the 8 squares around it. Bouncer: its 8 L-hops.
 * A Nurse has no facing.
 */
export function aimSquares(view: AimBoard, friend: Pick<FriendView, 'type' | 'cell'>): ReadonlyMap<number, number> {
  const aims = new Map<number, number>();
  if (friend.cell < 0 || friend.type === 'nurse') return aims;
  const x0 = friend.cell % view.width;
  const y0 = Math.floor(friend.cell / view.width);
  const line = friend.type === 'straight' || friend.type === 'diagonal';
  for (const facing of view.facings[friend.type]) {
    const [dx, dy] = stepOf(friend.type, facing);
    let x = x0 + dx;
    let y = y0 + dy;
    while (onBoard(view, x, y)) {
      const cell = y * view.width + x;
      aims.set(cell, facing);
      if (!line || !passesOver(view, cell)) break;
      x += dx;
      y += dy;
    }
  }
  return aims;
}

/** The squares within `range` of a Nurse, diagonals included (RULES 7, D3), not its own. */
export function healSquares(width: number, height: number, cell: number, range: number): ReadonlySet<number> {
  const cells = new Set<number>();
  if (cell < 0) return cells;
  const x0 = cell % width;
  const y0 = Math.floor(cell / width);
  for (let y = y0 - range; y <= y0 + range; y++) {
    for (let x = x0 - range; x <= x0 + range; x++) {
      if ((x !== x0 || y !== y0) && onBoard({ width, height }, x, y)) cells.add(y * width + x);
    }
  }
  return cells;
}

/** What is on the square a throw lands on: a kid takes it, a friend catches it, otherwise it is lost or flies off. */
export type Landing = 'kid' | 'friend' | 'lost' | 'off';

export interface ThrowLine {
  /** Square coordinates (x, y); `to` may be just off the board. */
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly lands: Landing;
}

/** The friend's next throw (D12): from it to the square the View says it lands on, or off the edge. Never the whole route. */
export function throwLine(view: AimBoard, friend: Pick<FriendView, 'id' | 'type' | 'cell' | 'facing' | 'target'>): ThrowLine | null {
  if (friend.cell < 0 || friend.type === 'nurse') return null;
  const from = [friend.cell % view.width, Math.floor(friend.cell / view.width)] as const;
  if (friend.target >= 0) {
    const t = friend.target;
    const lands: Landing = view.kids.some((k) => k.cell === t) ? 'kid' : view.friends.some((f) => f.cell === t && f.id !== friend.id) ? 'friend' : 'lost';
    return { from, to: [t % view.width, Math.floor(t / view.width)], lands };
  }
  const [dx, dy] = stepOf(friend.type, friend.facing);
  let x = from[0] + dx;
  let y = from[1] + dy;
  if (friend.type === 'straight' || friend.type === 'diagonal') {
    while (onBoard(view, x, y)) {
      x += dx;
      y += dy;
    }
  }
  return { from, to: [x, y], lands: 'off' };
}

/** The squares a tray diagram marks around the friend, on a 5 x 5 grid (x, y from -2 to 2). The Nurse marks its heal ring. */
export function patternCells(type: FriendType): readonly (readonly [number, number])[] {
  const cells: [number, number][] = [];
  if (type === 'bouncer') {
    for (let f = 0; f < 8; f++) cells.push([...stepOf('bouncer', f)] as [number, number]);
    return cells;
  }
  const facings = type === 'straight' ? [0, 2, 4, 6] : type === 'diagonal' ? [1, 3, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  const reach = type === 'straight' || type === 'diagonal' ? 2 : 1;
  for (const f of facings) {
    const [dx, dy] = stepOf('short', f);
    for (let r = 1; r <= reach; r++) cells.push([dx * r, dy * r]);
  }
  return cells;
}
