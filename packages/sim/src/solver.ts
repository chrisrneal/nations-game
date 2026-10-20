import type { Board, Friend, FriendType, Mode, PlacedFriend, Puzzle, SnackId, WaveLayout } from '@snacks/contracts';
import { FACINGS, KNIGHT, COMPASS, isLine } from './geometry.ts';
import { priceOf } from './game.ts';
import { lunchboxesBeside, resolveSnacks, snackIn, type WaveKid } from './resolve.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/**
 * The placement solver (RULES 10). It searches backwards from each kid to a
 * lunchbox with the right snack, through chains of up to `routeMax` friends,
 * combines one chain per kid, and keeps a setup only when the real wave
 * engine (resolve.ts) feeds every kid with no tummy ache.
 *
 * Sound, not complete: a setup it returns always works, because the engine
 * itself checked it. It may miss a cleverer one (longer chains, a friend
 * used only to block a line); a board it cannot solve is thrown away, never
 * shown.
 */

/** One snack route: friends from the picker to the one that throws to the kid. */
export type Route = readonly PlacedFriend[];

/** Squares a snack can cross: open or path with nobody on them (friends are checked later, by the engine). */
function passable(board: Board, kidCells: ReadonlySet<number>, cell: number): boolean {
  const square = board.squares[cell];
  return (square === 'open' || square === 'path') && !kidCells.has(cell);
}

/** Every (square, type, facing) whose throw lands on `target`, on a board where only the kids stand. */
export function throwersOnto(board: Board, kidCells: ReadonlySet<number>, target: number, types: readonly FriendType[]): PlacedFriend[] {
  const { width, height } = board;
  const tx = target % width;
  const ty = Math.floor(target / width);
  const found: PlacedFriend[] = [];
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x);
  for (const type of types) {
    if (type === 'nurse') continue;
    for (const facing of FACINGS[type]) {
      const [dx, dy] = type === 'bouncer' ? KNIGHT[facing]! : COMPASS[facing]!;
      let x = tx - dx;
      let y = ty - dy;
      for (;;) {
        const cell = at(x, y);
        if (cell < 0) break;
        if (board.squares[cell] === 'open' && !kidCells.has(cell)) found.push({ type, cell, facing });
        if (!isLine(type) || !passable(board, kidCells, cell)) break;
        x -= dx;
        y -= dy;
      }
    }
  }
  return found;
}

/** The open squares a friend at `cell` could throw to a catcher on, on a board where only the kids stand. */
function catchersFrom(board: Board, kidCells: ReadonlySet<number>, cell: number, type: FriendType, facing: number): number[] {
  const { width, height } = board;
  const [dx, dy] = type === 'bouncer' ? KNIGHT[facing]! : COMPASS[facing]!;
  const found: number[] = [];
  let x = (cell % width) + dx;
  let y = Math.floor(cell / width) + dy;
  while (x >= 0 && y >= 0 && x < width && y < height) {
    const c = y * width + x;
    if (board.squares[c] === 'open') found.push(c);
    if (!isLine(type) || !passable(board, kidCells, c)) break;
    x += dx;
    y += dy;
  }
  return found;
}

/**
 * For every square: the fewest friends needed before a friend standing there
 * holds `snack` (0 beside its lunchbox), or Infinity. A square beside another
 * lunchbox, or beside two, can never be part of a route.
 */
export function upstream(board: Board, kidCells: ReadonlySet<number>, snack: SnackId, types: readonly FriendType[]): number[] {
  const up = new Array<number>(board.squares.length).fill(Infinity);
  const usable = (c: number): boolean => board.squares[c] === 'open' && lunchboxesBeside(board, c).length === 0;
  let frontier: number[] = [];
  board.squares.forEach((square, c) => {
    if (square !== 'open') return;
    const boxes = lunchboxesBeside(board, c);
    if (boxes.length === 1 && snackIn(board, boxes[0]!) === snack) {
      up[c] = 0;
      frontier.push(c);
    }
  });
  for (let level = 1; frontier.length > 0; level++) {
    const next: number[] = [];
    for (const from of frontier) {
      for (const type of types) {
        if (type === 'nurse') continue;
        for (const facing of FACINGS[type]) {
          for (const c of catchersFrom(board, kidCells, from, type, facing)) {
            if (up[c] === Infinity && usable(c)) {
              up[c] = level;
              next.push(c);
            }
          }
        }
      }
    }
    frontier = next;
  }
  return up;
}

/**
 * Every route of up to `maxLength` friends that brings `snack` to the kid at
 * `kidCell`. A friend beside a lunchbox of another snack would throw that
 * snack first, and a friend beside two cannot stand there, so neither is ever
 * part of a route; a route stops at the first friend beside the right box.
 * Squares too far from the lunchbox for the length left are never tried.
 */
