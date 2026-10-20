import { describe, expect, it } from 'vitest';
import { fixturePuzzle, parseFixture } from './fixture.ts';
import { playWitness } from './witness.ts';
import { routesTo, solveDay, solveWave } from './solver.ts';

describe('routes (RULES 10)', () => {
  it('finds a one-friend route from a lunchbox to a kid in line', () => {
    const f = parseFixture(['a . . ka']);
    const routes = routesTo(f.board, new Set([3]), 3, 'apple', ['straight'], 3);
    expect(routes).toContainEqual([{ type: 'straight', cell: 1, facing: 2 }]);
  });

  it('never uses a friend beside a lunchbox of another snack', () => {
    const f = parseFixture(['c . . ka']);
    expect(routesTo(f.board, new Set([3]), 3, 'apple', ['straight', 'short'], 3)).toEqual([]);
  });

  it('chains friends when no picker can reach the kid directly', () => {
    const f = parseFixture(['a . # .', '. . # ka', '. . . .']);
    const routes = routesTo(f.board, new Set([7]), 7, 'apple', ['straight'], 3);
    expect(routes.length).toBeGreaterThan(0);
    expect(Math.min(...routes.map((r) => r.length))).toBe(3);
  });
});

describe('the wave solver', () => {
  const walled = ['a . # .', '. . # ka', '. . # .'];

  it('returns a setup the engine confirms, using friends owned', () => {
    const f = parseFixture(['a . . ka']);
    const s = solveWave(f.board, f.kids, 'main', { owned: { straight: 1 }, points: 0, shop: [] });
    expect(s).toEqual({ friends: [{ type: 'straight', cell: 1, facing: 2 }], buys: [] });
  });

  it('finds nothing on a board that cannot be solved with what the player has', () => {
    const f = parseFixture(walled);
    expect(solveWave(f.board, f.kids, 'main', { owned: { straight: 3, diagonal: 3, short: 3 }, points: 0, shop: [] })).toBeNull();
    expect(solveWave(f.board, f.kids, 'main', { owned: {}, points: 0, shop: ['straight'] })).toBeNull();
  });

  it('a Bouncer jumps the wall; buying one needs the points', () => {
    const f = parseFixture(walled);
    expect(solveWave(f.board, f.kids, 'main', { owned: {}, points: 2, shop: ['bouncer'] })).toBeNull();
    const s = solveWave(f.board, f.kids, 'main', { owned: {}, points: 3, shop: ['bouncer'] });
    expect(s?.buys).toEqual(['bouncer']);
  });

  it('feeds two kids at once without one blocking the other', () => {
    const f = parseFixture(['a . . . ka', '. . . . =', 'c . . . kc']);
    const s = solveWave(f.board, f.kids, 'main', { owned: { straight: 2 }, points: 0, shop: [] });
    expect(s?.friends).toHaveLength(2);
  });
});

describe('the day solver', () => {
  it('solves wave by wave, buying with points earned in earlier waves; its solution wins when played', () => {
    const p = fixturePuzzle(['a . . ka', '. . # =', '. # . =', '. . . kc', '. . . .', '. . c .'], { kidWaves: [1, 2], tray: ['straight'], shop: ['short', 'diagonal'] });
    const day = solveDay(p);
    expect(day.ok).toBe(true);
    if (!day.ok) return;
    const end = playWitness(p, day.layouts);
    expect(end).toMatchObject({ phase: 'won', hungry: 0, fed: 2 });
  });

  it('says which wave it could not solve', () => {
    const p = fixturePuzzle(['a . # .', '. . # ka', '. . # .'], { tray: ['straight'] });
    expect(solveDay(p)).toEqual({ ok: false, wave: 1, reason: 'no setup found for wave 1' });
  });
});
