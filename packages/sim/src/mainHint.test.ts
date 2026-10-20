import { describe, expect, it } from 'vitest';
import type { Clue, GameCommand, GameState, Puzzle } from '@snacks/contracts';
import { fixturePuzzle } from './fixture.ts';
import { startGame, step } from './game.ts';
import { generatePuzzle } from './generate.ts';
import { gameView } from './view.ts';

/** Applies commands in order, failing the test on any refusal. */
function play(state: GameState, ...commands: GameCommand[]): GameState {
  let s = state;
  for (const c of commands) {
    const r = step(s, c);
    expect(r.error, `${c.type} refused: ${r.error}`).toBeNull();
    s = r.state;
  }
  return s;
}

const hint = (s: GameState): GameState => play(s, { type: 'hint' });
const crunchy: Clue = { facts: [{ kind: 'is', trait: 'feel', value: 'crunchy' }] };
const long: Clue = { facts: [{ kind: 'is', trait: 'shape', value: 'long' }] };

/** An apple box, an apple kid three squares right of it: a Straight on square 1 facing right feeds them. */
function oneKid(tray: Puzzle['tray'] = ['straight', 'straight']): Puzzle {
  const p = fixturePuzzle(['a . . ka', '. . b .'], { tray, shop: ['straight'], hungryAllowed: 0 });
  return { ...p, kids: p.kids.map((k) => ({ ...k, clue: crunchy })), witness: [{ wave: 1, buys: [], friends: [{ type: 'straight', cell: 1, facing: 2 }] }] };
}

/** Kid 1 wants the apple, "Same as the kid in the hat"; kid 2 wants the banana, "Something long", and wears the hat. */
function twoKids(): Puzzle {
  const p = fixturePuzzle(['a . . ka', '. . . .', 'b . . kb'], { tray: ['straight', 'straight'] });
  return {
    ...p,
    kids: [
      { ...p.kids[0]!, clue: { facts: [{ kind: 'same', feature: 'hat' }] } },
      { ...p.kids[1]!, clue: long, look: { ...p.kids[1]!.look, hat: true } },
    ],
    witness: [
      {
        wave: 1,
        buys: [],
        friends: [
          { type: 'straight', cell: 1, facing: 2 },
          { type: 'straight', cell: 9, facing: 2 },
        ],
      },
    ],
  };
}

describe('main-mode hints, tier by tier (RULES 8b)', () => {
  it('1: whose card and what it is about; 2: the lunchbox; 3: a friend placed and aimed; then Go', () => {
    let s = hint(startGame(oneKid()));
    expect(s.hint).toEqual({ tier: 1, kid: 1, about: ['feel'], lunchbox: -1, placed: -1 });
    expect(s.hints).toEqual([1]);
    expect(s.friends.every((f) => f.cell < 0)).toBe(true);
    s = hint(s);
    expect(s.hint).toEqual({ tier: 2, kid: 1, about: ['feel'], lunchbox: 0, placed: -1 });
    s = hint(s);
    expect(s.hint).toMatchObject({ tier: 3, kid: 1, placed: 1 });
    expect(s.friends.find((f) => f.cell === 1)).toMatchObject({ type: 'straight', facing: 2 });
    s = hint(s);
    expect(s.hint).toEqual({ tier: 0, kid: -1, about: [], lunchbox: -1, placed: -1 });
    expect(s.hints).toEqual([4]);
    s = play(s, { type: 'go' });
    expect(s.phase).toBe('won');
    expect(s.hint).toBeNull();
    expect(s.hints).toEqual([4]);
  });

  it('the View shows which lunchbox only from tier 2, and never in Kindy (S6, K9)', () => {
    let s = startGame(oneKid());
    expect(gameView(s).mainHint).toBeNull();
    s = hint(s);
    const v1 = gameView(s);
    expect(v1.mainHint).toMatchObject({ tier: 1, lunchbox: -1 });
    expect(v1.kids.every((k) => k.wants === null)).toBe(true);
    expect(gameView(hint(s)).mainHint?.lunchbox).toBe(0);
    expect(gameView(s).hints).toEqual([1]);
    const kindy = startGame(generatePuzzle('kindy', 'daily', 20_000, 0));
    expect(step(kindy, { type: 'hint' }).error).not.toBeNull();
    expect(gameView(kindy).mainHint).toBeNull();
  });

  it('starts with a card that pins its snack itself, then moves to the kid whose card points at them', () => {
    let s = hint(startGame(twoKids()));
    expect(s.hint).toMatchObject({ tier: 1, kid: 2, about: ['shape'] });
    s = hint(hint(s));
    expect(s.hint).toMatchObject({ tier: 3, kid: 2, placed: 9 });
    s = hint(s);
    expect(s.hint).toMatchObject({ tier: 1, kid: 1, about: ['hat'], lunchbox: -1 });
    s = hint(hint(s));
    expect(s.hint).toMatchObject({ tier: 3, kid: 1, placed: 1 });
    expect(hint(s).hint?.tier).toBe(0);
  });

  it('moves on when the player feeds the kid themselves', () => {
    let s = hint(startGame(twoKids()));
    s = play(s, { type: 'place', friend: 1, cell: 9, facing: 2 });
    expect(hint(s).hint).toMatchObject({ tier: 1, kid: 1 });
  });

  it('a sister card is about its trait and the sister', () => {
    const p = oneKid();
    const s = hint(startGame({ ...p, kids: p.kids.map((k) => ({ ...k, clue: { facts: [{ kind: 'is', trait: 'taste', value: 'sweet' }, { kind: 'notSister' }] } })) }));
    expect(s.hint?.about).toEqual(['taste', 'sister']);
  });
});

