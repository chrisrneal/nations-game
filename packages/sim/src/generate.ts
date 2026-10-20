import type {
  Board,
  Clue,
  ClueFact,
  FriendType,
  KidFeature,
  KidLook,
  Lunchbox,
  Mode,
  PlacedFriend,
  Puzzle,
  PuzzleKid,
  Round,
  RngState,
  SnackId,
  SquareKind,
} from '@snacks/contracts';
import { clueProblems, directClues } from './clues.ts';
import { priceOf } from './game.ts';
import { THROWERS } from './geometry.ts';
import { lunchboxesBeside, resolveSnacks } from './resolve.ts';
import { mix32, randomInt, seedRng } from './rng.ts';
import { SNACK_IDS } from './snacks.ts';
import { routesTo, solveDay, stuckKindySet, throwersOnto, upstream } from './solver.ts';
import { trayUse } from './tray.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/**
 * The puzzle generator (RULES 10): plant a solution, then check it.
 *
 * From a seed it lays out a board, then wave by wave puts kids on the path
 * where the shortest route to their snack has the length that wave calls for,
 * and plants one such route. It writes clues that pin each kid's snack, sets
 * the tray so the planted day is affordable, and finally runs both checkers:
 * the clue checker and the day solver, whose own solution becomes the
 * witness. A Kindy day is also checked never to get stuck, whichever kids are
 * left waiting (K8). Any failure moves on to the next seed, so a day's puzzle
 * is still the same for everyone.
 */

/** A tiny wrapper so generation code reads as draws, not RNG plumbing. */
class Dice {
  constructor(private rng: RngState) {}
  int(min: number, max: number): number {
    const r = randomInt(this.rng, min, max);
    this.rng = r.rng;
    return r.value;
  }
  chance(percent: number): boolean {
    return this.int(0, 99) < percent;
  }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from nothing');
    return items[this.int(0, items.length - 1)]!;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** What kind of day to make. */
interface Plan {
  readonly mode: Mode;
  readonly round: Round;
  readonly width: number;
  readonly height: number;
  readonly waves: number;
  readonly snacks: number;
  readonly obstacles: readonly [number, number];
  readonly tables: number;
  readonly types: readonly FriendType[];
  readonly shop: readonly FriendType[];
  /** Kids arriving at wave w (1-based). */
  kidsAt(w: number, dice: Dice): number;
  /** The shortest route each kid of wave w should need: [fewest, most] friends. */
  routeAt(w: number): readonly [number, number];
  /** What the kids' shortest routes at wave w must add up to, or null for no rule (the bonus ramp). */
  totalAt(w: number): number | null;
  /** Tries at a wave's kids before the seed is given up. */
  readonly attempts: number;
  /** Percent chance a wave's clues point at another kid. */
  relationalAt(w: number): number;
  /** Decoy friends added to the starting tray (K11). */
  readonly decoys: number;
}

/** A whole-number straight line from `first` at wave 1 to `last` at the last wave, rounded to the nearest. */
function ramp(first: number, last: number, w: number, waves: number): number {
  const span = Math.max(1, waves - 1);
  const step = (last - first) * (Math.min(Math.max(w, 1), waves) - 1);
  return first + Math.floor((2 * step + span) / (2 * span));
}

/**
 * The bonus round's ramp (RULES 10, K11): the friends the shortest routes of
 * bonus wave w add up to, for its 2 kids, rising from `bonusFriendsFirst` to
 * `bonusFriendsLast`.
 */
export function bonusFriendsAt(w: number): number {
  return ramp(T.bonusFriendsFirst.value, T.bonusFriendsLast.value, w, T.mainWaves.value);
}

/** Percent chance bonus wave w has a card pointing at another kid, rising from `bonusCluesFirst` to `bonusCluesLast`. */
export function bonusCluesAt(w: number): number {
  return ramp(T.bonusCluesFirst.value, T.bonusCluesLast.value, w, T.mainWaves.value);
}

function planFor(mode: Mode, round: Round): Plan {
  if (mode === 'kindy') {
    const size = T.kindySize.value;
    return {
      mode,
      round,
      width: size,
      height: size,
      waves: T.kindyWaves.value,
      snacks: T.kindySnacks.value,
      obstacles: [0, 1],
      tables: 0,
      types: ['straight'],
      shop: [],
      kidsAt: () => 1,
      routeAt: (w) => (w <= 2 ? [1, 1] : [1, 2]),
      totalAt: () => null,
      attempts: 40,
      relationalAt: () => 0,
      decoys: 0,
    };
  }
  const bonus = round === 'bonus';
  const extra = bonus ? T.bonusObstacles.value : 0;
  return {
    mode,
    round,
    width: T.mainWidth.value,
    height: T.mainHeight.value,
    waves: T.mainWaves.value,
    snacks: T.snacksPerDay.value,
    obstacles: [T.obstaclesMin.value + extra, T.obstaclesMax.value + extra],
    tables: 2,
    types: THROWERS,
    shop: ['short', 'straight', 'diagonal', 'bouncer', 'nurse'],
    // Main: 1 kid in waves 1-3, then 1 or 2, then 2. Bonus: 2 a wave.
    kidsAt: (w, dice) => (bonus ? 2 : w <= 3 ? 1 : w <= 6 ? dice.int(1, 2) : 2),
    // Main: the first waves need one friend, the middle two, the last two or three.
    // Bonus: any route length, as long as the two kids' add up to the ramp's number.
    routeAt: (w) => (bonus ? [1, T.routeMax.value] : w <= 2 ? [1, 1] : w <= 5 ? [1, 2] : w <= 8 ? [2, 2] : [2, 3]),
    totalAt: (w) => (bonus ? bonusFriendsAt(w) : null),
    attempts: bonus ? 120 : 40,
    relationalAt: (w) => (bonus ? bonusCluesAt(w) : w <= 3 ? 0 : 35),
    decoys: T.decoys.value,
  };
}

const at = (width: number, x: number, y: number): number => y * width + x;

/** A path from the school gate (top) to home (bottom), wandering sideways now and then. */
function layPath(squares: SquareKind[], plan: Plan, dice: Dice): void {
  const { width, height } = plan;
  let x = dice.int(1, width - 2);
  for (let y = 0; y < height; y++) {
    squares[at(width, x, y)] = 'path';
    if (y < height - 1 && dice.chance(plan.mode === 'kindy' ? 50 : 40)) {
      const dir = x <= 1 ? 1 : x >= width - 2 ? -1 : dice.pick([-1, 1]);
      const steps = plan.mode === 'kindy' ? 1 : dice.int(1, 2);
      for (let i = 0; i < steps; i++) {
        const nx = x + dir;
        if (nx < 0 || nx >= width) break;
        x = nx;
        squares[at(width, x, y)] = 'path';
      }
    }
  }
}

function manhattan(width: number, a: number, b: number): number {
  return Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width));
}