export function routesTo(board: Board, kidCells: ReadonlySet<number>, kidCell: number, snack: SnackId, types: readonly FriendType[], maxLength: number): Route[] {
  const up = upstream(board, kidCells, snack, types);
  const routes: Route[] = [];
  const onto = new Map<number, PlacedFriend[]>();
  const throwers = (target: number): PlacedFriend[] => {
    let list = onto.get(target);
    if (list === undefined) {
      list = throwersOnto(board, kidCells, target, types);
      onto.set(target, list);
    }
    return list;
  };
  const chain: PlacedFriend[] = [];
  const extend = (): void => {
    const head = chain[chain.length - 1]!;
    const boxes = lunchboxesBeside(board, head.cell);
    if (boxes.length > 1) return;
    if (boxes.length === 1) {
      if (snackIn(board, boxes[0]!) === snack) routes.push([...chain].reverse());
      return;
    }
    for (const next of throwers(head.cell)) {
      if (chain.length + 1 + up[next.cell]! > maxLength) continue;
      if (chain.some((f) => f.cell === next.cell)) continue;
      chain.push(next);
      extend();
      chain.pop();
    }
  };
  for (const last of throwers(kidCell)) {
    if (1 + up[last.cell]! > maxLength) continue;
    chain.push(last);
    extend();
    chain.pop();
  }
  return routes;
}

/** What the player has to spend: friends owned (on the board or in the tray), points, and what the shop sells. */
export interface Budget {
  readonly owned: Readonly<Partial<Record<FriendType, number>>>;
  readonly points: number;
  readonly shop: readonly FriendType[];
}

export interface WaveSolution {
  readonly friends: readonly PlacedFriend[];
  /** Friends to buy first. */
  readonly buys: readonly FriendType[];
}

/** The friends a setup needs beyond what is owned, or null if the shop does not sell one of them. */
export function buysFor(friends: readonly PlacedFriend[], budget: Budget): FriendType[] | null {
  const need = new Map<FriendType, number>();
  for (const f of friends) need.set(f.type, (need.get(f.type) ?? 0) + 1);
  const buys: FriendType[] = [];
  for (const [type, count] of need) {
    const extra = count - (budget.owned[type] ?? 0);
    if (extra <= 0) continue;
    if (!budget.shop.includes(type)) return null;
    for (let i = 0; i < extra; i++) buys.push(type);
  }
  return buys;
}

function cost(buys: readonly FriendType[]): number {
  return buys.reduce((sum, t) => sum + priceOf(t), 0);
}

/** Types a route may use: those owned or for sale, never a Nurse. */
function routeTypes(budget: Budget): FriendType[] {
  return (['straight', 'diagonal', 'short', 'bouncer'] as const).filter((t) => (budget.owned[t] ?? 0) > 0 || budget.shop.includes(t));
}

/** A setup that feeds every kid of a wave with no tummy ache, within the budget, or null. */
export function solveWave(board: Board, kids: readonly WaveKid[], mode: Mode, budget: Budget): WaveSolution | null {
  if (kids.length === 0) return { friends: [], buys: [] };
  const kidCells = new Set(kids.map((k) => k.cell));
  const types = routeTypes(budget);
  const options = kids.map((kid) => {
    const routes = routesTo(board, kidCells, kid.cell, kid.wants, types, T.routeMax.value);
    // Short, cheap routes first.
    routes.sort((a, b) => a.length - b.length || cost(a.map((f) => f.type)) - cost(b.map((f) => f.type)));
    return { kid, routes };
  });
  options.sort((a, b) => a.routes.length - b.routes.length || a.kid.id - b.kid.id);
  if (options.some((o) => o.routes.length === 0)) return null;

  let tries = 0;
  const chosen: PlacedFriend[] = [];
  const search = (i: number): WaveSolution | null => {
    if (i === options.length) {
      tries += 1;
      const buys = buysFor(chosen, budget);
      if (buys === null || cost(buys) > budget.points) return null;
      const friends: Friend[] = chosen.map((f, n) => ({ id: n + 1, ...f }));
      const r = resolveSnacks({ board, friends, kids, mode });
      if (r.fed.size !== kids.length || r.aches.size > 0) return null;
      return { friends: [...chosen], buys };
    }
    for (const route of options[i]!.routes) {
      if (tries >= T.solverTries.value) return null;
      if (route.some((f) => chosen.some((c) => c.cell === f.cell))) continue;
      chosen.push(...route);
      const buys = buysFor(chosen, budget);
      const affordable = buys !== null && cost(buys) <= budget.points;
      const found = affordable ? search(i + 1) : null;
      chosen.length -= route.length;
      if (found !== null) return found;
    }
    return null;
  };
  return search(0);
}

