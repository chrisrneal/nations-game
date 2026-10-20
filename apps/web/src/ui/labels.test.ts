import { describe, expect, it } from 'vitest';
import type { MainHint } from '@snacks/contracts';
import { facingAngle, hintLine, hintsText, hintsToday, hungryOf, kidLetter, kidLine, kidLooks, shortClue, waveReport, waveSummary } from './labels.ts';

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

  it('reports a wave for the result overlay: fed, tummy aches, healed, hungry, points', () => {
    const wave = {
      wave: 4,
      snacks: [],
      points: 1,
      wentHungry: 1,
      kids: [
        { kid: 1, end: 'happy' as const, ache: false, ate: 'apple' as const },
        { kid: 2, end: 'healed' as const, ache: true, ate: 'cookie' as const },
        { kid: 3, end: 'hungry' as const, ache: true, ate: 'banana' as const },
      ],
    };
    expect(waveReport(wave, kidLetter)).toEqual({ fed: ['A'], aches: ['B', 'C'], healed: ['B'], hungry: ['C'], points: 1 });
  });

  it('counts hungry kids against the allowance', () => {
    expect(hungryOf(1, 3)).toBe('1 of 3');
    expect(hungryOf(4, 3)).toBe('4 of 3: too many');
  });

  it('letters kids the way the View does', () => {
    expect(kidLetter(1)).toBe('A');
    expect(kidLetter(26)).toBe('Z');
    expect(kidLetter(27)).toBe('A');
  });

  it('says what a kid wears on their clue card', () => {
    const kid = (hat: boolean, glasses: boolean, backpack: boolean) => ({ id: 1, cell: 0, label: 'A', clue: 'Something red', wants: null, healed: false, look: { shirt: 0, hat, glasses, backpack, sister: 0 } });
    expect(kidLooks(kid(false, false, false))).toBe('');
    expect(kidLooks(kid(true, false, false))).toBe('Wears a hat.');
    expect(kidLooks(kid(true, true, true))).toBe('Wears a hat, glasses and a backpack.');
  });

  it('shortens a clue for a crowded row of cards, keeping every fact', () => {
    expect(shortClue('Something crunchy')).toBe('crunchy');
    expect(shortClue('Something sweet and long')).toBe('sweet and long');
    expect(shortClue('Something soft, not their sister’s')).toBe('soft, not sister’s');
    expect(shortClue('Not red, not soft')).toBe('not red, not soft');
    expect(shortClue('Same as the kid in the hat')).toBe('same as 🎩');
    expect(shortClue('Same as the kid with glasses')).toBe('same as 👓');
  });
});

describe('hint words (RULES 8b)', () => {
  const hint = (tier: 0 | 1 | 2 | 3, about: MainHint['about'] = ['feel'], placed = -1): MainHint => ({ tier, kid: 2, about, lunchbox: tier >= 2 ? 0 : -1, placed });

  it('tier 1 names the kid and what their card is about', () => {
    expect(hintLine(hint(1), 'B', null)).toBe('💡 Kid B next: their card is about how it feels.');
    expect(hintLine(hint(1, ['taste', 'shape']), 'B', null)).toBe('💡 Kid B next: their card is about how it tastes and its shape.');
    expect(hintLine(hint(1, ['hat']), 'B', null)).toBe('💡 Kid B next: their card points at the kid in the hat.');
    expect(hintLine(hint(1, ['colour', 'sister']), 'B', null)).toBe('💡 Kid B next: their card is about its colour, and points at their sister.');
  });

  it('tier 2 points at the lunchbox, tier 3 says what it put out, tier 0 says Go', () => {
    expect(hintLine(hint(2), 'B', null)).toBe('💡 Kid B’s snack is in the glowing lunchbox.');
    expect(hintLine(hint(3, ['feel'], 9), 'B', 'bouncer')).toBe('💡 A Bouncer is in place for kid B. Hint again for the next step.');
    expect(hintLine(hint(3, ['feel'], -1), 'B', null)).toBe('💡 A friend in kid B’s way went back to the tray.');
    expect(hintLine({ tier: 0, kid: -1, about: [], lunchbox: -1, placed: -1 }, '', null)).toBe('💡 Every kid gets the right snack. Press Go!');
  });

  it('counts hints for a wave and a day', () => {
    expect(hintsText(0)).toBe('none');
    expect(hintsText(1)).toBe('1 hint');
    expect(hintsText(4)).toBe('4 hints');
    expect(hintsToday([2, 0, 3])).toBe(5);
  });
});
