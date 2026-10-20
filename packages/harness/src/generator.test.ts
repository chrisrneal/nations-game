/**
 * RULES 10 in executable form: "no unsolvable boards, ever". 1000 main-mode
 * dailies, and 300 each of bonus rounds and Kindy dailies, are generated and
 * every one passes the clue checker and the solver, and its solution wins
 * with nobody hungry when played through the real game. A Kindy day also
 * never gets stuck, whichever kids are left waiting (K8). Since K9 every
 * main-mode day also keeps decoys in its tray and never has a wave that
 * places every friend owned, every bonus wave is planted to the ramp, and
 * the measured bonus curve rises and ends above the daily's last wave.
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { checkDays, type DayCheck } from './games.ts';
import { difficultyCurve, targets, type KindReport } from './report.ts';

const now = (): number => performance.now();

const kind = (mode: KindReport['mode'], round: KindReport['round'], checks: readonly DayCheck[]): KindReport => ({ mode, round, checks, failed: checks.filter((c) => c.problems.length > 0) });

describe('every generated day can be won (RULES 10)', () => {
  let daily: KindReport | null = null;
  let bonus: KindReport | null = null;

  it('1000 main-mode dailies, each with decoys and no wave that gives the answer away', () => {
    daily = kind('main', 'daily', checkDays('main', 'daily', 20_000, 1000, now));
    expect(daily.failed).toEqual([]);
  }, 300_000);

  it('300 bonus rounds, each planted to the ramp, with decoys', () => {
    bonus = kind('main', 'bonus', checkDays('main', 'bonus', 20_000, 300, now));
    expect(bonus.failed).toEqual([]);
  }, 300_000);

  it('the bonus round gets harder wave by wave and ends above the daily’s wave 10; the tray targets hold (K9)', () => {
    expect(daily).not.toBeNull();
    expect(bonus).not.toBeNull();
    const curve = difficultyCurve(bonus!);
    expect(curve.at(-1)!).toBeGreaterThan(curve[0]! + 1.5);
    expect(curve.at(-1)!).toBeGreaterThan(difficultyCurve(daily!).at(-1)!);
    expect(targets([daily!, bonus!]).filter((t) => !t.met)).toEqual([]);
  });

  it('300 Kindy dailies', () => {
    const checks = checkDays('kindy', 'daily', 20_000, 300, now);
    expect(checks.filter((c) => c.problems.length > 0)).toEqual([]);
  }, 300_000);
});
