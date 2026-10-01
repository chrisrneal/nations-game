import { afterEach, describe, expect, it } from 'vitest';
import { AIRPORT_TUNABLES, createAirport, upgradeCost } from '@nations/sim/airport';
import { applyOverrides, parseOverrides } from './overrides.ts';

describe('--set tunable overrides for tuning sweeps', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('reads id=value pairs, comma separated', () => {
    expect(parseOverrides('rushBoardBp=30000')).toEqual({ rushBoardBp: 30000 });
    expect(parseOverrides('rushBoardBp=30000,fullBonusBp=0')).toEqual({ rushBoardBp: 30000, fullBonusBp: 0 });
    expect(parseOverrides('')).toEqual({});
  });

  it('rejects an unknown tunable, a malformed pair, a non-integer and a value outside its band', () => {
    expect(() => parseOverrides('rushBoard=3')).toThrow(/Unknown tunable "rushBoard"/);
    expect(() => parseOverrides('rushBoardBp')).toThrow(/needs id=value/);
    expect(() => parseOverrides('rushBoardBp=4.5')).toThrow(/whole number/);
    expect(() => parseOverrides('rushBoardBp=99999')).toThrow(/outside its band \[15000, 50000\]/);
    expect(() => parseOverrides('fullBonusBp=1,fullBonusBp=2')).toThrow(/twice/);
  });

  it('reaches the rules at once, and gives back a function that restores them', () => {
    const before = upgradeCost('boarding', 0);
    restore = applyOverrides({ boardCostBase: 2000 });
    expect(upgradeCost('boarding', 0)).toBe(2000);
    expect(createAirport({ seed: 1 }).cash).toBe(AIRPORT_TUNABLES.startingCashCents.value);
    restore();
    restore = undefined;
    expect(upgradeCost('boarding', 0)).toBe(before);
  });
});
