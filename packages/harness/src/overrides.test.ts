import { afterEach, describe, expect, it } from 'vitest';
import { WAREHOUSE_TUNABLES, createWarehouse, upgradeCost } from '@warehouse/sim';
import { applyOverrides, parseOverrides } from './overrides.ts';

describe('--set tunable overrides for tuning sweeps', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('reads id=value pairs, comma separated', () => {
    expect(parseOverrides('rushLoadBp=30000')).toEqual({ rushLoadBp: 30000 });
    expect(parseOverrides('rushLoadBp=30000,fullBonusBp=0')).toEqual({ rushLoadBp: 30000, fullBonusBp: 0 });
    expect(parseOverrides('')).toEqual({});
  });

  it('rejects an unknown tunable, a malformed pair, a non-integer and a value outside its band', () => {
    expect(() => parseOverrides('rushBoard=3')).toThrow(/Unknown tunable "rushBoard"/);
    expect(() => parseOverrides('rushLoadBp')).toThrow(/needs id=value/);
    expect(() => parseOverrides('rushLoadBp=4.5')).toThrow(/whole number/);
    expect(() => parseOverrides('rushLoadBp=99999')).toThrow(/outside its band \[15000, 50000\]/);
    expect(() => parseOverrides('fullBonusBp=1,fullBonusBp=2')).toThrow(/twice/);
  });

  it('reaches the rules at once, and gives back a function that restores them', () => {
    const before = upgradeCost('loading', 0);
    restore = applyOverrides({ loadCostBase: 2000 });
    expect(upgradeCost('loading', 0)).toBe(2000);
    expect(createWarehouse({ seed: 1 }).cash).toBe(WAREHOUSE_TUNABLES.startingCashCents.value);
    restore();
    restore = undefined;
    expect(upgradeCost('loading', 0)).toBe(before);
  });
});
