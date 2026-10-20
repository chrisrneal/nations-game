import { describe, expect, it } from 'vitest';
import type { FriendType, KidOutcome, SnackEnd, SnackHop, SnackTrace, WaveResult } from '@snacks/contracts';
import { pointAt, waveTimeline, type BoardAtGo } from './timeline.ts';

/**
 * The wave replay's timeline (K9): worked out from the wave result alone, so
 * the animation shows exactly what the sim decided (RULES 7), a beat per
 * square, and nothing about it is random.
 */

const BEAT = 100;
// A 5 x 3 board: a lunchbox at (0,0), a Straight at (1,0), a Short at (2,1),
// a Nurse at (4,2), a table at (0,2), and kids on the path at (3,0) and (4,1).
const board: BoardAtGo = {
  width: 5,
  height: 3,
  squares: ['lunchbox', 'open', 'open', 'path', 'open', 'open', 'open', 'open', 'path', 'path', 'table', 'open', 'open', 'open', 'open'],
  friends: [
    { id: 1, type: 'straight', cell: 1 },
    { id: 2, type: 'short', cell: 7 },
    { id: 3, type: 'nurse', cell: 14 },
  ],
  kids: [
    { id: 1, cell: 3 },
    { id: 2, cell: 9 },
  ],
};

const hop = (by: FriendType, from: [number, number], to: [number, number], beats: number): SnackHop => ({ fromX: from[0], fromY: from[1], toX: to[0], toY: to[1], beats, by });
const trace = (hops: SnackHop[], end: SnackEnd, kid: number): SnackTrace => ({ snack: 'apple', picker: 1, lunchbox: 0, hops, beats: hops.reduce((n, h) => n + h.beats, 0), end, kid });
const wave = (snacks: SnackTrace[], kids: KidOutcome[]): WaveResult => ({ wave: 1, snacks, kids, points: 0, wentHungry: 0 });

const fedStraight = trace([hop('straight', [1, 0], [3, 0], 2)], 'fed', 1);

