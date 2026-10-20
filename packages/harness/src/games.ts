/**
 * Headless Snack Attack: scripted games for the determinism check, and the
 * generator report (RULES 10). Pure code over @snacks/sim, so it bundles for
 * Chromium too (browser-entry.ts); the caller passes in a timer.
 */
import type { GameState, Mode, Puzzle, Round } from '@snacks/contracts';
import { SNACK_TUNABLES, bonusFriendsAt, clueProblems, daySeed, generatePuzzle, hashState, playWitness, shortestRoutes, solveDay, startGame, step, stuckKindySet, tryGenerate, witnessCommands } from '@snacks/sim';
import { dayStats, type DayStats } from './stats.ts';

/**
 * Scripted games per seed, hashed together. Practice boards, every fourth
 * one Kindy. In the first the player presses Go with nobody placed until the
 * day is lost (Kindy cannot be lost: five waves), then retries; in the second
 * the player plays the solver's solution to the end, buying each wave's first
 * friend, giving it back and buying it again (K9); in the third (main mode)
 * the player presses Hint until every kid is set, then Go, all day (RULES
 * 8b, K11). Losing, retrying, the shop, hints and winning are all covered.
 */
export function hashGames(firstSeed: number, seeds: number): string[] {
  const hashes: string[] = [];
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
    const mode: Mode = seed % 4 === 0 ? 'kindy' : 'main';
    const puzzle = generatePuzzle(mode, 'practice', 0, seed);
    let lost = startGame(puzzle);
    const apply = (command: Parameters<typeof step>[1]): void => {
      const r = step(lost, command);
      if (r.error !== null) throw new Error(`seed ${seed}: ${command.type} refused: ${r.error}`);
      lost = r.state;
    };
    for (let i = 0; i < puzzle.waves && lost.phase === 'setup'; i++) apply({ type: 'go' });
    if (lost.phase === 'lost') apply({ type: 'retry' });
    const won = playWitnessWithRefunds(puzzle);
    let hinted = startGame(puzzle);
    for (let i = 0; i < 400 && mode === 'main' && hinted.phase === 'setup'; i++) {
      const r = step(hinted, { type: hinted.hint?.tier === 0 ? 'go' : 'hint' });
      if (r.error !== null) throw new Error(`seed ${seed}: hint refused: ${r.error}`);
      hinted = r.state;
    }
    hashes.push(hashState([lost, won, hinted]));
  }
  return hashes;
}

/** The solver's solution played to the end, with a buy and a refund before each wave's own buys (K9). */
export function playWitnessWithRefunds(puzzle: Puzzle): GameState {
  let state = startGame(puzzle);
  const apply = (command: Parameters<typeof step>[1]): void => {
    const r = step(state, command);
    if (r.error !== null) throw new Error(`wave ${state.wave}: ${command.type} refused: ${r.error}`);
    state = r.state;
  };
  for (const layout of puzzle.witness) {
    const first = layout.buys[0];
    if (first !== undefined) {
      apply({ type: 'buy', friend: first });
      apply({ type: 'refund', friend: state.friends[state.friends.length - 1]!.id });
    }
    for (const command of witnessCommands(state, layout)) apply(command);
  }
  return state;
}

/**
 * What the shop promises (RULES 8, K9): the catalogue is part of the puzzle,
 * so it is fixed by the seed; Kindy has none; every friend the solution buys
 * is on sale.
 */
export function catalogueProblems(p: Puzzle): string[] {
  const problems: string[] = [];
  if (p.mode === 'kindy' && p.shop.length > 0) problems.push('a Kindy day has a shop');
  if (p.mode === 'main' && p.shop.length === 0) problems.push('a main day has no shop');
  if (new Set(p.shop).size !== p.shop.length) problems.push(`the shop lists a friend twice: ${p.shop.join(', ')}`);
  for (const layout of p.witness) for (const type of layout.buys) if (!p.shop.includes(type)) problems.push(`wave ${layout.wave} buys a ${type}, which the shop does not sell`);
  return problems;
}

