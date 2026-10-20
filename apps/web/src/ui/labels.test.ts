import { describe, expect, it } from 'vitest';
import { facingAngle, kidLine, waveSummary } from './labels.ts';

describe('screen words', () => {
  it('points a friend’s arrow the way it throws', () => {
    expect(facingAngle('straight', 0)).toBe(0);
    expect(facingAngle('straight', 2)).toBe(90);
    expect(facingAngle('diagonal', 3)).toBe(135);
    expect(facingAngle('straight', 6)).toBe(-90);
    expect(facingAngle('bouncer', 1)).toBe(63); // 2 right, 1 up
    expect(facingAngle('bouncer', 2)).toBe(117); // 2 right, 1 down
  });

  it('says what happened to each kid in plain words', () => {
    expect(kidLine({ kid: 1, end: 'happy', ache: false, ate: 'apple' }, 'A')).toBe('A ate the Apple and went home happy 😋');
    expect(kidLine({ kid: 1, end: 'hungry', ache: false, ate: null }, 'B')).toBe('B got no snack and went home hungry 😢');
    expect(kidLine({ kid: 1, end: 'hungry', ache: true, ate: 'cookie' }, 'C')).toMatch(/tummy ache from the Cookie/);
  });

  it('sums up a wave', () => {
    const wave = { wave: 3, snacks: [], points: 1, wentHungry: 1, kids: [{ kid: 1, end: 'happy' as const, ache: false, ate: 'apple' as const }, { kid: 2, end: 'hungry' as const, ache: false, ate: null }] };
    expect(waveSummary(wave)).toBe('Wave 3: 1 of 2 fed · +1 ⭐ · 1 went home hungry');
  });
});
