import { describe, expect, it } from 'vitest';
import { TUNABLES } from './tunables.ts';

describe('tunables', () => {
  it('holds every value inside its declared band, as an integer, with a note', () => {
    for (const [name, tunable] of Object.entries(TUNABLES)) {
      expect(tunable.min, name).toBeLessThanOrEqual(tunable.value);
      expect(tunable.value, name).toBeLessThanOrEqual(tunable.max);
      expect(Number.isInteger(tunable.value), name).toBe(true);
      expect(tunable.note.length, name).toBeGreaterThan(0);
    }
  });
});