/** The catalogue (and the whole puzzle) made again from the puzzle's own seed is the same. */
export function catalogueFixedBySeed(p: Puzzle): boolean {
  const again = tryGenerate(p.mode, p.round, p.day, p.seed);
  return again !== null && hashState(again.shop) === hashState(p.shop) && hashState(again) === hashState(p);
}

export interface DayCheck {
  readonly day: number;
  readonly problems: readonly string[];
  readonly ms: number;
  /** Seeds thrown away before this one. */
  readonly skipped: number;
  readonly difficulty: readonly number[];
  readonly kids: number;
  readonly tray: number;
  /** Wave-by-wave difficulty for the report's sanity tables; null when the day failed to generate. */
  readonly stats: DayStats | null;
}

/** Everything RULES 10 promises about one generated day. */
export function checkPuzzle(p: Puzzle): string[] {
  const problems = [...clueProblems(p), ...catalogueProblems(p)];
  const solved = solveDay(p);
  if (!solved.ok) problems.push(`solver: ${solved.reason}`);
  try {
    const end = playWitness(p);
    if (end.phase !== 'won' || end.hungry !== 0) problems.push(`witness ends ${end.phase} with ${end.hungry} hungry`);
  } catch (error) {
    problems.push(`witness: ${String(error)}`);
  }
  for (const kid of p.kids) {
    const clash = p.kids.some((k) => k.id !== kid.id && k.cell === kid.cell && (p.mode === 'kindy' ? k.wave < kid.wave : k.wave === kid.wave || k.wave === kid.wave - 1));
    if (clash) problems.push(`kid ${kid.id} arrives where another kid may stand`);
  }
  // Kindy can't be lost (K8): whoever is left waiting, some kid can be fed.
  const stuck = p.mode === 'kindy' ? stuckKindySet(p) : null;
  if (stuck !== null) problems.push(`Kindy kids ${stuck.join(', ')} waiting together can't be fed`);
  if (p.mode === 'main') {
    // The tray never gives the answer away (K11): decoys the solution never places, and no wave that uses every friend owned.
    const stats = dayStats(p);
    if (stats.unused < 1) problems.push('the tray holds only friends the solution places: no decoy');
    if (stats.tells.length > 0) problems.push(`waves ${stats.tells.join(', ')} place every friend owned: the tray gives the answer away`);
    if (p.tray.length < SNACK_TUNABLES.decoys.value + 1) problems.push(`a tray of ${p.tray.length} has no room for ${SNACK_TUNABLES.decoys.value} decoys`);
  }
  if (p.round === 'bonus') {
    // The bonus ramp (K11): each wave's kids are planted to the curve.
    for (let w = 1; w <= p.waves; w++) {
      const total = shortestRoutes(p, w).reduce((a, b) => a + b, 0);
      if (total !== bonusFriendsAt(w)) problems.push(`bonus wave ${w} needs ${total} friends, the ramp says ${bonusFriendsAt(w)}`);
    }
  }
  return problems;
}

/** Generates and checks `days` days from `firstDay`. */
export function checkDays(mode: Mode, round: Round, firstDay: number, days: number, now: () => number): DayCheck[] {
  const out: DayCheck[] = [];
  for (let day = firstDay; day < firstDay + days; day++) {
    const t0 = now();
    let puzzle: Puzzle;
    try {
      puzzle = generatePuzzle(mode, round, day, 0);
    } catch (error) {
      out.push({ day, problems: [String(error)], ms: now() - t0, skipped: -1, difficulty: [], kids: 0, tray: 0, stats: null });
      continue;
    }
    const ms = now() - t0;
    out.push({
      day,
      problems: checkPuzzle(puzzle),
      ms,
      skipped: (puzzle.seed - daySeed(mode, round, day)) >>> 0,
      difficulty: puzzle.difficulty,
      kids: puzzle.kids.length,
      tray: puzzle.tray.length,
      stats: dayStats(puzzle),
    });
  }
  return out;
}

/** Times generating `runs` days, for the phone budget (RULES 10: under a second on a phone slowed 4x). */
export function benchGeneration(mode: Mode, runs: number, now: () => number): number[] {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    generatePuzzle(mode, 'daily', 30_000 + i, 0);
    times.push(now() - t0);
  }
  return times;
}
