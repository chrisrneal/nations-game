import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState, KindyHint, Puzzle } from '@snacks/contracts';
import { fixturePuzzle } from './fixture.ts';
import { startGame, step } from './game.ts';
import { generatePuzzle } from './generate.ts';
import { kindyHint } from './hint.ts';
import { randomInt, seedRng } from './rng.ts';
import { stuckKindySet } from './solver.ts';
import { gameView } from './view.ts';

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

/** What a child does when they follow a hint: the taps the hand points at, as the command they send. */
function follow(state: GameState, hint: KindyHint): GameCommand {
  switch (hint.kind) {
    case 'place': {
      const friend = state.friends.find((f) => f.id === hint.friend)!;
      return { type: 'place', friend: hint.friend, cell: hint.cell, facing: friend.facing };
    }
    case 'aim':
      return { type: 'turn', friend: hint.friend, facing: hint.facing };
    case 'tray':
      return { type: 'toTray', friend: hint.friend };
    case 'go':
      return { type: 'go' };
  }
}

/** Follows hints until the next Go (included); returns the state after it. */
function followToGo(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 20; i++) {
    const hint = kindyHint(s);
    expect(hint, `a hint at wave ${s.wave}`).not.toBeNull();
    s = play(s, follow(s, hint!));
    if (hint!.kind === 'go') return s;
  }
  throw new Error('hints never reached Go');
}

/** An apple box, an apple kid three squares right, a cookie box below: one Straight feeds the kid from square 1, facing right. */
function oneKid(): Puzzle {
  const p = fixturePuzzle(['a . . ka', '. . c .'], { mode: 'kindy', tray: ['straight', 'straight'] });
  return { ...p, witness: [{ wave: 1, buys: [], friends: [{ type: 'straight', cell: 1, facing: 2 }] }] };
}

describe('Kindy hints come from the stored solution (RULES 11)', () => {
  it('step by step: put the thrower here, aim it this way, then Go', () => {
    let s = startGame(oneKid());
    expect(kindyHint(s)).toEqual({ kind: 'place', friend: 1, cell: 1 });
    s = play(s, { type: 'place', friend: 1, cell: 1, facing: 0 });
    expect(kindyHint(s)).toEqual({ kind: 'aim', friend: 1, facing: 2 });
    s = play(s, { type: 'turn', friend: 1, facing: 2 });
    expect(kindyHint(s)).toEqual({ kind: 'go' });
    s = play(s, { type: 'go' });
    expect(s.phase).toBe('won');
    expect(kindyHint(s)).toBeNull();
  });

  it('moves a friend that is already out rather than taking another from the tray', () => {
    let s = play(startGame(oneKid()), { type: 'place', friend: 2, cell: 4, facing: 0 });
    expect(kindyHint(s)).toEqual({ kind: 'place', friend: 2, cell: 1 });
    s = play(s, { type: 'place', friend: 2, cell: 1, facing: 0 });
    expect(kindyHint(s)).toEqual({ kind: 'aim', friend: 2, facing: 2 });
  });

  it('a friend in the way of the snack goes back to the tray', () => {
    // Friend 2 on square 2 catches the apple and throws it up, off the board.
    const s = play(startGame(oneKid()), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'place', friend: 2, cell: 2, facing: 0 });
    expect(kindyHint(s)).toEqual({ kind: 'tray', friend: 2 });
    expect(kindyHint(play(s, { type: 'toTray', friend: 2 }))).toEqual({ kind: 'go' });
  });

  it('a setup the child found that already feeds every kid is left alone: the hint is Go', () => {
    // Not the stored solution (one friend on square 1 facing right), but it works.
    const p = fixturePuzzle(['a . . ka', '. . . .', '. . c .'], { mode: 'kindy', tray: ['straight', 'straight'] });
    const puzzle: Puzzle = { ...p, witness: [{ wave: 1, buys: [], friends: [{ type: 'straight', cell: 1, facing: 2 }] }] };
    // The child's way: a picker under the apple box throws right, to a friend under the kid who throws up.
    const s = play(startGame(puzzle), { type: 'place', friend: 1, cell: 4, facing: 2 }, { type: 'place', friend: 2, cell: 7, facing: 0 });
    expect(step(s, { type: 'go' }).state.phase).toBe('won');
    expect(kindyHint(s)).toEqual({ kind: 'go' });
  });

  it('on a generated day, the first hint points at the stored solution’s first friend', () => {
    for (let day = 20_000; day < 20_020; day++) {
      const p = generatePuzzle('kindy', 'daily', day, 0);
      const first = p.witness[0]!.friends[0]!;
      expect(kindyHint(startGame(p))).toEqual({ kind: 'place', friend: 1, cell: first.cell });
    }
  });

  it('is in the View for Kindy only; main mode never gets one (S6)', () => {
    const kindy = gameView(startGame(generatePuzzle('kindy', 'daily', 20_000, 0)));
    expect(kindy.hint?.kind).toBe('place');
    const main = startGame(generatePuzzle('main', 'daily', 20_000, 0));
    expect(kindyHint(main)).toBeNull();
    expect(gameView(main).hint).toBeNull();
  });
});