/** Every pair of day snacks must be told apart by a one- or two-fact clue, or the day cannot have clues. */
function snacksTellable(snacks: readonly SnackId[]): boolean {
  return snacks.every((s) => directClues([s], snacks).length > 0);
}

function layBoard(plan: Plan, dice: Dice): { board: Board; snacks: SnackId[] } | null {
  const { width, height } = plan;
  const squares: SquareKind[] = new Array(width * height).fill('open');
  layPath(squares, plan, dice);
  let snacks: SnackId[] = [];
  for (let i = 0; i < 20 && snacks.length === 0; i++) {
    const pick = dice.shuffle(SNACK_IDS).slice(0, plan.snacks);
    if (plan.mode === 'kindy' || snacksTellable(pick)) snacks = pick;
  }
  if (snacks.length === 0) return null;

  // Lunchboxes on the playground, apart from each other, each with a free side for a picker.
  const lunchboxes: Lunchbox[] = [];
  const minApart = plan.mode === 'kindy' ? 2 : 3;
  for (const snack of snacks) {
    const open = squares.flatMap((s, c) => (s === 'open' && lunchboxes.every((l) => manhattan(width, l.cell, c) >= minApart) ? [c] : []));
    if (open.length === 0) return null;
    const cell = dice.pick(open);
    squares[cell] = 'lunchbox';
    lunchboxes.push({ cell, snack });
  }
  lunchboxes.sort((a, b) => a.cell - b.cell);

  const free = (): number[] => squares.flatMap((s, c) => (s === 'open' ? [c] : []));
  const tables = Math.min(plan.tables, 2);
  for (let i = 0; i < tables; i++) {
    const edge = free().filter((c) => c % width === 0 || c % width === width - 1);
    if (edge.length > 0) squares[dice.pick(edge)] = 'table';
  }
  const obstacles = dice.int(plan.obstacles[0], plan.obstacles[1]);
  for (let i = 0; i < obstacles; i++) {
    const options = free();
    if (options.length > 0) squares[dice.pick(options)] = 'obstacle';
  }
  const board: Board = { width, height, squares, lunchboxes };
  // Every lunchbox keeps a square beside it where a picker may stand.
  const pickerSpot = (l: Lunchbox): boolean => squares.some((s, c) => s === 'open' && manhattan(width, c, l.cell) === 1 && lunchboxesBeside(board, c).length === 1);
  if (!lunchboxes.every(pickerSpot)) return null;
  return { board, snacks };
}

