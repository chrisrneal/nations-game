/**
 * The profile book migration is tested with a real old file (S9). The file in
 * fixtures/ was written by the game before K12 (profile book version 1): two
 * children, one with five finished days (four in a row, then a gap) and a
 * won bonus round, one Kindy child with two.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProfileBook } from '@snacks/contracts';
import { AVATARS, PROFILE_BOOK_VERSION, addProfile, emptyBook, readBook, recordBonus, recordDaily } from '@snacks/sim';

const D = 20_400;
const done = (day: number) => ({ day, fed: 14, hungry: 1, retries: 0, hints: 0 });
const finish = (book: ProfileBook, id: string, ...list: number[]): ProfileBook => list.reduce((b, day) => recordDaily(b, id, done(day)), book);
const mine = (book: ProfileBook, id: string) => book.profiles.find((p) => p.id === id)!;
const v1 = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('../fixtures/profile-book-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;

function made(...drafts: { name?: string; avatar?: (typeof AVATARS)[number]; mode?: 'main' | 'kindy' }[]): ProfileBook {
  let book = emptyBook();
  drafts.forEach((d, i) => {
    book = addProfile(book, { name: d.name ?? '', avatar: d.avatar ?? AVATARS[i]!, mode: d.mode ?? 'main' }).book;
  });
  return book;
}

describe('the profile book, version 1 to 2 (K12)', () => {
  it('is the new version, and the fixture is a real version-1 book', () => {
    expect(PROFILE_BOOK_VERSION).toBe(2);
    expect(v1().version).toBe(1);
    expect(JSON.stringify(v1())).not.toContain('stickers');
  });

  it('keeps every profile, day and best streak, and gives each the stickers its past earned', () => {
    const book = readBook(v1());
    expect(book.version).toBe(2);
    const [sam, kindy] = book.profiles;
    expect(sam!.history.map((r) => r.day)).toEqual([D, D + 1, D + 2, D + 3, D + 6]);
    expect(sam!.best).toBe(4);
    expect(sam!.active).toBe(`daily-main-${D + 6}`);
    expect(sam!.stickers.filter((s) => s.kind === 'daily')).toHaveLength(5);
    expect(sam!.stickers.filter((s) => s.kind === 'bonus')).toHaveLength(1);
    expect(sam!.cosmetics.map((c) => [c.id, c.day])).toEqual([['party-hat', D + 2]]);
    expect(kindy!.stickers).toHaveLength(2);
    expect(kindy!.cosmetics).toEqual([]);
  });

  it('shows nothing as new: a child is not showered with reveals on the first launch', () => {
    for (const p of readBook(v1()).profiles) {
      expect(p.stickers.every((s) => s.seen)).toBe(true);
      expect(p.cosmetics.every((c) => c.seen)).toBe(true);
      expect(p.worn).toEqual({ hat: null, outfit: null });
    }
  });

  it('gives exactly what finishing those days one at a time would have given', () => {
    const migrated = readBook(v1());
    let live = made({ name: 'Sam', avatar: 'dog' }, { avatar: 'cat', mode: 'kindy' });
    for (const day of [D, D + 1, D + 2, D + 3, D + 6]) live = finish(live, 'p1', day);
    live = recordBonus(live, 'p1', D + 1);
    live = finish(live, 'p2', D + 5, D + 6);
    for (const id of ['p1', 'p2']) {
      const flat = (b: ProfileBook) => mine(b, id).stickers.map((s) => `${s.day} ${s.kind} ${s.id}`).sort();
      expect(flat(migrated)).toEqual(flat(live));
      expect(mine(migrated, id).cosmetics.map((c) => [c.id, c.day])).toEqual(mine(live, id).cosmetics.map((c) => [c.id, c.day]));
    }
  });

  it('reads the migrated book back unchanged (a version-2 book round-trips)', () => {
    const once = readBook(v1());
    expect(readBook(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('refuses a book from a newer game and repairs a damaged book of its own version', () => {
    expect(() => readBook({ ...v1(), version: 3 })).toThrow(/newer version/);
    const book = readBook(v1());
    const good = book.profiles[0]!.stickers;
    const damaged = JSON.parse(JSON.stringify(book)) as { profiles: Record<string, unknown>[] };
    damaged.profiles[0] = {
      ...damaged.profiles[0],
      stickers: [{ id: 'nonsense', kind: 'daily', day: D, seen: true }, { id: 'gold-apple', kind: 'daily', day: D, seen: true }, ...good, good[0]],
      cosmetics: [{ id: 'crown', day: D, streak: 14, seen: 'yes' }, { id: 'crown', day: D, streak: 14, seen: true }],
      worn: { hat: 'cape', outfit: 'party-hat' },
    };
    const fixed = readBook(damaged).profiles[0]!;
    expect(fixed.stickers.map((s) => s.id)).toEqual(good.map((s) => s.id));
    expect(fixed.cosmetics.map((c) => c.id)).toEqual(['crown']);
    expect(fixed.worn).toEqual({ hat: null, outfit: null });
  });
});
