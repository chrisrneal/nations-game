import { describe, expect, it } from 'vitest';
import type { Mode, Puzzle, Round } from '@snacks/contracts';
import { clueProblems } from './clues.ts';
import { bonusCluesAt, bonusFriendsAt, daySeed, generatePuzzle, shortestRoutes } from './generate.ts';
import { hashState } from './hash.ts';
import { solveDay } from './solver.ts';
import { trayUse } from './tray.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';
import { playWitness } from './witness.ts';

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Mean difficulty of each wave over a sample of days. */
const curve = (sample: readonly Puzzle[]): number[] => Array.from({ length: sample[0]!.difficulty.length }, (_, w) => mean(sample.map((p) => p.difficulty[w]!)));

const days = (mode: Mode, round: Round, n: number): Puzzle[] => Array.from({ length: n }, (_, i) => generatePuzzle(mode, round, 20_000 + i, 0));

/** The promises every generated puzzle keeps (RULES 10); the harness checks 1000 days the same way. */
function expectGood(p: Puzzle): void {
  expect(clueProblems(p)).toEqual([]);
  expect(solveDay(p).ok).toBe(true);
  const end = playWitness(p);
  expect(end.phase).toBe('won');
  expect(end.hungry).toBe(0);
  expect(end.fed).toBe(p.kids.length);
  // Arrival squares are free when kids arrive: main, apart from last wave's (a healed kid may stay); Kindy, from every earlier kid.
  for (const kid of p.kids) {
    const earlier = p.kids.filter((k) => k.id !== kid.id && (p.mode === 'kindy' ? k.wave < kid.wave : k.wave === kid.wave - 1 || k.wave === kid.wave));
    expect(earlier.some((k) => k.cell === kid.cell)).toBe(false);
    expect(p.board.squares[kid.cell]).toBe('path');
  }
}

describe('main-mode days', () => {
  const sample = days('main', 'daily', 25);

  it('are solvable, with clues that pin every snack, and their witness wins with nobody hungry', () => {
    sample.forEach(expectGood);
  });

  it('have the shape RULES 8 promises', () => {
    for (const p of sample) {
      expect([p.board.width, p.board.height]).toEqual([T.mainWidth.value, T.mainHeight.value]);
      expect(p.waves).toBe(T.mainWaves.value);
      expect(p.snacks).toHaveLength(T.snacksPerDay.value);
      expect(p.board.lunchboxes).toHaveLength(T.snacksPerDay.value);
      expect(p.hungryAllowed).toBe(T.hungryAllowed.value);
      expect(p.shop).toContain('nurse');
      for (let w = 1; w <= p.waves; w++) {
        const n = p.kids.filter((k) => k.wave === w).length;
        expect(n === 1 || n === 2).toBe(true);
      }
    }
  });

  it('get harder through the day', () => {
    const early = sample.flatMap((p) => p.difficulty.slice(0, 3));
    const late = sample.flatMap((p) => p.difficulty.slice(-3));
    expect(mean(late)).toBeGreaterThan(mean(early) + 1.5);
  });

  it('are the same for everyone on a day, and differ from day to day', () => {
    expect(generatePuzzle('main', 'daily', 20_000, 0)).toEqual(sample[0]);
    expect(generatePuzzle('main', 'daily', 20_000, 12345)).toEqual(sample[0]); // a daily ignores the practice seed
    expect(sample[1]).not.toEqual(sample[0]);
    expect(daySeed('main', 'daily', 20_000)).not.toBe(daySeed('main', 'bonus', 20_000));
  });
});

