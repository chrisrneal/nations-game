import { describe, expect, it } from 'vitest';
import type { AwayRecap } from '../platform/index.ts';
import { recapLines } from './recap.ts';

const base: AwayRecap = {
  awayMs: 3_600_000,
  ranMs: 3_600_000,
  capMinutes: 480,
  capDays: 20,
  skipped: false,
  earned: 1_240_000,
  shipped: 140,
  otif: 119,
  missed: 0,
  linesPicked: 420,
  pos: 70,
  received: 9800,
  days: 2,
};

describe('the away recap (RULES 11)', () => {
  it('says how long, what it shipped and earned, and what came in, in three lines', () => {
    expect(recapLines(base)).toEqual([
      'You were away 1h 0m, and the warehouse kept running (2 warehouse days went by).',
      'It shipped 140 orders, 85% on time and in full, for $12.4K.',
      '70 POs came in (9.8K units), and every order made its cutoff.',
    ]);
  });

  it('says when the testing time skip ran it', () => {
    expect(recapLines({ ...base, skipped: true, days: 0 })[0]).toBe('You skipped 1h 0m ahead.');
  });

  it('says when the offline cap stopped the warehouse', () => {
    expect(recapLines({ ...base, awayMs: 10 * 3_600_000, ranMs: 8 * 3_600_000, days: 20 })[0]).toBe(
      'You were away 10h 0m. The warehouse ran for 8h 0m (20 warehouse days went by), then stopped: while the app is closed it runs at most 20 warehouse days, 8h 0m at this speed.',
    );
  });

  it('at 5 warehouse minutes a second the same cap is 1h 36m of real time (W9)', () => {
    expect(recapLines({ ...base, awayMs: 3 * 3_600_000, ranMs: 96 * 60_000, capMinutes: 96, days: 20 })[0]).toBe(
      'You were away 3h 0m. The warehouse ran for 1h 36m (20 warehouse days went by), then stopped: while the app is closed it runs at most 20 warehouse days, 1h 36m at this speed.',
    );
  });

  it('points at the plan when orders missed their cutoff', () => {
    expect(recapLines({ ...base, missed: 12 })[2]).toBe('70 POs came in (9.8K units). 12 orders missed their cutoff: the Plan tab can change how the crew works.');
  });

  it('says plainly when nothing shipped', () => {
    expect(recapLines({ ...base, shipped: 0, otif: 0, earned: 0, pos: 0 })[1]).toBe('No orders shipped while you were away.');
  });
});