describe('a wrong snack in Kindy (RULES 7, 11; D15)', () => {
  // Kid 1 wants the apple; a friend on square 1 picks up a cookie and throws it to them instead.
  // Kid 2 (wave 2) wants a cookie, two throws away. Two friends: not enough to feed both at once.
  const p = fixturePuzzle(['c . . ka', '. . a =', '. . . kc'], { mode: 'kindy', tray: ['straight', 'straight'], kidWaves: [1, 2] });
  const puzzle: Puzzle = {
    ...p,
    witness: [
      { wave: 1, buys: [], friends: [{ type: 'straight', cell: 2, facing: 2 }] },
      {
        wave: 2,
        buys: [],
        friends: [
          { type: 'straight', cell: 4, facing: 4 },
          { type: 'straight', cell: 8, facing: 2 },
        ],
      },
    ],
  };

  it('bounces off; the kid waits, the board stays as it was, the next kid arrives beside them, and hints still finish the day', () => {
    let s = play(startGame(puzzle), { type: 'place', friend: 1, cell: 1, facing: 2 }, { type: 'go' });
    expect(s.lastWave?.snacks.map((t) => t.end)).toEqual(['bounced']);
    expect(s.lastWave?.kids).toEqual([{ kid: 1, end: 'waits', ache: false, ate: null }]);
    expect(s).toMatchObject({ phase: 'setup', wave: 2, fed: 0, hungry: 0 });
    // The board is not reset: the friend is where the child put it.
    expect(s.friends[0]).toMatchObject({ cell: 1, facing: 2 });
    expect(s.kids.map((k) => k.id)).toEqual([1, 2]);
    // Feeding kid 1 first, with the stored solution for their wave, using the friend already out.
    expect(kindyHint(s)).toEqual({ kind: 'place', friend: 1, cell: 2 });
    // Off the plan now (two kids, one friend): the hint still finds a step that feeds someone.
    for (let i = 0; i < 6 && s.phase === 'setup'; i++) s = followToGo(s);
    expect(s).toMatchObject({ phase: 'won', fed: 2, hungry: 0 });
  });
});

describe('a Kindy day can always be finished (RULES 11, K8)', () => {
  const kindyDays = Array.from({ length: 60 }, (_, i) => generatePuzzle('kindy', 'daily', 20_000 + i, 0));

  it('following every hint wins the day in five waves, with every kid fed', () => {
    for (const p of kindyDays) {
      let s = startGame(p);
      for (let i = 0; i < p.waves; i++) s = followToGo(s);
      expect(s, `day ${p.day}`).toMatchObject({ phase: 'won', fed: p.kids.length, hungry: 0 });
    }
  });

  it('a child who presses Go too soon, any number of times, still finishes by following hints', () => {
    let rng = seedRng(42);
    for (const p of kindyDays) {
      let s = startGame(p);
      let waves = 0;
      while (s.phase === 'setup') {
        const r = randomInt(rng, 0, 2);
        rng = r.rng;
        // A third of the time: Go with whatever is on the board.
        s = r.value === 0 ? play(s, { type: 'go' }) : followToGo(s);
        waves += 1;
        expect(waves, `day ${p.day} never ends`).toBeLessThan(60);
      }
      expect(s).toMatchObject({ phase: 'won', fed: p.kids.length, hungry: 0 });
    }
  });

  it('no set of waiting kids is ever stuck: some kid can always be fed with the friends given', () => {
    for (const p of kindyDays) expect(stuckKindySet(p), `day ${p.day}`).toBeNull();
  });

  it('finds the waiting kids nobody can feed, when there are some', () => {
    // Kid 1 wants a cookie and there is no cookie box.
    const p = fixturePuzzle(['a . kc ka'], { mode: 'kindy', tray: ['straight'], kidWaves: [1, 2] });
    expect(stuckKindySet(p)).toEqual([1]);
  });
});
