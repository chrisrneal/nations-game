import type {
  Checkpoint,
  Friend,
  FriendType,
  GameCommand,
  GameState,
  KidOnBoard,
  KidOutcome,
  Puzzle,
  PuzzleKid,
  WaveResult,
} from '@snacks/contracts';
import { validFacing } from './geometry.ts';
import { lunchboxesBeside, resolveSnacks, type WaveKid } from './resolve.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/**
 * A day of play (RULES 7, 8): commands between waves, Go, and what the end of
 * a wave does. `step` is the only way a game changes (S1, S2).
 */

/** Current save schema. Bump it with a migration in save.ts. */
export const SCHEMA_VERSION = 1;

export function priceOf(type: FriendType): number {
  switch (type) {
    case 'short':
      return T.priceShort.value;
    case 'straight':
      return T.priceStraight.value;
    case 'diagonal':
      return T.priceDiagonal.value;
    case 'bouncer':
      return T.priceBouncer.value;
    case 'nurse':
      return T.priceNurse.value;
  }
}

function arrivals(puzzle: Puzzle, wave: number): KidOnBoard[] {
  return puzzle.kids.filter((k) => k.wave === wave).map((k) => ({ id: k.id, cell: k.cell, healed: false }));
}

function checkpointOf(s: Omit<GameState, 'checkpoint'>): Checkpoint {
  return { wave: s.wave, friends: s.friends, nextFriendId: s.nextFriendId, kids: s.kids, points: s.points, hungry: s.hungry, fed: s.fed };
}

/** A new game of a puzzle: the tray filled, wave 1's kids on the path. */
export function startGame(puzzle: Puzzle): GameState {
  const friends: Friend[] = puzzle.tray.map((type, i) => ({ id: i + 1, type, cell: -1, facing: 0 }));
  const base = {
    schemaVersion: SCHEMA_VERSION,
    puzzle,
    wave: 1,
    phase: 'setup' as const,
    friends,
    nextFriendId: friends.length + 1,
    kids: arrivals(puzzle, 1),
    points: 0,
    hungry: 0,
    fed: 0,
    lastWave: null,
  };
  return { ...base, checkpoint: checkpointOf(base) };
}

export interface StepResult {
  readonly state: GameState;
  /** Why the command was refused, in words a player can read; null if it was applied. */
  readonly error: string | null;
  /** What the wave did, when the command was Go. */
  readonly wave: WaveResult | null;
}

function refuse(state: GameState, error: string): StepResult {
  return { state, error, wave: null };
}

/**
 * A friend bought since this setup began (K9): its id is at least the next id
 * the checkpoint had, because only buying makes new friends. Set again at
 * every Go and kept by a retry, so nothing reaches past Go.
 */
export function boughtThisSetup(state: GameState, friend: Friend): boolean {
  return friend.id >= state.checkpoint.nextFriendId;
}

/** Why a friend may not stand on a square, or null (RULES 3, 5). */
export function placementProblem(state: GameState, friend: Friend, cell: number, facing: number): string | null {
  const board = state.puzzle.board;
  if (!Number.isInteger(cell) || cell < 0 || cell >= board.squares.length) return 'That square is not on the board.';
  if (board.squares[cell] !== 'open') return 'Friends stand only on the playground (grey squares).';
  if (state.friends.some((f) => f.cell === cell && f.id !== friend.id)) return 'Another friend is standing there.';
  if (!validFacing(friend.type, facing)) return 'That friend cannot face that way.';
  if (friend.type !== 'nurse' && lunchboxesBeside(board, cell).length > 1) return 'A friend cannot stand next to two lunchboxes.';
  return null;
}

/** Applies one command. A refused command leaves the state as it was and says why. */
export function step(state: GameState, command: GameCommand): StepResult {
  if (command.type === 'retry') {
    if (state.phase !== 'lost') return refuse(state, 'Only a lost day can be tried again.');
    const c = state.checkpoint;
    return {
      state: { ...state, phase: 'setup', wave: c.wave, friends: c.friends, nextFriendId: c.nextFriendId, kids: c.kids, points: c.points, hungry: c.hungry, fed: c.fed, lastWave: null },
      error: null,
      wave: null,
    };
  }
  if (state.phase !== 'setup') return refuse(state, 'The day is over.');
  switch (command.type) {
    case 'place': {
      const friend = state.friends.find((f) => f.id === command.friend);
      if (friend === undefined) return refuse(state, 'No such friend.');
      const problem = placementProblem(state, friend, command.cell, command.facing);
      if (problem !== null) return refuse(state, problem);
      return applied(state, { friends: state.friends.map((f) => (f.id === friend.id ? { ...f, cell: command.cell, facing: command.facing } : f)) });
    }
    case 'turn': {
      const friend = state.friends.find((f) => f.id === command.friend);
      if (friend === undefined) return refuse(state, 'No such friend.');
      if (!validFacing(friend.type, command.facing)) return refuse(state, 'That friend cannot face that way.');
      return applied(state, { friends: state.friends.map((f) => (f.id === friend.id ? { ...f, facing: command.facing } : f)) });
    }
    case 'toTray': {
      if (!state.friends.some((f) => f.id === command.friend)) return refuse(state, 'No such friend.');
      return applied(state, { friends: state.friends.map((f) => (f.id === command.friend ? { ...f, cell: -1 } : f)) });
    }
    case 'buy': {
      if (!state.puzzle.shop.includes(command.friend)) return refuse(state, 'The shop does not sell that friend today.');
      const price = priceOf(command.friend);
      if (state.points < price) return refuse(state, 'Not enough points yet.');
      const friend: Friend = { id: state.nextFriendId, type: command.friend, cell: -1, facing: 0 };
      return applied(state, { friends: [...state.friends, friend], nextFriendId: state.nextFriendId + 1, points: state.points - price });
    }
    case 'refund': {
      const friend = state.friends.find((f) => f.id === command.friend);
      if (friend === undefined) return refuse(state, 'No such friend.');
      if (!boughtThisSetup(state, friend)) return refuse(state, 'Only friends bought since the last Go can be given back.');
      return applied(state, { friends: state.friends.filter((f) => f.id !== friend.id), points: state.points + priceOf(friend.type) });
    }
    case 'go':
      return go(state);
    default:
      return refuse(state, 'Unknown command.');
  }
}