describe('tier 3 puts one friend right (RULES 8b)', () => {
  it('a friend of another type on the square goes back to the tray first', () => {
    let s = play(startGame(oneKid(['short', 'straight'])), { type: 'place', friend: 1, cell: 1, facing: 0 });
    s = hint(hint(hint(s)));
    expect(s.friends.find((f) => f.type === 'short')?.cell).toBe(-1);
    expect(s.friends.find((f) => f.type === 'straight')).toMatchObject({ cell: 1, facing: 2 });
  });

  it('turns a friend already on the square, and moves one already out before taking one from the tray', () => {
    let s = play(startGame(oneKid()), { type: 'place', friend: 1, cell: 1, facing: 0 });
    s = hint(hint(hint(s)));
    expect(s.friends[0]).toMatchObject({ cell: 1, facing: 2 });
    let t = play(startGame(oneKid()), { type: 'place', friend: 2, cell: 5, facing: 0 });
    t = hint(hint(hint(t)));
    expect(t.friends[1]).toMatchObject({ cell: 1, facing: 2 });
    expect(t.friends[0]!.cell).toBe(-1);
  });

  it('buys the friend when none is owned and the points are there', () => {
    const p = { ...oneKid([]), witness: [{ wave: 1, buys: ['straight' as const], friends: [{ type: 'straight' as const, cell: 1, facing: 2 }] }] };
    let s: GameState = { ...startGame(p), points: 2 };
    s = hint(hint(hint(s)));
    expect(s.points).toBe(0);
    expect(s.friends).toEqual([{ id: 1, type: 'straight', cell: 1, facing: 2 }]);
  });

  it('with the kid’s friends right, a friend in the way goes back to the tray', () => {
    // Friend 2 on square 2 catches the apple and throws it up, off the board.
    let s = play(startGame(oneKid()), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'place', friend: 2, cell: 2, facing: 0 });
    s = hint(hint(hint(s)));
    expect(s.hint).toMatchObject({ tier: 3, kid: 1, placed: -1 });
    expect(s.friends[1]!.cell).toBe(-1);
    expect(hint(s).hint?.tier).toBe(0);
  });
});

describe('counting hints (RULES 8b)', () => {
  it('only during setup: not once the day is over, and a refused press is not counted', () => {
    const won = play(startGame(oneKid()), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    const r = step(won, { type: 'hint' });
    expect(r.error).not.toBeNull();
    expect(r.state.hints).toEqual([]);
  });

  it('a retry keeps the count and clears the hint showing', () => {
    let s = hint(hint(startGame(oneKid())));
    s = play(s, { type: 'go' });
    expect(s.phase).toBe('lost');
    s = play(s, { type: 'retry' });
    expect(s.hint).toBeNull();
    expect(s.hints).toEqual([2]);
    s = hint(s);
    expect(s.hints).toEqual([3]);
  });

  it('counts each wave on its own', () => {
    const p = generatePuzzle('main', 'daily', 20_000, 0);
    let s = hint(hint(startGame(p)));
    while (s.hint?.tier !== 0) s = hint(s);
    s = play(s, { type: 'go' });
    s = hint(s);
    expect(s.hints[1]).toBe(1);
    expect(s.hints[0]).toBeGreaterThanOrEqual(3);
  });
});

describe('a day played by hints alone (RULES 8b)', () => {
  const sample = [
    ...Array.from({ length: 12 }, (_, i) => generatePuzzle('main', 'daily', 20_000 + i, 0)),
    ...Array.from({ length: 4 }, (_, i) => generatePuzzle('main', 'bonus', 20_000 + i, 0)),
    generatePuzzle('main', 'practice', 0, 5),
  ];

  it('pressing Hint until every kid is set, then Go, wins every wave with nobody hungry', () => {
    for (const p of sample) {
      let s = startGame(p);
      while (s.phase === 'setup') {
        for (let i = 0; i < 40 && s.hint?.tier !== 0; i++) s = hint(s);
        expect(s.hint?.tier, `${p.round} day ${p.day} wave ${s.wave}`).toBe(0);
        s = play(s, { type: 'go' });
      }
      expect(s, `${p.round} day ${p.day}`).toMatchObject({ phase: 'won', hungry: 0, fed: p.kids.length });
      expect(s.hints).toHaveLength(p.waves);
      expect(s.hints.every((n) => n >= 1)).toBe(true);
    }
  });
});
