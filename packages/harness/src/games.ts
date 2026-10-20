/**
 * Headless Snack Attack: scripted games for the determinism check, and the
 * generator report (RULES 10). Pure code over @snacks/sim, so it bundles for
 * Chromium too (browser-entry.ts); the caller passes in a timer.
 */
import type { Mode, Puzzle, Round } from '@snacks/contracts';
import { clueProblems, daySeed, generatePuzzle, hashState, playWitness, solveDay, startGame, step, stuckKindySet } from '@snacks/sim';

/**
 * Two scripted games per seed, hashed together. Practice boards, every fourth
 * one Kindy. In the first the player presses Go with nobody placed until the
 * day is lost (Kindy cannot be lost: five waves), then retries; in the second
 * the player plays the solver's solution to the end. Losing, retrying and
 * winning are all covered.
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
    const won = playWitness(puzzle);
    hashes.push(hashState([lost, won]));
  }
  return hashes;
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
}

/** Everything RULES 10 promises about one generated day. */
export function checkPuzzle(p: Puzzle): string[] {
  const problems = [...clueProblems(p)];
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
      out.push({ day, problems: [String(error)], ms: now() - t0, skipped: -1, difficulty: [], kids: 0, tray: 0 });
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