describe('the wave timeline (K9)', () => {
  it('a snack leaves its lunchbox, reaches its picker after one beat, and the kid a beat a square later', () => {
    const t = waveTimeline(board, wave([fedStraight], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]), { beatMs: BEAT, calm: false, healRange: 1 });
    const f = t.flights[0]!;
    expect(pointAt(f, 0)).toMatchObject({ x: 0, y: 0 });
    expect(pointAt(f, BEAT)).toMatchObject({ x: 1, y: 0 });
    expect(pointAt(f, 3 * BEAT)).toMatchObject({ x: 3, y: 0 });
    expect(f.arrive).toBe(3 * BEAT);
    expect(t.events).toContainEqual({ kind: 'pickup', cell: 0, at: 0 });
    expect(t.events).toContainEqual({ kind: 'react', kid: 1, cell: 3, mood: 'yum', at: 3 * BEAT });
  });

  it('flies the real squares in between: a line passes over each one in turn', () => {
    const f = waveTimeline(board, wave([fedStraight], []), { beatMs: BEAT, calm: false, healRange: 1 }).flights[0]!;
    expect(pointAt(f, 2 * BEAT).x).toBeCloseTo(2, 5);
    expect(pointAt(f, 2 * BEAT).y).toBeCloseTo(0, 5);
  });

  it('a snack arcs: a Bouncer throws high, a line skims low, and the calm version does not lift at all', () => {
    const jump = trace([hop('bouncer', [1, 0], [3, 1], 2)], 'dropped', -1);
    const peak = (tr: SnackTrace, calm: boolean): number => {
      const f = waveTimeline(board, wave([tr], []), { beatMs: BEAT, calm, healRange: 1 }).flights[0]!;
      return Math.max(...f.points.filter((p) => p.t >= BEAT).map((p) => p.lift));
    };
    expect(peak(jump, false)).toBeGreaterThan(peak(fedStraight, false));
    expect(peak(fedStraight, false)).toBeGreaterThan(0);
    expect(peak(jump, true)).toBe(0);
    expect(peak(fedStraight, true)).toBe(0);
  });

  it('a pass is a catch: the friend in the middle catches when the snack gets there', () => {
    const pass = trace([hop('straight', [1, 0], [2, 0], 1), hop('short', [2, 0], [3, 0], 1)], 'fed', 1);
    const squares = [...board.squares];
    const t = waveTimeline({ ...board, squares, friends: [...board.friends, { id: 4, type: 'short', cell: 2 }] }, wave([pass], []), { beatMs: BEAT, calm: false, healRange: 1 });
    expect(t.events).toContainEqual({ kind: 'catch', cell: 2, at: 2 * BEAT });
    expect(t.events.filter((e) => e.kind === 'catch')).toHaveLength(1);
  });

  it('only the first snack makes the kid react; a later one is wasted', () => {
    const late = trace([hop('straight', [1, 0], [3, 0], 2)], 'wasted', 1);
    const slow = { ...late, hops: [hop('short', [2, 1], [3, 0], 3)], beats: 3 };
    const t = waveTimeline(board, wave([fedStraight, slow], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]), { beatMs: BEAT, calm: false, healRange: 1 });
    expect(t.events.filter((e) => e.kind === 'react')).toHaveLength(1);
  });

  it('a tummy ache wobbles, and then the Nurse in range heals with sparkles', () => {
    const ache = { ...trace([hop('short', [2, 1], [3, 1], 1)], 'ache', 2), snack: 'cookie' as const };
    const t = waveTimeline(board, wave([ache], [{ kid: 2, end: 'healed', ache: true, ate: 'cookie' }]), { beatMs: BEAT, calm: false, healRange: 1 });
    expect(t.events).toContainEqual(expect.objectContaining({ kind: 'react', kid: 2, mood: 'ache' }));
    const heal = t.events.find((e) => e.kind === 'heal');
    expect(heal).toMatchObject({ kid: 2, cell: 9, nurse: 14 });
    expect(heal!.at).toBeGreaterThanOrEqual(t.flightsEnd);
  });

  it('a hungry kid walks home sad: with a tummy ache to the parents’ table, with nothing down the path off the board', () => {
    const ache = trace([hop('short', [2, 1], [3, 0], 1)], 'ache', 1);
    const t = waveTimeline(
      board,
      wave([ache], [
        { kid: 1, end: 'hungry', ache: true, ate: 'apple' },
        { kid: 2, end: 'hungry', ache: false, ate: null },
      ]),
      { beatMs: BEAT, calm: false, healRange: 1 },
    );
    const walks = t.events.filter((e) => e.kind === 'walk');
    expect(walks).toContainEqual(expect.objectContaining({ kid: 1, mood: 'sad', to: [0, 2] }));
    expect(walks).toContainEqual(expect.objectContaining({ kid: 2, mood: 'sad', to: [4, 3] }));
  });

  it('a fed kid dances and then goes home happy, down the path', () => {
    const t = waveTimeline(board, wave([fedStraight], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]), { beatMs: BEAT, calm: false, healRange: 1 });
    expect(t.events).toContainEqual(expect.objectContaining({ kind: 'walk', kid: 1, mood: 'yum', to: [3, 3] }));
  });

  it('Kindy: a wrong snack bounces off a shaking head, and the snack flies back out', () => {
    const wrong = trace([hop('straight', [1, 0], [3, 0], 2)], 'bounced', 1);
    const t = waveTimeline(board, wave([wrong], [{ kid: 1, end: 'waits', ache: false, ate: null }]), { beatMs: BEAT, calm: false, healRange: 1 });
    expect(t.events).toContainEqual({ kind: 'react', kid: 1, cell: 3, mood: 'shake', at: 3 * BEAT });
    const f = t.flights[0]!;
    const last = f.points[f.points.length - 1]!;
    expect(last.x).toBeLessThan(3);
    expect(t.events.some((e) => e.kind === 'walk')).toBe(false);
  });

  it('a snack off the edge keeps going past the board, then fades', () => {
    const off = trace([hop('straight', [1, 0], [1, -1], 1)], 'edge', -1);
    const f = waveTimeline(board, wave([off], []), { beatMs: BEAT, calm: false, healRange: 1 }).flights[0]!;
    expect(f.points[f.points.length - 1]!.y).toBeLessThan(-1);
    expect(f.fade).toBe(true);
  });

  it('the timeline lasts until the last kid has finished, and is the same every time', () => {
    const w = wave([fedStraight], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]);
    const a = waveTimeline(board, w, { beatMs: BEAT, calm: false, healRange: 1 });
    expect(a.duration).toBeGreaterThanOrEqual(Math.max(...a.events.map((e) => e.at + ('ms' in e ? e.ms : 0))));
    expect(waveTimeline(board, w, { beatMs: BEAT, calm: false, healRange: 1 })).toEqual(a);
  });

  it('with nothing thrown, kids still go home and the wave still ends', () => {
    const t = waveTimeline(board, wave([], [{ kid: 1, end: 'hungry', ache: false, ate: null }]), { beatMs: BEAT, calm: true, healRange: 1 });
    expect(t.flights).toHaveLength(0);
    expect(t.duration).toBeGreaterThan(0);
    expect(t.events.some((e) => e.kind === 'walk')).toBe(true);
  });
});
