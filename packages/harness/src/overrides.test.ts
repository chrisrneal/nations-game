import { afterEach, describe, expect, it } from 'vitest';
import { TUNABLES } from '@nations/sim';
import { applyOverrides, parseOverrides } from './overrides.ts';

describe('--set tunable overrides for tuning sweeps', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('reads id=value pairs, comma separated', () => {
    expect(parseOverrides('nonPayerCoverPct=40')).toEqual({ nonPayerCoverPct: 40 });
    expect(parseOverrides('nonPayerCoverPct=40,contributorResilienceBonus=5')).toEqual({ nonPayerCoverPct: 40, contributorResilienceBonus: 5 });
    expect(parseOverrides('')).toEqual({});
  });

  it('rejects an unknown tunable, a malformed pair, a non-integer and a value outside its band', () => {
    expect(() => parseOverrides('nonPayerCover=40')).toThrow(/Unknown tunable "nonPayerCover"/);
    expect(() => parseOverrides('nonPayerCoverPct')).toThrow(/needs id=value/);
    expect(() => parseOverrides('nonPayerCoverPct=4.5')).toThrow(/whole number/);
    expect(() => parseOverrides('nonPayerCoverPct=abc')).toThrow(/whole number/);
    expect(() => parseOverrides('nonPayerCoverPct=101')).toThrow(/outside its band \[0, 100\]/);
    expect(() => parseOverrides('poolCoverMaxPct=10')).toThrow(/outside its band \[50, 95\]/);
    expect(() => parseOverrides('nonPayerCoverPct=40,nonPayerCoverPct=50')).toThrow(/twice/);
  });

  it('applies the values to the sim, and gives back a function that restores them', () => {
    const before: number = TUNABLES.nonPayerCoverPct.value;
    restore = applyOverrides({ nonPayerCoverPct: before === 0 ? 10 : 0 });
    expect(TUNABLES.nonPayerCoverPct.value).toBe(before === 0 ? 10 : 0);
    restore();
    restore = undefined;
    expect(TUNABLES.nonPayerCoverPct.value).toBe(before);
  });
});
