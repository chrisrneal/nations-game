import { describe, expect, it } from 'vitest';
import { AVATAR_LOOK, countdown, profileLabel, retriesText, streakText, weekStrip } from './people.ts';

describe('profile words and pictures', () => {
  it('every picture has a look', () => {
    for (const look of Object.values(AVATAR_LOOK)) expect(look.emoji.length).toBeGreaterThan(0);
  });

  it('names a profile by its name, or by its picture when it has none', () => {
    expect(profileLabel({ name: 'Sam', avatar: 'dog' })).toBe('Sam');
    expect(profileLabel({ name: '', avatar: 'fox' })).toBe('Fox');
  });

  it('counts down to the next puzzle in hours, minutes and seconds', () => {
    expect(countdown(0)).toBe('0:00:00');
    expect(countdown(999)).toBe('0:00:01');
    expect(countdown(5 * 3_600_000 + 3 * 60_000 + 9_000)).toBe('5:03:09');
    expect(countdown(-50)).toBe('0:00:00');
  });

  it('says the streak and the tries in plain words', () => {
    expect(streakText(0)).toBe('0 days');
    expect(streakText(1)).toBe('1 day');
    expect(streakText(12)).toBe('12 days');
    expect(retriesText(0)).toBe('first go');
    expect(retriesText(1)).toBe('1 retry');
    expect(retriesText(3)).toBe('3 retries');
  });

  it('marks the finished days of the week ending on a day', () => {
    const rec = (day: number) => ({ day, fed: 1, hungry: 0, retries: 0, bonus: false });
    expect(weekStrip([rec(98), rec(100)], 100)).toEqual([
      { day: 94, done: false },
      { day: 95, done: false },
      { day: 96, done: false },
      { day: 97, done: false },
      { day: 98, done: true },
      { day: 99, done: false },
      { day: 100, done: true },
    ]);
  });
});
