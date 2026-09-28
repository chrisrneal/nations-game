import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { TUNABLES } from './tunables.ts';

describe('tunables', () => {
  it('is the single home for balance numbers, empty until Phase 1', () => {
    expect(Object.keys(TUNABLES)).toHaveLength(0);
  });

  it('holds every value inside its declared band', () => {
    for (const [name, tunable] of Object.entries(TUNABLES)) {
      expect(tunable.min, name).toBeLessThanOrEqual(tunable.value);
      expect(tunable.value, name).toBeLessThanOrEqual(tunable.max);
      expect(tunable.note.length, name).toBeGreaterThan(0);
    }
  });
});

describe('property testing is wired up', () => {
  it('runs a fast-check property (placeholder until the sim has logic)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      }),
    );
  });
});
