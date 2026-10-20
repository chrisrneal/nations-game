import type { Board, Friend, FriendType, Mode, SnackEnd, SnackHop, SnackId, SnackTrace } from '@snacks/contracts';
import { SIDES, isLine, throwStep } from './geometry.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/**
 * The wave engine (RULES 5, 7): where every snack goes once Go is pressed.
 *
 * The board never changes during a wave, so each snack is followed on its own
 * from its lunchbox to wherever it ends, and only then are the arrivals at
 * each kid put in order. No randomness anywhere.
 */

export interface WaveKid {
  readonly id: number;
  readonly cell: number;
  readonly wants: SnackId;
}

export interface WaveInput {
  readonly board: Board;
  /** Friends in the tray (cell -1) are ignored. */
  readonly friends: readonly Friend[];
  readonly kids: readonly WaveKid[];
  readonly mode: Mode;
}

export interface Flights {
  /** One per picker, in reading order of the pickers. */
  readonly snacks: readonly SnackTrace[];
  /** Kids who got the right snack first, and which. */
  readonly fed: ReadonlyMap<number, SnackId>;
  /** Kids who got a wrong snack first (main mode only), and which. */
  readonly aches: ReadonlyMap<number, SnackId>;
}

/** What stands on each square during a wave. */
export interface Occupancy {
  readonly friendAt: readonly (Friend | undefined)[];
  readonly kidAt: readonly (WaveKid | undefined)[];
}

export function occupancy(board: Board, friends: readonly Friend[], kids: readonly WaveKid[]): Occupancy {
  const size = board.width * board.height;
  const friendAt: (Friend | undefined)[] = new Array(size).fill(undefined);
  const kidAt: (WaveKid | undefined)[] = new Array(size).fill(undefined);
  for (const f of friends) if (f.cell >= 0) friendAt[f.cell] = f;
  for (const k of kids) kidAt[k.cell] = k;
  return { friendAt, kidAt };
}

/** The lunchboxes sharing a side with a square (D4), up, right, down, left. */
export function lunchboxesBeside(board: Board, cell: number): number[] {
  const x = cell % board.width;
  const y = Math.floor(cell / board.width);
  const found: number[] = [];
  for (const [dx, dy] of SIDES) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height) continue;
    const n = ny * board.width + nx;
    if (board.squares[n] === 'lunchbox') found.push(n);
  }
  return found;
}

/** The lunchbox a friend picks up from, or -1: a thrower beside exactly one lunchbox (RULES 5). */
export function pickupFor(board: Board, friend: Friend): number {
  if (friend.type === 'nurse' || friend.cell < 0) return -1;
  const beside = lunchboxesBeside(board, friend.cell);
  return beside.length === 1 ? beside[0]! : -1;
}

export function snackIn(board: Board, cell: number): SnackId {
  const box = board.lunchboxes.find((l) => l.cell === cell);
  if (box === undefined) throw new Error(`No lunchbox at ${cell}`);
  return box.snack;
}

/** Where one throw ends: off the board, at a square that stops it, or (Short, Bouncer) where it lands. */
export interface Landing {
  readonly x: number;
  readonly y: number;
  /** -1 off the board. */
  readonly cell: number;
  readonly beats: number;
}

/** One throw from (x, y) by a friend of `type` facing `facing`, on a board with these occupants. */
export function landing(board: Board, occ: Occupancy, type: FriendType, facing: number, x: number, y: number): Landing {
  const [dx, dy] = throwStep(type, facing);
  const stepBeats = type === 'bouncer' ? T.bouncerBeats.value : 1;
  let cx = x;
  let cy = y;
  let beats = 0;
  for (;;) {
    cx += dx;
    cy += dy;
    beats += stepBeats;
    if (cx < 0 || cy < 0 || cx >= board.width || cy >= board.height) return { x: cx, y: cy, cell: -1, beats };
    const cell = cy * board.width + cx;
    const square = board.squares[cell];
    const empty = (square === 'open' || square === 'path') && occ.friendAt[cell] === undefined && occ.kidAt[cell] === undefined;
    // Lines fly on over empty squares; every other throw lands where it lands.
    if (!(empty && isLine(type))) return { x: cx, y: cy, cell, beats };
  }
}