/** The fewest friends any route needs to bring `snack` to the kid at `cell`, or Infinity. */
function shortestRoute(board: Board, kidCells: ReadonlySet<number>, cell: number, snack: SnackId, types: readonly FriendType[]): number {
  const up = upstream(board, kidCells, snack, types);
  let best = Infinity;
  for (const t of throwersOnto(board, kidCells, cell, types)) best = Math.min(best, 1 + up[t.cell]!);
  return best;
}

interface PlantedWave {
  readonly kids: { cell: number; wants: SnackId }[];
  readonly friends: PlacedFriend[];
}

/** Kids for one wave and a planted setup that feeds them all, or null. */
function plantWave(board: Board, snacks: readonly SnackId[], plan: Plan, wave: number, count: number, forbidden: ReadonlySet<number>, spots: readonly Spot[], dice: Dice): PlantedWave | null {
  const pathCells = board.squares.flatMap((s, c) => (s === 'path' && !forbidden.has(c) ? [c] : []));
  if (pathCells.length < count) return null;
  const [shortest, longest] = plan.routeAt(wave);
  const total = plan.totalAt(wave);
  const pairs = total === null ? [] : pairsAdding(spots.filter((s) => !forbidden.has(s.cell) && s.length >= shortest && s.length <= longest), total, dice);
  for (let attempt = 0; attempt < plan.attempts; attempt++) {
    let cells: number[];
    let wants: SnackId[];
    if (total === null) {
      cells = dice.shuffle(pathCells).slice(0, count);
      const sameSnack = count === 2 && dice.chance(30);
      const first = dice.pick(snacks);
      wants = cells.map((_, i) => (i === 0 || sameSnack ? first : dice.pick(snacks.filter((s) => s !== first))));
    } else {
      const pair = pairs[attempt];
      if (pair === undefined || count !== 2) break;
      cells = [pair[0].cell, pair[1].cell];
      wants = [pair[0].snack, pair[1].snack];
    }
    const kidCells = new Set(cells);
    const lengths = cells.map((cell, i) => shortestRoute(board, kidCells, cell, wants[i]!, plan.types));
    if (lengths.some((length) => length < shortest || length > longest)) continue;
    if (total !== null && lengths.reduce((a, b) => a + b, 0) !== total) continue;
    const friends: PlacedFriend[] = [];
    let ok = true;
    for (let i = 0; i < count && ok; i++) {
      const length = lengths[i]!;
      const routes = routesTo(board, kidCells, cells[i]!, wants[i]!, plan.types, length).filter(
        (r) => r.length === length && r.every((f) => friends.every((g) => g.cell !== f.cell)),
      );
      if (routes.length === 0) ok = false;
      else friends.push(...dice.pick(routes));
    }
    if (!ok) continue;
    const kids = cells.map((cell, i) => ({ id: i + 1, cell, wants: wants[i]! }));
    const r = resolveSnacks({ board, friends: friends.map((f, i) => ({ id: i + 1, ...f })), kids, mode: plan.mode });
    if (r.fed.size !== count || r.aches.size > 0) continue;
    return { kids: kids.map((k) => ({ cell: k.cell, wants: k.wants })), friends };
  }
  return null;
}

/**
 * The fewest friends any route needs to feed each kid of a wave, with that
 * wave's kids on the path (RULES 10): what the generator planted to, and what
 * the harness checks the bonus ramp against.
 */
