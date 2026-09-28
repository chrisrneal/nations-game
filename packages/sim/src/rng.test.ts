import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { mix32, nextUint32, randomInt, seedRng } from './rng.ts';

describe('seeded RNG', () => {
  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const draw = (seed: number) => {
      let rng = seedRng(seed);
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        const next = nextUint32(rng);
        out.push(next.value);
        rng = next.rng;
      }
      return out;
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it('pins known values so an engine or refactor change is caught', () => {
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).toBe(1364076727);
    expect(nextUint32(seedRng(1)).value).toBe(4074205336);
    expect(nextUint32(seedRng(123456)).value).toBe(3005826623);
  });

  it('never mutates the generator it is given', () => {
    const rng = Object.freeze(seedRng(7));
    const next = nextUint32(rng);
    expect(rng.counter).toBe(0);
    expect(next.rng.counter).toBe(1);
  });

  it('randomInt stays inside [min, max] and returns integers', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (seed, min, width) => {
        const { value } = randomInt(seedRng(seed), min, min + width);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(min + width);
      }),
    );
  });

  it('randomInt covers every value of a small range', () => {
    let rng = seedRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const next = randomInt(rng, 1, 6);
      seen.add(next.value);
      rng = next.rng;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rejects non-integer seeds and bad ranges', () => {
    expect(() => seedRng(1.5)).toThrow();
    expect(() => randomInt(seedRng(1), 5, 4)).toThrow();
  });
});
