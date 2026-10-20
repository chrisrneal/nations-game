import { describe, expect, it } from 'vitest';
import type { Mode, Puzzle, Round } from '@snacks/contracts';
import { clueProblems } from './clues.ts';
import { daySeed, generatePuzzle } from './generate.ts';
import { solveDay } from './solver.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';
import { playWitness } from './witness.ts';

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
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(late)).toBeGreaterThan(mean(early) + 1.5);
  });

  it('are the same for everyone on a day, and differ from day to day', () => {
    expect(generatePuzzle('main', 'daily', 20_000, 0)).toEqual(sample[0]);
    expect(generatePuzzle('main', 'daily', 20_000, 12345)).toEqual(sample[0]); // a daily ignores the practice seed
    expect(sample[1]).not.toEqual(sample[0]);
    expect(daySeed('main', 'daily', 20_000)).not.toBe(daySeed('main', 'bonus', 20_000));
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
