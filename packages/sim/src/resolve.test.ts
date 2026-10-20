import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Friend, FriendType, Mode, SnackId } from '@snacks/contracts';
import { parseFixture } from './fixture.ts';
import { FACINGS } from './geometry.ts';
import { resolveSnacks } from './resolve.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/** Resolves a hand-made board drawn as text (fixture.ts). */
function run(rows: readonly string[], mode: Mode = 'main') {
  const f = parseFixture(rows);
  return resolveSnacks({ board: f.board, friends: f.friends, kids: f.kids, mode });
}

describe('pickups (RULES 5)', () => {
  it('a friend sharing a side with a lunchbox takes one snack of its kind and throws it', () => {
    const r = run(['a S2 . = ka']);
    expect(r.snacks).toHaveLength(1);
    expect(r.snacks[0]).toMatchObject({ snack: 'apple', picker: 1, lunchbox: 0, end: 'fed', kid: 1, beats: 3 });
  });

  it('a lunchbox only diagonally next to a friend gives it nothing (D4)', () => {
    expect(run(['a .', '. K0']).snacks).toEqual([]);
  });

  it('a Nurse next to a lunchbox picks nothing up', () => {
    expect(run(['a N . ka']).snacks).toEqual([]);
  });

  it('a friend nowhere near a lunchbox throws nothing', () => {
    expect(run(['a . S2 ka']).snacks).toEqual([]);
  });
});

describe('Straight and Diagonal lines', () => {
  it('fly over empty open and path squares to the first thing in the way', () => {
    const r = run(['a D3 . .', '. . = .', '. . . ka']);
    expect(r.snacks[0]).toMatchObject({ end: 'fed', beats: 2 });
  });

  it('stop at an obstacle, a table or another lunchbox: the snack is lost', () => {
    expect(run(['a S2 # ka']).snacks[0]?.end).toBe('blocked');
    expect(run(['a S2 T ka']).snacks[0]?.end).toBe('blocked');
    expect(run(['a . .', 'S2 . h']).snacks[0]?.end).toBe('blocked');
  });

  it('fly off the edge and are lost, the last hop ending off the board', () => {
    const r = run(['a S2 . .']);
    expect(r.snacks[0]?.end).toBe('edge');
    expect(r.snacks[0]?.hops[0]).toMatchObject({ fromX: 1, fromY: 0, toX: 4, toY: 0, beats: 3 });
  });

  it('a kid in the way takes the snack, even one meant for the kid behind (blocking)', () => {
    const r = run(['a S2 kc ka']);
    expect(r.snacks[0]).toMatchObject({ end: 'ache', kid: 1 });
    expect(r.aches.get(1)).toBe('apple');
    expect(r.fed.size).toBe(0);
  });

  it('a Nurse in the way stops the snack (D7)', () => {
    expect(run(['a S2 N ka']).snacks[0]?.end).toBe('nurse');
  });
});

describe('Short and Bouncer', () => {
  it('Short throws one square, any of 8 ways', () => {
    expect(run(['a K2 ka']).snacks[0]).toMatchObject({ end: 'fed', beats: 1 });
    expect(run(['a K3 .', '. . ka']).snacks[0]).toMatchObject({ end: 'fed', beats: 1 });
  });

  it('a Short throw onto an empty square drops the snack (D7)', () => {
    expect(run(['a K2 . ka']).snacks[0]?.end).toBe('dropped');
  });

  it('a Bouncer jumps over anything in between and takes two beats', () => {
    const r = run(['a B2 . .', '. # # ka']);
    expect(r.snacks[0]).toMatchObject({ end: 'fed', beats: T.bouncerBeats.value });
  });

  it('a Bouncer landing on an empty square drops the snack', () => {
    expect(run(['a B2 . .', '. # # =']).snacks[0]?.end).toBe('dropped');
  });

  it('a Bouncer hop off the board is lost at the edge', () => {
    expect(run(['a B0 . .']).snacks[0]?.end).toBe('edge');
  });
});

describe('passing', () => {
  it('a friend in the path catches the snack and throws it on with its own pattern; the snack stays the same snack', () => {
    const r = run(['a . . .', 'S2 . D3 .', '. . . ka']);
    const trace = r.snacks[0]!;
    expect(trace).toMatchObject({ snack: 'apple', end: 'fed', beats: 3 });
    expect(trace.hops.map((h) => h.by)).toEqual(['straight', 'diagonal']);
  });

  it('a loop ends at the pass cap: the snack is dropped (RULES 5)', () => {
    const trace = run(['a S2 S6']).snacks[0]!;
    expect(trace.end).toBe('loop');
    expect(trace.hops).toHaveLength(T.passCap.value);
  });
});