export type DaySolution = { readonly ok: true; readonly layouts: readonly WaveLayout[] } | { readonly ok: false; readonly wave: number; readonly reason: string };

/**
 * The whole day (RULES 10): wave by wave, assuming every earlier kid was fed
 * (so no healed kid stays), with the friends owned so far, the points earned
 * so far and the shop. Each wave takes the first working setup the search
 * finds, which prefers short, cheap routes.
 */
export function solveDay(puzzle: Puzzle): DaySolution {
  const owned: Partial<Record<FriendType, number>> = {};
  for (const t of puzzle.tray) owned[t] = (owned[t] ?? 0) + 1;
  let points = 0;
  const layouts: WaveLayout[] = [];
  const lastWave = Math.max(puzzle.waves, ...puzzle.kids.map((k) => k.wave));
  for (let wave = 1; wave <= lastWave; wave++) {
    const kids: WaveKid[] = puzzle.kids.filter((k) => k.wave === wave).map((k) => ({ id: k.id, cell: k.cell, wants: k.wants }));
    const solution = solveWave(puzzle.board, kids, puzzle.mode, { owned, points, shop: puzzle.shop });
    if (solution === null) return { ok: false, wave, reason: `no setup found for wave ${wave}` };
    for (const t of solution.buys) owned[t] = (owned[t] ?? 0) + 1;
    points -= cost(solution.buys);
    points += kids.length * T.pointsPerKid.value;
    layouts.push({ wave, buys: solution.buys, friends: solution.friends });
  }
  return { ok: true, layouts };
}

/** What a Kindy wave can do with the kids standing there (K8): a setup, and the kids it feeds. */
export interface Progress {
  readonly friends: readonly PlacedFriend[];
  readonly fed: readonly number[];
}

/** The kids a setup feeds when every kid in `kids` stands on the board. */
export function fedBy(board: Board, friends: readonly PlacedFriend[], kids: readonly WaveKid[], mode: Mode): ReadonlyMap<number, SnackId> {
  return resolveSnacks({ board, friends: friends.map((f, n) => ({ id: n + 1, ...f })), kids, mode }).fed;
}

/**
 * A Kindy wave with kids left waiting (RULES 11, D15, K8): a setup that feeds
 * every kid on the board if the solver finds one; otherwise one that feeds
 * the longest-waiting kid it can, checked by the engine with every other kid
 * standing in the way. `prefer` offers setups to try for a kid before the
 * solver (the stored solution for the wave they came in). Null when no kid
 * can be fed.
 */
export function feedSome(board: Board, kids: readonly WaveKid[], mode: Mode, budget: Budget, prefer: (kid: WaveKid) => readonly (readonly PlacedFriend[])[] = () => []): Progress | null {
  if (kids.length === 0) return null;
  const all = solveWave(board, kids, mode, budget);
  if (all !== null && all.buys.length === 0) return { friends: all.friends, fed: kids.map((k) => k.id) };
  const oldest = [...kids].sort((a, b) => a.id - b.id);
  for (const kid of oldest) {
    const own = solveWave(board, [kid], mode, budget);
    const options = [...prefer(kid), ...(own !== null && own.buys.length === 0 ? [own.friends] : [])];
    for (const friends of options) {
      const fed = fedBy(board, friends, kids, mode);
      if (fed.has(kid.id)) return { friends, fed: oldest.filter((k) => fed.has(k.id)).map((k) => k.id) };
    }
  }
  return null;
}

/**
 * The first set of Kindy kids who could be waiting together (any of them may
 * miss a wave, so any set can) and of whom none can be fed with the friends
 * given; null when there is none, so a Kindy day can always be finished (K8).
 */
export function stuckKindySet(puzzle: Puzzle): number[] | null {
  const owned: Partial<Record<FriendType, number>> = {};
  for (const t of puzzle.tray) owned[t] = (owned[t] ?? 0) + 1;
  const budget: Budget = { owned, points: 0, shop: puzzle.shop };
  const kids: WaveKid[] = puzzle.kids.map((k) => ({ id: k.id, cell: k.cell, wants: k.wants }));
  for (let mask = 1; mask < 1 << kids.length; mask++) {
    const waiting = kids.filter((_, i) => (mask & (1 << i)) !== 0);
    if (feedSome(puzzle.board, waiting, puzzle.mode, budget) === null) return waiting.map((k) => k.id);
  }
  return null;
}
