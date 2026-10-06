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
  pos: 12,
  received: 576,
  bottleneck: { kind: 'orders', text: 'Trucks are waiting for orders.', fix: ['sales'] },
  fixName: 'More sales',
};

describe('the away recap (RULES 9)', () => {
  it('says how long, what it earned and what happened, in three lines', () => {
    expect(recapLines(base)).toEqual([
      'You were away 1h 0m, and the warehouse kept running.',
      'It earned $12.4K from 214 trucks, 84% of them full, and took in 12 POs.',
      '2 express trucks paid double. Trucks are waiting for orders. Try More sales.',
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

  it('points at more pickers when a long backlog cancelled orders', () => {
    const picking = { ...base, missed: 1204, expresses: 0, bottleneck: { kind: 'picking' as const, text: 'Orders are piling up at picking.', fix: ['picking' as const] }, fixName: 'More pickers' };
    expect(recapLines(picking)[2]).toBe('1.2K orders were cancelled while the backlog waited: more pickers would have shipped them.');
  });

  it('points at the receiving bay when empty shelves held the backlog', () => {
    const stock = { ...base, missed: 1204, expresses: 0, bottleneck: { kind: 'stock' as const, text: 'The shelves are running empty.', fix: ['receiving' as const] }, fixName: 'Receiving bay' };
    expect(recapLines(stock)[2]).toBe('1.2K orders were cancelled while the backlog waited: a bigger Receiving bay would have shipped them.');
  });

  it('points at the bottleneck when full packing held the backlog and orders were cancelled', () => {
    const docks = { ...base, missed: 1204, expresses: 0, bottleneck: { kind: 'loading' as const, text: 'Packed orders are queuing at the docks.', fix: ['loading' as const, 'docks' as const] }, fixName: 'Faster loading' };
    expect(recapLines(docks)[2]).toBe('1.2K orders were cancelled. Packed orders are queuing at the docks. Try Faster loading.');
  });
});