export function shortestRoutes(puzzle: Puzzle, wave: number): number[] {
  const kids = puzzle.kids.filter((k) => k.wave === wave);
  const kidCells = new Set(kids.map((k) => k.cell));
  return kids.map((k) => shortestRoute(puzzle.board, kidCells, k.cell, k.wants, planFor(puzzle.mode, puzzle.round).types));
}

/** A kid's square and snack, and the fewest friends that bring it there with nobody else on the path. */
interface Spot {
  readonly cell: number;
  readonly snack: SnackId;
  readonly length: number;
}

/** Every path square and snack, with the fewest friends that bring that snack there when that kid is the only one on the path. */
function spotsOn(board: Board, snacks: readonly SnackId[], plan: Plan): Spot[] {
  const path = board.squares.flatMap((s, c) => (s === 'path' ? [c] : []));
  return path.flatMap((cell) => snacks.map((snack) => ({ cell, snack, length: shortestRoute(board, new Set([cell]), cell, snack, plan.types) })));
}

/** Pairs of spots on different squares whose lengths add up to `total`. */
function pairsOf(spots: readonly Spot[], total: number): [Spot, Spot][] {
  const pairs: [Spot, Spot][] = [];
  for (const a of spots) for (const b of spots) if (a.cell < b.cell && a.length + b.length === total) pairs.push([a, b]);
  return pairs;
}

/**
 * The bonus ramp (K11): pairs of kids whose shortest routes, each on their
 * own, add up to `total`, in a random order. Picking from these instead of
 * at random makes a long-route wave quick to find; the two kids are checked
 * together afterwards, since one can stand in the other's way.
 */
function pairsAdding(spots: readonly Spot[], total: number, dice: Dice): [Spot, Spot][] {
  return dice.shuffle(pairsOf(spots, total).map(([a, b]) => (dice.chance(50) ? [a, b] : [b, a])));
}

/**
 * Can this board carry the ramp's hardest wave twice running? A wave's kids
 * never arrive where the last wave's stood, so the hardest total needs two
 * pairs on four different squares. Boards without them are thrown away
 * before any kid is planted, which keeps a bonus day quick to make.
 */
function rampFits(spots: readonly Spot[], plan: Plan): boolean {
  const totals = Array.from({ length: plan.waves }, (_, i) => plan.totalAt(i + 1) ?? 0);
  const pairs = pairsOf(spots, Math.max(...totals));
  return pairs.some(([a, b]) => pairs.some(([c, d]) => new Set([a.cell, b.cell, c.cell, d.cell]).size === 4));
}

/**
 * The starting tray: what the planted day needs beyond what the points earned
 * so far can buy, buying the cheapest friends first.
 */
function trayFor(planted: readonly PlantedWave[], plan: Plan): FriendType[] {
  const owned = new Map<FriendType, number>();
  const tray: FriendType[] = [];
  let points = 0;
  for (const wave of planted) {
    const need = new Map<FriendType, number>();
    for (const f of wave.friends) need.set(f.type, (need.get(f.type) ?? 0) + 1);
    const missing: FriendType[] = [];
    for (const [type, count] of need) for (let i = owned.get(type) ?? 0; i < count; i++) missing.push(type);
    missing.sort((a, b) => priceOf(a) - priceOf(b));
    for (const type of missing) {
      if (plan.shop.includes(type) && points >= priceOf(type)) points -= priceOf(type);
      else tray.push(type);
      owned.set(type, (owned.get(type) ?? 0) + 1);
    }
    points += wave.kids.length * T.pointsPerKid.value;
  }
  return tray;
}

const NO_LOOK: KidLook = { shirt: 0, hat: false, glasses: false, backpack: false, sister: 0 };

