import { describe, expect, it } from 'vitest';
import { clockAt, formatCash, formatDuration, short, tickTime, timeOfDay } from './format.ts';

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

  it('shows durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(130)).toBe('2m 10s');
    expect(formatDuration(3900)).toBe('1h 5m');
  });

  it('shows the warehouse clock (W8): a minute of the day a second, from 06:00 on day 1', () => {
    const c = { ticksPerMinute: 4, startMinute: 360 };
    expect(timeOfDay(0)).toBe('00:00');
    expect(timeOfDay(870)).toBe('14:30');
    expect(clockAt(0, c)).toEqual({ day: 1, minute: 360 });
    expect(clockAt(4 * 60, c)).toEqual({ day: 1, minute: 420 });
    expect(clockAt(4 * 18 * 60, c)).toEqual({ day: 2, minute: 0 });
    expect(tickTime(4 * 90, c)).toBe('07:30');
    expect(tickTime(4 * 18 * 60, c, 1)).toBe('D2 00:00');
    expect(tickTime(4 * 18 * 60, c, 2)).toBe('00:00');
  });
});
