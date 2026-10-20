import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState } from '@snacks/contracts';
import { fixturePuzzle } from './fixture.ts';
import { priceOf, startGame, step } from './game.ts';

/** Applies commands in order, failing the test on any refusal. */
function play(state: GameState, ...commands: GameCommand[]): GameState {
  let s = state;
  for (const c of commands) {
    const r = step(s, c);
    expect(r.error, `${c.type} refused`).toBeNull();
    s = r.state;
  }
  return s;
}

const twoWaves = fixturePuzzle(['a S2 . ka', '. . . =', 'c . . kc'], { kidWaves: [1, 2] });

describe('setting up between waves (RULES 8)', () => {
  it('starts with the tray full and wave 1 kids on the path', () => {
    const s = startGame(twoWaves);
    expect(s.friends).toEqual([{ id: 1, type: 'straight', cell: -1, facing: 0 }]);
    expect(s.kids).toEqual([{ id: 1, cell: 3, healed: false }]);
    expect(s.wave).toBe(1);
  });

  it('places, turns and returns friends', () => {
    let s = play(startGame(twoWaves), { type: 'place', friend: 1, cell: 1, facing: 2 });
    expect(s.friends[0]).toMatchObject({ cell: 1, facing: 2 });
    s = play(s, { type: 'turn', friend: 1, facing: 4 }, { type: 'toTray', friend: 1 });
    expect(s.friends[0]).toMatchObject({ cell: -1, facing: 4 });
  });

  it('refuses squares a friend may not stand on, with a reason', () => {
    const s = startGame(twoWaves);
    const at = (cell: number, facing = 2) => step(s, { type: 'place', friend: 1, cell, facing }).error;
    expect(at(0)).toMatch(/playground/); // a lunchbox
    expect(at(7)).toMatch(/playground/); // the path
    expect(at(4)).toMatch(/two lunchboxes/); // beside the apple and the cookie boxes
    expect(at(1, 1)).toMatch(/face/); // a Straight cannot face diagonally
    expect(at(99)).toMatch(/not on the board/);
  });

  it('refuses a square another friend stands on', () => {
    const p = fixturePuzzle(['a S2 K2 ka']);
    const s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 });
    expect(step(s, { type: 'place', friend: 2, cell: 1, facing: 2 }).error).toMatch(/Another friend/);
  });

  it('buys from the shop with points, only what it sells', () => {
    const p = fixturePuzzle(['a S2 . ka', '. . . =', 'c . . kc'], { kidWaves: [1, 2], shop: ['short'] });
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    expect(s.points).toBe(1);
    expect(step(s, { type: 'buy', friend: 'bouncer' }).error).toMatch(/does not sell/);
    s = play(s, { type: 'buy', friend: 'short' });
    expect(s.points).toBe(1 - priceOf('short'));
    expect(s.friends.at(-1)).toMatchObject({ type: 'short', cell: -1 });
    expect(step(s, { type: 'buy', friend: 'short' }).error).toMatch(/Not enough points/);
  });
});

describe('a wave and its end (RULES 7)', () => {
  it('a fed kid goes home happy and earns a point; the next wave arrives; the last wave wins the day', () => {
    let s = play(startGame(twoWaves), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]);
    expect(s).toMatchObject({ wave: 2, points: 1, fed: 1, phase: 'setup' });
    expect(s.kids).toEqual([{ id: 2, cell: 11, healed: false }]);
    s = play(s, { type: 'place', friend: 1, cell: 9, facing: 2 }, { type: 'go' });
    expect(s).toMatchObject({ phase: 'won', wave: 2, fed: 2, hungry: 0 });
    expect(step(s, { type: 'go' }).error).toMatch(/over/);
  });

  it('a kid who gets no snack goes home hungry (D2)', () => {
    const s = play(startGame(twoWaves), { type: 'go' });
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'hungry', ache: false, ate: null }]);
    expect(s.hungry).toBe(1);
  });

  it('a tummy ache sends the kid home hungry unless a Nurse is near; a Nurse heals once and the kid stays a wave (D3)', () => {
    const alone = play(startGame(fixturePuzzle(['a S2 kc', '. . .'], { waves: 2 })), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    expect(alone.lastWave?.kids).toEqual([{ kid: 1, end: 'hungry', ache: true, ate: 'apple' }]);

    const p = fixturePuzzle(['a S2 kc', '. . N'], { waves: 2 });
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'place', friend: 2, cell: 5, facing: 0 }, { type: 'go' });
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'healed', ache: true, ate: 'apple' }]);
    expect(s.kids).toEqual([{ id: 1, cell: 2, healed: true }]);
    expect(s.hungry).toBe(0);
    s = play(s, { type: 'go' });
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'hungry', ache: true, ate: 'apple' }]);
  });

  it('a Nurse too far away does not heal', () => {
    const p = fixturePuzzle(['a S2 kc .', '. . . .', 'N . . .']);
    const s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'place', friend: 2, cell: 8, facing: 0 }, { type: 'go' });
    expect(s.lastWave?.kids[0]?.end).toBe('hungry');
  });

  it('a healed kid still waiting when the day ends counts as hungry', () => {
    const p = fixturePuzzle(['a S2 kc', '. . N'], { waves: 1 });
    const s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'place', friend: 2, cell: 5, facing: 0 }, { type: 'go' });
    expect(s).toMatchObject({ phase: 'won', hungry: 1, kids: [] });
  });
});

describe('losing and trying again (RULES 8, D10)', () => {
  const p = fixturePuzzle(['a S2 ka', '. . =', '. . ka', '. . =', '. . ka'], { kidWaves: [1, 2, 3], hungryAllowed: 1 });

  it('the day is lost when more kids go home hungry than allowed', () => {
    const s = play(startGame(p), { type: 'go' }, { type: 'go' });
    expect(s).toMatchObject({ phase: 'lost', wave: 2, hungry: 2 });
    expect(step(s, { type: 'place', friend: 1, cell: 1, facing: 2 }).error).toMatch(/over/);
  });

  it('a retry goes back to the setup of the wave that was lost, as often as wanted', () => {
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' }, { type: 'toTray', friend: 1 }, { type: 'go' }, { type: 'go' });
    expect(s).toMatchObject({ phase: 'lost', wave: 3, hungry: 2, fed: 1 });
    s = play(s, { type: 'retry' });
    expect(s).toMatchObject({ phase: 'setup', wave: 3, hungry: 1, fed: 1, lastWave: null });
    expect(s.kids).toEqual([{ id: 3, cell: 14, healed: false }]);
    expect(s.friends[0]?.cell).toBe(-1);
    expect(step(s, { type: 'retry' }).error).toMatch(/lost/);
  });
});

describe('Kindy mode (RULES 11)', () => {
  const p = fixturePuzzle(['c S2 . ka', '. . a .'], { mode: 'kindy' });

  it('cannot be lost: a kid who is not fed waits for the next wave, and the day is won when every kid is fed', () => {
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    expect(s.lastWave?.snacks[0]?.end).toBe('bounced');
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'waits', ache: false, ate: null }]);
    expect(s).toMatchObject({ phase: 'setup', wave: 2, hungry: 0 });
    for (let i = 0; i < 5; i++) s = play(s, { type: 'go' });
    expect(s.phase).toBe('setup');
    s = play(s, { type: 'place', friend: 1, cell: 2, facing: 2 }, { type: 'go' });
    expect(s).toMatchObject({ phase: 'won', fed: 1, hungry: 0 });
  });
});
