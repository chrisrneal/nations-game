import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState, WaveResult } from '@snacks/contracts';
import { fixturePuzzle } from './fixture.ts';
import { priceOf, startGame, step } from './game.ts';
import { generatePuzzle, tryGenerate } from './generate.ts';
import { hashState } from './hash.ts';
import { gameView } from './view.ts';
import { witnessCommands } from './witness.ts';

/**
 * The shop (RULES 8, K9): points earned in a wave buy friends for later waves
 * that day only; a friend bought since the last Go can be given back for a
 * full refund until Go is pressed; the catalogue is part of the puzzle.
 */

function play(state: GameState, ...commands: GameCommand[]): GameState {
  let s = state;
  for (const c of commands) {
    const r = step(s, c);
    expect(r.error, `${c.type} refused`).toBeNull();
    s = r.state;
  }
  return s;
}

// Two waves: wave 1's kid is fed by the Straight, which earns 1 point for wave 2.
const twoWaves = fixturePuzzle(['a S2 . ka', '. . . =', 'c . . kc'], { kidWaves: [1, 2], shop: ['short', 'straight'] });
const afterWave1 = (): GameState => play(startGame(twoWaves), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });

describe('giving back a friend bought this setup (K9)', () => {
  it('refunds the full price and takes the friend away, from the tray', () => {
    let s = play(afterWave1(), { type: 'buy', friend: 'short' });
    expect(s.points).toBe(0);
    const bought = s.friends.at(-1)!;
    s = play(s, { type: 'refund', friend: bought.id });
    expect(s.points).toBe(1);
    expect(s.friends.some((f) => f.id === bought.id)).toBe(false);
  });

  it('refunds a bought friend already placed on the board', () => {
    let s = play(afterWave1(), { type: 'buy', friend: 'short' });
    const bought = s.friends.at(-1)!;
    s = play(s, { type: 'place', friend: bought.id, cell: 5, facing: 0 }, { type: 'refund', friend: bought.id });
    expect(s.points).toBe(1);
    expect(s.friends.map((f) => f.id)).toEqual([1]);
  });

  it('lets the player buy again after a refund, under a new id', () => {
    let s = play(afterWave1(), { type: 'buy', friend: 'short' });
    const first = s.friends.at(-1)!.id;
    s = play(s, { type: 'refund', friend: first }, { type: 'buy', friend: 'short' });
    expect(s.points).toBe(0);
    expect(s.friends.at(-1)).toMatchObject({ type: 'short', cell: -1 });
    expect(s.friends.at(-1)!.id).toBeGreaterThan(first);
  });

  it('refuses a friend from the starting tray', () => {
    const s = afterWave1();
    expect(step(s, { type: 'refund', friend: 1 }).error).toMatch(/bought since/);
  });

  it('refuses a friend bought before the last Go: points spent in an earlier setup stay spent', () => {
    const p = fixturePuzzle(['a S2 . ka', '. . . =', 'c . . kc', '. . . =', 'g . . kg'], { kidWaves: [1, 2, 3], shop: ['short'] });
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' }, { type: 'buy', friend: 'short' });
    const bought = s.friends.at(-1)!.id;
    s = play(s, { type: 'go' });
    expect(step(s, { type: 'refund', friend: bought }).error).toMatch(/bought since/);
  });

  it('refuses an unknown friend, and anything once the day is over', () => {
    const s = afterWave1();
    expect(step(s, { type: 'refund', friend: 99 }).error).toMatch(/No such friend/);
    const over = play(s, { type: 'go' });
    expect(over.phase).not.toBe('setup');
    expect(step(over, { type: 'refund', friend: 1 }).error).toMatch(/over/);
  });

  it('after a retry, friends bought in the new attempt can be given back', () => {
    // Wave 2 is lost on purpose (nobody feeds the kid, hungryAllowed 0), then retried.
    const p = { ...twoWaves, hungryAllowed: 0 };
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' }, { type: 'toTray', friend: 1 }, { type: 'go' });
    expect(s.phase).toBe('lost');
    s = play(s, { type: 'retry' }, { type: 'buy', friend: 'short' });
    s = play(s, { type: 'refund', friend: s.friends.at(-1)!.id });
    expect(s.points).toBe(1);
  });
});

