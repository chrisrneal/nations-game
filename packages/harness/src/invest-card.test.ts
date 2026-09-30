import { describe, expect, it } from 'vitest';
import { createCardTracker, type CardObservation, type CardParams, type GoodObservation } from './invest-card.ts';

const P: CardParams = { shortTicks: 3, openTicks: 1, quietTicks: 3, growthBp: 500 };
const good = (o: Partial<GoodObservation> = {}): GoodObservation => ({ unmet: 10, gapBp: 1000, roomBp: 5000, credit: 500, nextPointCost: 100, ...o });
const none = (o: Partial<GoodObservation> = {}): GoodObservation => good({ unmet: 0, ...o });
const obs = (food: GoodObservation, energy: GoodObservation = none()): CardObservation => ({ food, energy });

/** Feeds one observation per month and returns the months (0-based) the card was open. */
function months(params: CardParams, seq: readonly CardObservation[], priority: 'food' | 'energy' = 'food'): number[] {
  const t = createCardTracker(params);
  const open: number[] = [];
  seq.forEach((o, m) => {
    if (t.step(o, priority) !== null) open.push(m);
  });
  return open;
}
const steady = (n: number, o: CardObservation): CardObservation[] => Array.from({ length: n }, () => o);

describe('the home-investment card tracker (RULES 8.1, when the card is shown)', () => {
  it('opens once the shortage has run investCardShortTicks months, and stays open its ticks', () => {
    expect(months(P, steady(3, obs(good())))).toEqual([2]);
    expect(months({ ...P, openTicks: 2 }, steady(6, obs(good())))).toEqual([2, 3]);
  });

  it('never opens for a run shorter than investCardShortTicks', () => {
    const seq = [...steady(2, obs(good())), obs(none()), ...steady(2, obs(good())), obs(none())];
    expect(months(P, seq)).toEqual([]);
  });

  it('is quiet for investCardQuietTicks months after it closes, then reopens if still eligible', () => {
    // Opens month 2, closes month 3, quiet months 3-5, reopens month 6.
    expect(months(P, steady(12, obs(good())))).toEqual([2, 6, 10]);
    expect(months({ ...P, quietTicks: 0 }, steady(6, obs(good())))).toEqual([2, 3, 4, 5]);
  });

  it('reopens at once inside the quiet season when the gap has grown by investCardGrowthBp', () => {
    const seq = [...steady(3, obs(good({ gapBp: 1000 }))), obs(good({ gapBp: 1400 })), obs(good({ gapBp: 1500 })), obs(good({ gapBp: 1600 }))];
    // Shown at 2 with gap 1000; month 4 has gap 1500 = 1000 + 500, so it opens at once; month 5 is quiet against the new gap (1500).
    expect(months(P, seq)).toEqual([2, 4]);
  });

  it('measures growth against the gap at the last showing, not the first', () => {
    const seq = [...steady(3, obs(good({ gapBp: 1000 }))), obs(good({ gapBp: 1500 })), obs(good({ gapBp: 1900 })), obs(good({ gapBp: 2000 }))];
    // Shown at 2 (gap 1000); month 3 (1500) opens again and resets the reference to 1500; month 4 (1900) is short of 2000; month 5 (2000) opens.
    expect(months(P, seq)).toEqual([2, 3, 5]);
  });

  it('a month with nothing unmet ends the shortage and clears the memory', () => {
    const seq = [...steady(3, obs(good())), obs(none()), ...steady(3, obs(good()))];
    // First shortage opens at 2; after the clear month the next shortage opens as soon as it is eligible (month 6), inside what would have been the quiet season.
    expect(months(P, seq)).toEqual([2, 6]);
  });

  it('does not open when the gap, the room or the Credit is missing (unaffordable never opens)', () => {
    expect(months(P, steady(6, obs(good({ credit: 99 }))))).toEqual([]);
    expect(months(P, steady(6, obs(good({ gapBp: 0 }))))).toEqual([]);
    expect(months(P, steady(6, obs(good({ roomBp: 0 }))))).toEqual([]);
    // Becoming affordable later opens it, since the run kept counting.
    expect(months(P, [...steady(4, obs(good({ credit: 0 }))), obs(good())])).toEqual([4]);
  });

  it('opens the card for the good short longest, ties to the cover-priority good', () => {
    const t = createCardTracker(P);
    // Energy short from month 0, food from month 1: at month 2 only energy has run 3.
    t.step(obs(none(), good()), 'food');
    t.step(obs(good(), good()), 'food');
    expect(t.step(obs(good(), good()), 'food')).toBe('energy');
    const tie = createCardTracker(P);
    tie.step(obs(good(), good()), 'energy');
    tie.step(obs(good(), good()), 'energy');
    expect(tie.step(obs(good(), good()), 'energy')).toBe('energy');
    const tie2 = createCardTracker(P);
    tie2.step(obs(good(), good()), 'food');
    tie2.step(obs(good(), good()), 'food');
    expect(tie2.step(obs(good(), good()), 'food')).toBe('food');
  });

  it('keeps a separate memory per good', () => {
    // Food opens at 2; energy, eligible from month 3, is not held back by food's quiet season.
    const t = createCardTracker(P);
    const out: (string | null)[] = [];
    for (let m = 0; m < 5; m++) out.push(t.step(obs(good(), m >= 1 ? good() : none()), 'food'));
    expect(out).toEqual([null, null, 'food', 'energy', null]);
  });
});
