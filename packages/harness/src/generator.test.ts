/**
 * RULES 10 in executable form: "no unsolvable boards, ever". 1000 main-mode
 * dailies, and 300 each of bonus rounds and Kindy dailies, are generated and
 * every one passes the clue checker and the solver, and its solution wins
 * with nobody hungry when played through the real game. A Kindy day also
 * never gets stuck, whichever kids are left waiting (K8). Every day's shop
 * sells what its solution buys, and its catalogue is fixed by its seed (K9).
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '@snacks/sim';
import { catalogueFixedBySeed, checkDays } from './games.ts';

const now = (): number => performance.now();

describe('every generated day can be won (RULES 10)', () => {
  it('1000 main-mode dailies', () => {
    const checks = checkDays('main', 'daily', 20_000, 1000, now);
    expect(checks.filter((c) => c.problems.length > 0)).toEqual([]);
  }, 300_000);

  it('300 bonus rounds', () => {
    const checks = checkDays('main', 'bonus', 20_000, 300, now);
    expect(checks.filter((c) => c.problems.length > 0)).toEqual([]);
  }, 300_000);

  it('300 Kindy dailies', () => {
    const checks = checkDays('kindy', 'daily', 20_000, 300, now);
    expect(checks.filter((c) => c.problems.length > 0)).toEqual([]);
  }, 300_000);

  it('a day’s shop catalogue is fixed by its seed: 100 dailies and 50 bonus rounds made again', () => {
    const differ: string[] = [];
    for (let day = 20_000; day < 20_100; day++) {
      const daily = generatePuzzle('main', 'daily', day, 0);
      if (!catalogueFixedBySeed(daily)) differ.push(`daily ${day}`);
      if (day % 2 === 0 && !catalogueFixedBySeed(generatePuzzle('main', 'bonus', day, 0))) differ.push(`bonus ${day}`);
    }
    expect(differ).toEqual([]);
  }, 300_000);
});
