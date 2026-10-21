import { describe, expect, it } from 'vitest';
import type { FriendType, KidOutcome, SnackEnd, SnackHop, SnackTrace, WaveResult } from '@snacks/contracts';
import { soundPlan } from './soundplan.ts';
import { waveTimeline, type BoardAtGo } from './timeline.ts';

/**
 * What the wave replay sounds like (K13): each moment of the timeline gets its
 * cue, at the moment it happens, and a crowd of identical moments is one sound.
 */

const BEAT = 100;
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
const opts = { beatMs: BEAT, calm: false, healRange: 1 };
const plan = (snacks: SnackTrace[], kids: KidOutcome[]) => soundPlan(waveTimeline(board, wave(snacks, kids), opts), BEAT);

const fed = trace([hop('straight', [1, 0], [3, 0], 2)], 'fed', 1);

describe('the replay’s sounds (K13)', () => {
  it('a throw from the lunchbox, the picker’s catch, then the kid is fed and dances', () => {
    const p = plan([fed], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]);
    expect(p.map((s) => s.cue)).toEqual(['throw', 'catch', 'fed', 'dance']);
    expect(p[0]!.at).toBe(0);
    expect(p[1]!.at).toBe(BEAT);
    expect(p[2]!.at).toBe(3 * BEAT);
    expect(p[3]!.at).toBeGreaterThan(p[2]!.at);
  });

  it('a pass is another catch, when the snack gets to the friend in the middle', () => {
    const pass = trace([hop('straight', [1, 0], [2, 0], 1), hop('short', [2, 0], [3, 0], 1)], 'fed', 1);
    const p = soundPlan(waveTimeline({ ...board, friends: [...board.friends, { id: 4, type: 'short', cell: 2 }] }, wave([pass], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }]), opts), BEAT);
    expect(p.filter((s) => s.cue === 'catch').map((s) => s.at)).toEqual([BEAT, 2 * BEAT]);
  });

  it('a tummy ache wobbles, a Nurse heals, and a kid who gets nothing goes home with a sigh', () => {
    const ache = { ...trace([hop('short', [2, 1], [3, 1], 1)], 'ache', 2), snack: 'cookie' as const };
    const healed = plan([ache], [{ kid: 2, end: 'healed', ache: true, ate: 'cookie' }]).map((s) => s.cue);
    expect(healed).toContain('ache');
    expect(healed).toContain('heal');
    expect(healed.indexOf('heal')).toBeGreaterThan(healed.indexOf('ache'));
    const hungry = plan([], [{ kid: 1, end: 'hungry', ache: false, ate: null }]).map((s) => s.cue);
    expect(hungry).toEqual(['hungry']);
  });

  it('is in time order, inside the replay, and many kids reacting together make one sound of each kind', () => {
    const a = trace([hop('straight', [1, 0], [3, 0], 2)], 'fed', 1);
    const b = { ...trace([hop('short', [2, 1], [3, 1], 1)], 'fed', 2), lunchbox: 0 };
    const p = plan([a, a, b], [{ kid: 1, end: 'happy', ache: false, ate: 'apple' }, { kid: 2, end: 'happy', ache: false, ate: 'apple' }]);
    const times = p.map((s) => s.at);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(p.filter((s) => s.cue === 'throw')).toHaveLength(1);
    const t = waveTimeline(board, wave([a, a, b], []), opts);
    for (const s of p) expect(s.at).toBeLessThanOrEqual(t.duration);
    // Two kids fed within a hair of each other: one chime, not two stacked.
    const chimes = p.filter((s) => s.cue === 'fed');
    for (let i = 1; i < chimes.length; i++) expect(chimes[i]!.at - chimes[i - 1]!.at).toBeGreaterThanOrEqual(80);
  });

  it('a Kindy kid whose snack bounces off shakes their head to the same soft wobble', () => {
    const wrong = trace([hop('straight', [1, 0], [3, 0], 2)], 'bounced', 1);
    expect(plan([wrong], [{ kid: 1, end: 'hungry', ache: false, ate: null }]).map((s) => s.cue)).toContain('ache');
  });
});