/** Clues for one wave's kids (RULES 6), and the looks the relational ones point at. */
function writeClues(kids: { wants: SnackId }[], snacks: readonly SnackId[], plan: Plan, wave: number, lastFeature: KidFeature | null, sisterId: number, dice: Dice): { clues: Clue[]; looks: KidLook[]; feature: KidFeature | null; sister: boolean } {
  const looks: KidLook[] = kids.map(() => ({ ...NO_LOOK, backpack: dice.chance(25) }));
  const direct = (s: SnackId): Clue => {
    const options = directClues([s], snacks);
    const one = options.filter((c) => c.facts.length === 1);
    const two = options.filter((c) => c.facts.length === 2);
    const preferTwo = wave > 4 && dice.chance(40);
    return dice.pick(preferTwo && two.length > 0 ? two : one.length > 0 ? one : two);
  };
  const relational = kids.length === 2 && dice.chance(plan.relationalAt(wave));
  const [a, b] = kids;
  if (relational && a !== undefined && b !== undefined) {
    if (a.wants === b.wants) {
      const feature: KidFeature = lastFeature === 'hat' ? 'glasses' : 'hat';
      looks[0] = { ...looks[0]!, [feature]: true };
      return { clues: [direct(a.wants), { facts: [{ kind: 'same', feature }] }], looks, feature, sister: false };
    }
    // Sisters: a fact that leaves both snacks, and "not their sister's".
    const halves = directClues([a.wants, b.wants], snacks).filter((c) => c.facts.length === 1);
    if (halves.length > 0) {
      looks[0] = { ...looks[0]!, sister: sisterId };
      looks[1] = { ...looks[1]!, sister: sisterId };
      const half = dice.pick(halves).facts[0]!;
      const facts: ClueFact[] = [half, { kind: 'notSister' }];
      return { clues: [direct(a.wants), { facts }], looks, feature: null, sister: true };
    }
  }
  return { clues: kids.map((k) => direct(k.wants)), looks, feature: null, sister: false };
}

/** Shirts: sisters match; everyone else on the board at the same time differs. */
function dressKids(kids: PuzzleKid[], dice: Dice): PuzzleKid[] {
  const out: PuzzleKid[] = [];
  for (const kid of kids) {
    const nearby = out.filter((k) => Math.abs(k.wave - kid.wave) <= 1);
    const sister = nearby.find((k) => kid.look.sister > 0 && k.look.sister === kid.look.sister);
    const taken = new Set(nearby.map((k) => k.look.shirt));
    const shirt = sister !== undefined ? sister.look.shirt : dice.pick([0, 1, 2, 3, 4, 5].filter((s) => !taken.has(s)).concat(taken.size >= 6 ? [0] : []));
    out.push({ ...kid, look: { ...kid.look, shirt } });
  }
  return out;
}

/** One try at a day from one seed; null if this seed does not make a good one. */
export function tryGenerate(mode: Mode, round: Round, day: number, seed: number): Puzzle | null {
  const plan = planFor(mode, round);
  const dice = new Dice(seedRng(seed));
  const laid = layBoard(plan, dice);
  if (laid === null) return null;
  const { board, snacks } = laid;
  const spots = plan.totalAt(1) === null ? [] : spotsOn(board, snacks, plan);
  if (plan.totalAt(1) !== null && !rampFits(spots, plan)) return null;

  const planted: PlantedWave[] = [];
  let kids: PuzzleKid[] = [];
  let lastFeature: KidFeature | null = null;
  let sisters = 0;
  for (let wave = 1; wave <= plan.waves; wave++) {
    // Main: a healed kid from the last wave may still stand there. Kindy: every earlier kid may still be waiting.
    const forbidden = new Set(kids.filter((k) => (mode === 'kindy' ? true : k.wave === wave - 1)).map((k) => k.cell));
    const count = plan.kidsAt(wave, dice);
    const w = plantWave(board, snacks, plan, wave, count, forbidden, spots, dice);
    if (w === null) return null;
    planted.push(w);
    let clues: (Clue | null)[] = w.kids.map(() => null);
    let looks: KidLook[] = w.kids.map(() => ({ ...NO_LOOK, backpack: dice.chance(25) }));
    let feature: KidFeature | null = null;
    if (mode === 'main') {
      const written = writeClues(w.kids, snacks, plan, wave, lastFeature, sisters + 1, dice);
      clues = written.clues;
      looks = written.looks;
      feature = written.feature;
      if (written.sister) sisters += 1;
    }
    lastFeature = feature;
    w.kids.forEach((k, i) => kids.push({ id: kids.length + 1, wave, cell: k.cell, wants: k.wants, look: looks[i]!, clue: clues[i]! }));
  }
  kids = dressKids(kids, dice);

  const needed = trayFor(planted, plan).sort((a, b) => THROWERS.indexOf(a) - THROWERS.indexOf(b));
  const draft: Puzzle = {
    mode,
    round,
    day,
    seed,
    board,
    snacks,
    kids,
    waves: plan.waves,
    tray: needed,
    shop: plan.shop,
    hungryAllowed: mode === 'kindy' ? 0 : T.hungryAllowed.value,
    difficulty: [],
    witness: [],
  };
  if (clueProblems(draft).length > 0) return null;
  const solved = solveDay(draft);
  if (!solved.ok) return null;
  // Kindy can't be lost (K8): whichever kids are left waiting, some kid can always be fed with the friends given.
  if (mode === 'kindy' && stuckKindySet(draft) !== null) return null;
  const solvedDraft = { ...draft, witness: solved.layouts };
  const done = { ...solvedDraft, difficulty: difficultyOf(solvedDraft) };
  if (plan.decoys === 0) return done;
  // The tray must not give the answer away (K11): a friend the solution never places, and no wave that places every friend owned.
  const decoyed = withDecoys(done, plan, dice);
  const use = trayUse(decoyed);
  return use.unused > 0 && use.tells.length === 0 ? decoyed : null;
}