describe('the shop in the View', () => {
  it('says what each friend costs, how many are owned, and the shortfall', () => {
    const v = gameView(afterWave1());
    expect(v.points).toBe(1);
    expect(v.shop).toEqual([
      { type: 'short', price: 1, canBuy: true, shortfall: 0, owned: 0, refund: -1 },
      { type: 'straight', price: 2, canBuy: false, shortfall: 1, owned: 1, refund: -1 },
    ]);
  });

  it('names the friend a refund gives back: the last one bought, one in the tray first', () => {
    const p = fixturePuzzle(['a S2 . ka', '. . . =', 'c . . kc', '. . . =', 'g . . kg'], { kidWaves: [1, 2, 3], shop: ['short'] });
    let s = play(startGame(p), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' }, { type: 'buy', friend: 'short' }, { type: 'go' });
    expect(gameView(s).shop[0]).toMatchObject({ owned: 1, refund: -1 }); // bought before the last Go
    s = play({ ...s, points: 2 }, { type: 'buy', friend: 'short' }, { type: 'buy', friend: 'short' });
    const [, , a, b] = s.friends.map((f) => f.id);
    expect(gameView(s).shop[0]).toMatchObject({ owned: 3, refund: b, shortfall: 1, canBuy: false });
    s = play(s, { type: 'place', friend: b!, cell: 5, facing: 0 });
    expect(gameView(s).shop[0]?.refund).toBe(a);
  });

  it('Kindy has no shop', () => {
    expect(gameView(startGame(generatePuzzle('kindy', 'daily', 20_000, 0))).shop).toEqual([]);
  });
});

describe('fairness: the same day with the same purchases plays the same (L)', () => {
  /** The day's solution, with a buy, a refund and a buy again before every wave that buys, recording every wave. */
  function run(day: number): { hash: string; waves: WaveResult[] } {
    let s = startGame(generatePuzzle('main', 'daily', day, 0));
    const waves: WaveResult[] = [];
    for (const layout of s.puzzle.witness) {
      const extra = layout.buys[0];
      if (extra !== undefined) {
        s = play(s, { type: 'buy', friend: extra });
        s = play(s, { type: 'refund', friend: s.friends.at(-1)!.id });
      }
      for (const c of witnessCommands(s, layout)) {
        const r = step(s, c);
        expect(r.error).toBeNull();
        s = r.state;
        if (r.wave !== null) waves.push(r.wave);
      }
    }
    expect(s.phase).toBe('won');
    return { hash: hashState(s), waves };
  }

  it('two runs of the same daily with the same purchases give identical results', () => {
    for (const day of [20_400, 20_401, 20_402]) {
      const a = run(day);
      const b = run(day);
      expect(b.waves).toEqual(a.waves);
      expect(b.hash).toBe(a.hash);
    }
  });

  it('a day’s catalogue is fixed by its seed', () => {
    for (const day of [20_400, 20_401, 20_402]) {
      const p = generatePuzzle('main', 'daily', day, 0);
      expect(p.shop.length).toBeGreaterThan(0);
      expect(tryGenerate('main', 'daily', day, p.seed)?.shop).toEqual(p.shop);
      expect(generatePuzzle('main', 'daily', day, 0).shop).toEqual(p.shop);
      for (const layout of p.witness) for (const type of layout.buys) expect(p.shop).toContain(type);
    }
  });

  it('a refund costs nothing: buying and giving back leaves the game as it was, apart from friend numbers', () => {
    const s = afterWave1();
    let t = play(s, { type: 'buy', friend: 'short' });
    t = play(t, { type: 'refund', friend: t.friends.at(-1)!.id });
    expect({ ...t, nextFriendId: s.nextFriendId }).toEqual(s);
    expect(priceOf('short')).toBe(1);
  });
});
