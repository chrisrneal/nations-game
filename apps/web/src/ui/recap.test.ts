import { describe, expect, it } from 'vitest';
import type { AwayRecap } from '../platform/index.ts';
import { recapLines } from './recap.ts';

const base: AwayRecap = {
  awayMs: 3_600_000,
  ranMs: 3_600_000,
  capMinutes: 120,
  earned: 1_240_000,
  flights: 214,
  fullFlights: 180,
  pax: 3000,
  missed: 0,
  charters: 2,
  bottleneck: { kind: 'passengers', text: 'Planes are waiting for passengers.', fix: ['terminal'] },
  fixName: 'Bigger terminal',
};

describe('the away recap (RULES 9)', () => {
  it('says how long, what it earned and what happened, in three lines', () => {
    expect(recapLines(base)).toEqual([
      'You were away 1h 0m, and the airport kept running.',
      'It earned $12.4K from 214 flights, 84% of them full.',
      '2 charters landed at double fare. Planes are waiting for passengers. Try Bigger terminal.',
    ]);
  });

  it('says when the offline cap cut the night short', () => {
    expect(recapLines({ ...base, awayMs: 5 * 3_600_000, ranMs: 2 * 3_600_000 })[0]).toBe(
      'You were away 5h 0m. The airport ran for 2h 0m, then closed for the night: Night shift keeps it open longer.',
    );
  });

  it('points at the terminal when it turned passengers away', () => {
    expect(recapLines({ ...base, missed: 1204, charters: 0 })[2]).toBe('1.2K passengers found the terminal full: a Bigger terminal would have caught them.');
  });
});
