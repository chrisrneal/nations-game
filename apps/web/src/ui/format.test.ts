import { describe, expect, it } from 'vitest';
import { formatCash, formatDuration, formatEffect, formatRate, short } from './format.ts';

describe('number formatting', () => {
  it('shortens big numbers to a few characters, rounding down', () => {
    expect(short(999)).toBe('999');
    expect(short(1_250)).toBe('1.2K');
    expect(short(12_345)).toBe('12.3K');
    expect(short(123_456)).toBe('123K');
    expect(short(3_456_789)).toBe('3.4M');
    expect(short(5_600_000_000)).toBe('5.6B');
    expect(short(7.2e12)).toBe('7.2T');
  });

  it('shows cash in dollars', () => {
    expect(formatCash(0)).toBe('$0.00');
    expect(formatCash(1250)).toBe('$12');
    expect(formatCash(950)).toBe('$9.50');
    expect(formatCash(123_456)).toBe('$1.2K');
    expect(formatCash(340_000_000)).toBe('$3.4M');
  });

  it('shows durations and rates', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(130)).toBe('2m 10s');
    expect(formatDuration(3900)).toBe('1h 5m');
    expect(formatRate(1600)).toBe('1.6/s');
    expect(formatRate(1_234_000_000)).toBe('1.2M/s');
  });

  it('shows upgrade effects in their units', () => {
    expect(formatEffect('count', 2000)).toBe('2 gates');
    expect(formatEffect('seats', 15_000)).toBe('15 seats');
    expect(formatEffect('cents', 160_000)).toBe('$1.60');
    expect(formatEffect('seconds', 4500)).toBe('4.50s');
    expect(formatEffect('minutes', 120_000)).toBe('2h');
    expect(formatEffect('minutes', 30_000)).toBe('30m');
  });
});
