import { describe, expect, it } from 'vitest';
import { short } from './format.ts';

describe('number formatting', () => {
  it('shortens big numbers to a few characters, rounding down', () => {
    expect(short(7)).toBe('7');
    expect(short(999)).toBe('999');
    expect(short(1_250)).toBe('1.2K');
    expect(short(12_345)).toBe('12.3K');
    expect(short(123_456)).toBe('123K');
    expect(short(3_456_789)).toBe('3.4M');
    expect(short(5_600_000_000)).toBe('5.6B');
  });
});