function applied(state: GameState, change: Partial<GameState>): StepResult {
  return { state: { ...state, ...change }, error: null, wave: null };
}

function puzzleKid(puzzle: Puzzle, id: number): PuzzleKid {
  const kid = puzzle.kids.find((k) => k.id === id);
  if (kid === undefined) throw new Error(`No kid ${id} in the puzzle`);
  return kid;
}

/** Chebyshev distance: squares any way, diagonals included. */
function reach(width: number, a: number, b: number): number {
  return Math.max(Math.abs((a % width) - (b % width)), Math.abs(Math.floor(a / width) - Math.floor(b / width)));
}

/** Go (RULES 7): the wave plays out in full, then the end of the wave, then the next wave's kids arrive. */
function go(state: GameState): StepResult {
  const { puzzle } = state;
  const kindy = puzzle.mode === 'kindy';
  const waveKids: WaveKid[] = state.kids.map((k) => ({ id: k.id, cell: k.cell, wants: puzzleKid(puzzle, k.id).wants }));
  const flights = resolveSnacks({ board: puzzle.board, friends: state.friends, kids: waveKids, mode: puzzle.mode });
  const nurses = state.friends.filter((f) => f.type === 'nurse' && f.cell >= 0);

  const outcomes: KidOutcome[] = [];
  const staying: KidOnBoard[] = [];
  let fedNow = 0;
  let hungryNow = 0;
  for (const kid of state.kids) {
    const fed = flights.fed.get(kid.id);
    const ache = flights.aches.get(kid.id);
    if (fed !== undefined) {
      fedNow += 1;
      outcomes.push({ kid: kid.id, end: 'happy', ache: false, ate: fed });
    } else if (kindy) {
      staying.push(kid);
      outcomes.push({ kid: kid.id, end: 'waits', ache: false, ate: null });
    } else if (ache !== undefined && !kid.healed && nurses.some((n) => reach(puzzle.board.width, n.cell, kid.cell) <= T.nurseRange.value)) {
      // A Nurse heals a tummy ache once; the kid stays one more wave, still hungry (D3).
      staying.push({ ...kid, healed: true });
      outcomes.push({ kid: kid.id, end: 'healed', ache: true, ate: ache });
    } else {
      hungryNow += 1;
      outcomes.push({ kid: kid.id, end: 'hungry', ache: ache !== undefined, ate: ache ?? null });
    }
  }

  const points = fedNow * T.pointsPerKid.value;
  let hungry = state.hungry + hungryNow;
  const fed = state.fed + fedNow;
  let wave = state.wave + 1;
  let kids = staying;
  let phase: GameState['phase'] = 'setup';
  if (!kindy && hungry > puzzle.hungryAllowed) {
    phase = 'lost';
    wave = state.wave;
  } else if (!kindy && wave > puzzle.waves) {
    // The day ends: a healed kid still waiting goes home hungry.
    hungry += kids.length;
    kids = [];
    wave = puzzle.waves;
    phase = hungry > puzzle.hungryAllowed ? 'lost' : 'won';
  } else {
    const arriving = arrivals(puzzle, wave);
    for (const a of arriving) {
      if (kids.some((k) => k.cell === a.cell)) throw new Error(`Puzzle broken: kid ${a.id} arrives on an occupied square`);
    }
    kids = [...kids, ...arriving];
    const lastArrival = Math.max(...puzzle.kids.map((k) => k.wave));
    if (kindy && kids.length === 0 && wave > lastArrival) {
      phase = 'won';
      wave -= 1;
    }
  }

  const result: WaveResult = { wave: state.wave, snacks: flights.snacks, kids: outcomes, points, wentHungry: hungryNow };
  const next = { schemaVersion: state.schemaVersion, puzzle, wave, phase, friends: state.friends, nextFriendId: state.nextFriendId, kids, points: state.points + points, hungry, fed, lastWave: result };
  // A new wave's setup is the point a retry goes back to; a lost day keeps the failed wave's.
  const checkpoint = phase === 'setup' ? checkpointOf(next) : state.checkpoint;
  return { state: { ...next, checkpoint }, error: null, wave: result };
}
