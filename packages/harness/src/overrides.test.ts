import { afterEach, describe, expect, it } from 'vitest';
import { WAREHOUSE_TUNABLES, createWarehouse, hireCost } from '@warehouse/sim';
import { applyOverrides, parseOverrides } from './overrides.ts';

describe('--set tunable overrides for tuning sweeps', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('reads id=value pairs, comma separated', () => {
    expect(parseOverrides('wmsTaskQueue=2')).toEqual({ wmsTaskQueue: 2 });
    expect(parseOverrides('wmsTaskQueue=2,wmsUnitPayCents=150')).toEqual({ wmsTaskQueue: 2, wmsUnitPayCents: 150 });
    expect(parseOverrides('')).toEqual({});
  });

  it('rejects an unknown tunable, a malformed pair, a non-integer and a value outside its band', () => {
    expect(() => parseOverrides('rushBoard=3')).toThrow(/Unknown tunable "rushBoard"/);
    expect(() => parseOverrides('wmsTaskQueue')).toThrow(/needs id=value/);
    expect(() => parseOverrides('wmsTaskQueue=4.5')).toThrow(/whole number/);
    expect(() => parseOverrides('wmsTaskQueue=99')).toThrow(/outside its band \[1, 8\]/);
    expect(() => parseOverrides('wmsTaskQueue=1,wmsTaskQueue=2')).toThrow(/twice/);
  });

  it('reaches the rules at once, and gives back a function that restores them', () => {
    const before = hireCost(9);
    restore = applyOverrides({ wmsHireCostCents: 20_000 });
    expect(hireCost(9)).toBe(20_000);
    expect(createWarehouse({ seed: 1 }).cash).toBe(WAREHOUSE_TUNABLES.startingCashCents.value);
    restore();
    restore = undefined;
    expect(hireCost(9)).toBe(before);
  });
});
