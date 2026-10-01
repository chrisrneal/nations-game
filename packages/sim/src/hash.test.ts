import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState } from './hash.ts';
import { createAirport } from './airport/state.ts';

const world = (seed: number) => createAirport({ seed });

describe('state hash', () => {
  it('ignores key insertion order', () => {
    expect(hashState({ a: 1, b: { c: 2, d: 3 } })).toBe(hashState({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('changes when any value changes', () => {
    const base = world(1);
    expect(hashState(base)).not.toBe(hashState({ ...base, tick: 1 }));
    expect(hashState(base)).not.toBe(hashState(world(2)));
  });

  it('is 16 hex characters', () => {
    expect(hashState(world(1))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('refuses floats, NaN, undefined and functions', () => {
    expect(() => canonicalJson({ x: 0.5 })).toThrow(/integers/);
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(() => canonicalJson({ x: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson({ x: () => 1 })).toThrow();
  });

  it('survives a JSON round trip', () => {
    const state = world(9);
    expect(hashState(JSON.parse(JSON.stringify(state)))).toBe(hashState(state));
  });
});
