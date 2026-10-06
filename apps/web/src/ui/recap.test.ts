import { describe, expect, it } from 'vitest';
import type { AwayRecap } from '../platform/index.ts';
import { recapLines } from './recap.ts';

const base: AwayRecap = {
  awayMs: 3_600_000,
  ranMs: 3_600_000,
  capMinutes: 120,
  skipped: false,
  earned: 1_240_000,
  shipments: 214,
  fullShipments: 180,
  orders: 3000,
  missed: 0,
  expresses: 2,
  bottleneck: { kind: 'passengers', text: 'Trucks are staged for passengers.', fix: ['sales'] },
  fixName: 'Bigger sales',
};

describe('the away recap (RULES 9)', () => {
  it('says how long, what it earned and what happened, in three lines', () => {
    expect(recapLines(base)).toEqual([
      'You were away 1h 0m, and the warehouse kept running.',
      'It earned $12.4K from 214 shipments, 84% of them full.',
      '2 expresses landed at double pay. Trucks are staged for passengers. Try Bigger sales.',
    ]);
  });

  it('says when the testing time skip ran it', () => {
    expect(recapLines({ ...base, skipped: true })[0]).toBe('You skipped 1h 0m ahead.');
  });

  it('says when the offline cap cut the night short', () => {
    expect(recapLines({ ...base, awayMs: 5 * 3_600_000, ranMs: 2 * 3_600_000 })[0]).toBe(
      'You were away 5h 0m. The warehouse ran for 2h 0m, then closed for the night: Night shift keeps it open longer.',
    );
  });

  it('points at Picking lanes when a long line turned passengers away', () => {
    const picking = { ...base, missed: 1204, expresses: 0, bottleneck: { kind: 'picking' as const, text: 'Long lines at picking.', fix: ['picking' as const] }, fixName: 'Picking lanes' };
    expect(recapLines(picking)[2]).toBe('1.2K passengers turned back at the picking backlog: more Picking lanes would have let them through.');
  });

  it('points at the bottleneck when a full staging held the line and passengers turned back', () => {
    const docks = { ...base, missed: 1204, expresses: 0, bottleneck: { kind: 'loading' as const, text: 'Passengers are queuing at the docks.', fix: ['loading' as const, 'docks' as const] }, fixName: 'Faster loading' };
    expect(recapLines(docks)[2]).toBe('1.2K passengers turned back at the door. Passengers are queuing at the docks. Try Faster loading.');
  });
});