/**
 * The tray with decoys (K11): friends the stored solution does not need, so
 * the tray is not just the answer's pieces.
 *
 * - The solution the solver proved on the planted tray still works: owning
 *   more friends never stops a setup, and what it buys costs the same.
 * - The first decoy is a spare for certain: a type of which the tray already
 *   holds as many as the solution ever places at once (so one is always left
 *   over, on every wave). A type the solution never uses is taken first, so
 *   the mix of types says less too.
 * - Any more decoys are any type that throws. One of a type the solution
 *   buys later is fine: it saves the player points.
 */
function withDecoys(puzzle: Puzzle, plan: Plan, dice: Dice): Puzzle {
  const peak = (type: FriendType): number => Math.max(0, ...puzzle.witness.map((l) => l.friends.filter((f) => f.type === type).length));
  const tray = [...puzzle.tray];
  for (let i = 0; i < plan.decoys; i++) {
    const held = (type: FriendType): number => tray.filter((t) => t === type).length;
    const spare = plan.types.filter((t) => held(t) >= peak(t));
    const unusedTypes = spare.filter((t) => peak(t) === 0);
    tray.push(dice.pick(i > 0 || spare.length === 0 ? plan.types : unusedTypes.length > 0 ? unusedTypes : spare));
  }
  return { ...puzzle, tray: tray.sort((a, b) => THROWERS.indexOf(a) - THROWERS.indexOf(b)) };
}

/** How hard each wave is (RULES 10): friends in the solution plus kids whose card points at another kid. */
function difficultyOf(puzzle: Puzzle): number[] {
  return puzzle.witness.map((layout) => {
    const relational = puzzle.kids.filter((k) => k.wave === layout.wave && k.clue !== null && k.clue.facts.some((f) => f.kind === 'same' || f.kind === 'notSister')).length;
    return layout.friends.length + relational;
  });
}

const SALT: Readonly<Record<string, number>> = { 'main/daily': 0x51ac, 'main/bonus': 0xb0b5, 'main/practice': 0x9ac7, 'kindy/daily': 0x4b1d, 'kindy/bonus': 0x4b1e, 'kindy/practice': 0x4b1f };

/** The first seed a day's puzzle tries: the same on every device for that day (RULES 9). */
export function daySeed(mode: Mode, round: Round, day: number): number {
  return mix32(Math.imul(day, 0x9e3779b1) ^ (SALT[`${mode}/${round}`] ?? 0x7a11));
}

/**
 * A puzzle for a day (daily, bonus) or a practice seed: the first seed from
 * the start that yields a good one, trying `generatorSeeds` seeds at most.
 */
export function generatePuzzle(mode: Mode, round: Round, day: number, seed: number): Puzzle {
  // Scrambled first, so practice seeds 1 and 2 never land on the same board by both skipping to the same seed.
  const start = round === 'practice' ? mix32(seed ^ (SALT[`${mode}/practice`] ?? 0x7a11)) : daySeed(mode, round, day);
  for (let i = 0; i < T.generatorSeeds.value; i++) {
    const puzzle = tryGenerate(mode, round, round === 'practice' ? 0 : day, (start + i) >>> 0);
    if (puzzle !== null) return puzzle;
  }
  throw new Error(`No puzzle found for ${mode} ${round} day ${day} seed ${seed}`);
}