describe('who gets there first (RULES 7, D8)', () => {
  // A cookie in 3 beats from the left, an apple in 1 beat from below.
  const race = (kid: string) => ['c . . . .', `S2 . . ${kid} .`, '. . a K0 .'];

  it('the first snack to reach a kid decides; later ones are wasted', () => {
    const r = run(race('ka'));
    expect(r.fed.get(1)).toBe('apple');
    expect(r.snacks.find((s) => s.snack === 'cookie')?.end).toBe('wasted');
  });

  it('the wrong snack first gives a tummy ache, and the right one after it is wasted', () => {
    const r = run(race('kc'));
    expect(r.aches.get(1)).toBe('apple');
    expect(r.fed.size).toBe(0);
    expect(r.snacks.find((s) => s.snack === 'cookie')?.end).toBe('wasted');
  });

  it('a tie goes to the snack whose picker is higher up', () => {
    const r = run(['. a .', '. K4 .', '. kc .', '. K0 .', '. c .']);
    expect(r.aches.get(1)).toBe('apple');
  });

  it('then to the one further left', () => {
    const r = run(['a . c', 'K3 . K5', '. kc .']);
    expect(r.aches.get(1)).toBe('apple');
  });

  it('in Kindy mode a wrong snack bounces off, and a right one after it still feeds the kid', () => {
    const r = run(race('kc'), 'kindy');
    expect(r.fed.get(1)).toBe('cookie');
    expect(r.aches.size).toBe(0);
    expect(r.snacks.find((s) => s.snack === 'apple')?.end).toBe('bounced');
  });
});

describe('properties', () => {
  const types: FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];
  const snacks: SnackId[] = ['apple', 'cookie', 'banana'];
  // A random 5x5 board: some lunchboxes, path squares with kids, friends on open squares.
  const arbitraryBoard = fc
    .array(fc.integer({ min: 0, max: 99 }), { minLength: 25, maxLength: 25 })
    .chain((cells) =>
      fc.tuple(fc.constant(cells), fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 25, maxLength: 25 })),
    )
    .map(([kinds, extra]) => {
      const squares = kinds.map((k) => (k < 10 ? 'lunchbox' : k < 30 ? 'path' : k < 36 ? 'obstacle' : 'open'));
      const lunchboxes = squares.flatMap((s, cell) => (s === 'lunchbox' ? [{ cell, snack: snacks[kinds[cell]! % 3]! }] : []));
      const friends: Friend[] = [];
      const kids: { id: number; cell: number; wants: SnackId }[] = [];
      squares.forEach((s, cell) => {
        const e = extra[cell]!;
        if (s === 'open' && e < 45) {
          const type = types[e % 5]!;
          const facings = FACINGS[type];
          friends.push({ id: friends.length + 1, type, cell, facing: facings[e % facings.length]! });
        } else if (s === 'path' && e < 60) kids.push({ id: kids.length + 1, cell, wants: snacks[e % 3]! });
      });
      return { board: { width: 5, height: 5, squares: squares as never, lunchboxes }, friends, kids };
    });

  it('every picker sends exactly one snack, each ends one way, and a kid takes at most one', () => {
    fc.assert(
      fc.property(arbitraryBoard, fc.constantFrom<Mode>('main', 'kindy'), (input, mode) => {
        const r = resolveSnacks({ ...input, mode });
        const pickers = new Set(r.snacks.map((s) => s.picker));
        expect(pickers.size).toBe(r.snacks.length);
        for (const kid of input.kids) {
          const decided = r.snacks.filter((s) => s.kid === kid.id && (s.end === 'fed' || s.end === 'ache'));
          expect(decided.length).toBeLessThanOrEqual(1);
          if (mode === 'kindy') expect(decided.every((s) => s.end === 'fed')).toBe(true);
        }
        for (const s of r.snacks) {
          expect(s.hops.length).toBeLessThanOrEqual(T.passCap.value);
          expect(s.beats).toBe(s.hops.reduce((sum, h) => sum + h.beats, 0));
          expect(s.kid >= 0).toBe(s.end === 'fed' || s.end === 'ache' || s.end === 'wasted' || s.end === 'bounced');
        }
      }),
      { numRuns: 300 },
    );
  });

  it('the same board always gives the same result, whatever order the friends are listed in', () => {
    fc.assert(
      fc.property(arbitraryBoard, (input) => {
        const a = resolveSnacks({ ...input, mode: 'main' });
        const b = resolveSnacks({ ...input, friends: [...input.friends].reverse(), kids: [...input.kids].reverse(), mode: 'main' });
        expect(b.snacks).toEqual(a.snacks);
      }),
      { numRuns: 200 },
    );
  });
});