describe('the tray does not give the answer away (K11)', () => {
  const sample = [...days('main', 'daily', 25), ...days('main', 'bonus', 10), generatePuzzle('main', 'practice', 0, 7)];

  it('holds decoys: a friend the solution never places, so the tray is not just the answer', () => {
    for (const p of sample) expect(trayUse(p).unused).toBeGreaterThanOrEqual(1);
  });

  it('never leaves a wave where every friend owned is placed by its solution', () => {
    for (const p of sample) {
      const use = trayUse(p);
      expect(use.tells).toEqual([]);
      expect(use.spare.every((n) => n >= 1)).toBe(true);
    }
  });

  it('adds `decoys` friends to the planted tray, still with a solution that wins', () => {
    for (const p of sample) {
      expectGood(p);
      expect(p.tray.length).toBeGreaterThanOrEqual(T.decoys.value + 1);
    }
  });

  it('counts a tray of only the answer as a giveaway', () => {
    const p = sample[0]!;
    // The tray cut back to the friends the solution places at its busiest: no decoy left.
    const peak = (type: string): number => Math.max(0, ...p.witness.map((l) => l.friends.filter((f) => f.type === type).length - l.buys.filter((b) => b === type).length));
    const bare = [...new Set(p.tray)].flatMap((type) => Array.from({ length: peak(type) }, () => type));
    const use = trayUse({ ...p, tray: bare, witness: p.witness.map((l) => ({ ...l, buys: [] })) });
    expect(use.unused).toBe(0);
  });

  it('leaves Kindy’s given friends as they were before decoys: the same puzzles, hash for hash', () => {
    // Fingerprints taken from the generator before K11.
    expect(hashState(generatePuzzle('kindy', 'daily', 20_000, 0))).toBe('7d216be7bbfc3661');
    expect(hashState(generatePuzzle('kindy', 'daily', 20_001, 0))).toBe('5bdfd2986918c71f');
    expect(hashState(generatePuzzle('kindy', 'practice', 0, 20_002))).toBe('12cd84a4f9852101');
  });
});

describe('the bonus round ramps up (K11)', () => {
  const bonus = days('main', 'bonus', 30);
  const daily = days('main', 'daily', 30);

  it('its planned curve rises from the first wave to the last, and never drops', () => {
    const plan = Array.from({ length: T.mainWaves.value }, (_, i) => bonusFriendsAt(i + 1));
    expect(plan[0]).toBe(T.bonusFriendsFirst.value);
    expect(plan.at(-1)).toBe(T.bonusFriendsLast.value);
    expect(plan.at(-1)!).toBeGreaterThan(plan[0]!);
    plan.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(plan[i - 1] ?? n));
    const clues = Array.from({ length: T.mainWaves.value }, (_, i) => bonusCluesAt(i + 1));
    expect(clues[0]).toBe(T.bonusCluesFirst.value);
    expect(clues.at(-1)).toBe(T.bonusCluesLast.value);
    clues.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(clues[i - 1] ?? n));
  });

  it('every bonus wave is planted to the curve: its kids’ shortest routes add up to it', () => {
    for (const p of bonus) {
      for (let w = 1; w <= p.waves; w++) expect(shortestRoutes(p, w).reduce((a, b) => a + b, 0)).toBe(bonusFriendsAt(w));
    }
  });

  it('gets harder through the round: not a flat curve', () => {
    const c = curve(bonus);
    expect(mean(c.slice(-3))).toBeGreaterThan(mean(c.slice(0, 3)) + 1.5);
    expect(c.at(-1)!).toBeGreaterThan(c[0]! + 1.5);
  });

  it('ends harder than the daily’s last wave', () => {
    expect(curve(bonus).at(-1)!).toBeGreaterThan(curve(daily).at(-1)! + 0.75);
  });
});

describe('bonus rounds and practice', () => {
  it('a bonus round is a different, busier board for the same day', () => {
    for (const p of days('main', 'bonus', 10)) {
      expectGood(p);
      expect(p.kids.length).toBeGreaterThan(15);
    }
    expect(generatePuzzle('main', 'bonus', 20_000, 0).board).not.toEqual(generatePuzzle('main', 'daily', 20_000, 0).board);
  });

  it('practice boards come from their seed', () => {
    const a = generatePuzzle('main', 'practice', 0, 7);
    expectGood(a);
    expect(generatePuzzle('main', 'practice', 0, 7)).toEqual(a);
    expect(generatePuzzle('main', 'practice', 0, 8)).not.toEqual(a);
  });
});

describe('Kindy days (RULES 11)', () => {
  it('a 4x4 board, Straight friends only, no clues and no shop, one kid a wave, all solvable', () => {
    for (const p of days('kindy', 'daily', 40)) {
      expectGood(p);
      expect([p.board.width, p.board.height]).toEqual([T.kindySize.value, T.kindySize.value]);
      expect(p.tray.every((t) => t === 'straight')).toBe(true);
      expect(p.shop).toEqual([]);
      expect(p.kids.every((k) => k.clue === null)).toBe(true);
      expect(p.kids).toHaveLength(T.kindyWaves.value);
    }
  });
});