interface Arrival {
  readonly index: number;
  readonly kid: WaveKid;
  readonly beats: number;
  readonly pickerCell: number;
}

interface Flight {
  snack: SnackId;
  picker: Friend;
  lunchbox: number;
  hops: SnackHop[];
  beats: number;
  end: SnackEnd;
  kid: number;
}

/** Follows one snack from its picker until it is lost or reaches a kid. */
function fly(board: Board, occ: Occupancy, picker: Friend, lunchbox: number): Flight {
  const flight: Flight = { snack: snackIn(board, lunchbox), picker, lunchbox, hops: [], beats: 0, end: 'edge', kid: -1 };
  let holder = picker;
  let passes = 0;
  for (;;) {
    const fromX = holder.cell % board.width;
    const fromY = Math.floor(holder.cell / board.width);
    const land = landing(board, occ, holder.type, holder.facing, fromX, fromY);
    flight.hops.push({ fromX, fromY, toX: land.x, toY: land.y, beats: land.beats, by: holder.type });
    flight.beats += land.beats;
    if (land.cell < 0) {
      flight.end = 'edge';
      return flight;
    }
    const friend = occ.friendAt[land.cell];
    const kid = occ.kidAt[land.cell];
    if (kid !== undefined) {
      flight.kid = kid.id;
      flight.end = 'wasted'; // decided once every arrival is known
      return flight;
    }
    if (friend === undefined) {
      const square = board.squares[land.cell];
      flight.end = square === 'open' || square === 'path' ? 'dropped' : 'blocked';
      return flight;
    }
    if (friend.type === 'nurse') {
      flight.end = 'nurse';
      return flight;
    }
    passes += 1;
    if (passes >= T.passCap.value) {
      flight.end = 'loop';
      return flight;
    }
    holder = friend;
  }
}

/** Every snack of a wave, and what each kid got (RULES 7). */
export function resolveSnacks(input: WaveInput): Flights {
  const { board, mode } = input;
  const placed = input.friends.filter((f) => f.cell >= 0).sort((a, b) => a.cell - b.cell);
  const occ = occupancy(board, placed, input.kids);
  const flights: Flight[] = [];
  for (const friend of placed) {
    const box = pickupFor(board, friend);
    if (box >= 0) flights.push(fly(board, occ, friend, box));
  }

  // Arrivals at each kid: fewest beats first, then the higher picker, then the one further left (D8).
  const arrivals: Arrival[] = [];
  flights.forEach((f, index) => {
    if (f.kid < 0) return;
    const kid = input.kids.find((k) => k.id === f.kid)!;
    arrivals.push({ index, kid, beats: f.beats, pickerCell: f.picker.cell });
  });
  arrivals.sort((a, b) => a.kid.id - b.kid.id || a.beats - b.beats || a.pickerCell - b.pickerCell);
  const fed = new Map<number, SnackId>();
  const aches = new Map<number, SnackId>();
  for (const a of arrivals) {
    const flight = flights[a.index]!;
    if (fed.has(a.kid.id) || aches.has(a.kid.id)) flight.end = 'wasted';
    else if (flight.snack === a.kid.wants) {
      flight.end = 'fed';
      fed.set(a.kid.id, flight.snack);
    } else if (mode === 'kindy') flight.end = 'bounced';
    else {
      flight.end = 'ache';
      aches.set(a.kid.id, flight.snack);
    }
  }

  const snacks: SnackTrace[] = flights.map((f) => ({
    snack: f.snack,
    picker: f.picker.id,
    lunchbox: f.lunchbox,
    hops: f.hops,
    beats: f.beats,
    end: f.end,
    kid: f.kid,
  }));
  return { snacks, fed, aches };
}
