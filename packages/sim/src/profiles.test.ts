import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { DayRecord, ProfileBook } from '@snacks/contracts';
import {
  AVATARS,
  acknowledgeStickers,
  equipCosmetic,
  PROFILE_BOOK_VERSION,
  addProfile,
  editProfile,
  emptyBook,
  homeView,
  legacyBook,
  longestStreak,
  profileView,
  readBook,
  recordBonus,
  recordDaily,
  removeProfile,
  setActive,
  streakOf,
} from './profiles.ts';
import { COSMETICS, STICKERS } from './stickers.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

const D = 20_400;

function made(...drafts: { name?: string; avatar?: (typeof AVATARS)[number]; mode?: 'main' | 'kindy' }[]): ProfileBook {
  let book = emptyBook();
  drafts.forEach((d, i) => {
    const r = addProfile(book, { name: d.name ?? '', avatar: d.avatar ?? AVATARS[i]!, mode: d.mode ?? 'main' });
    expect(r.error).toBeNull();
    book = r.book;
  });
  return book;
}

const done = (day: number, retries = 0, hints = 0) => ({ day, fed: 14, hungry: 1, retries, hints });
const days = (...list: number[]): DayRecord[] => list.map((day) => ({ ...done(day), bonus: false }));

describe('making, editing and deleting profiles (RULES 12)', () => {
  it('gives each profile the next id, a trimmed optional name, an avatar and a mode', () => {
    const book = made({ name: '  Sam  ' }, { mode: 'kindy' });
    expect(book.profiles.map((p) => [p.id, p.name, p.avatar, p.mode])).toEqual([
      ['p1', 'Sam', AVATARS[0], 'main'],
      ['p2', '', AVATARS[1], 'kindy'],
    ]);
    expect(book.profiles.every((p) => p.history.length === 0 && p.best === 0 && p.active === null)).toBe(true);
  });

  it('cuts a long name and drops control characters', () => {
    const book = made({ name: `Bob\u0000by${'x'.repeat(40)}` });
    expect(book.profiles[0]!.name).toBe(`Bobby${'x'.repeat(T.nameLength.value - 5)}`);
  });

  it('refuses a picture another child has, an unknown picture or mode, and more than the most profiles', () => {
    const book = made({});
    expect(addProfile(book, { name: '', avatar: AVATARS[0]!, mode: 'main' }).error).toMatch(/picture/);
    expect(addProfile(book, { name: '', avatar: 'dragon' as never, mode: 'main' }).error).toMatch(/picture/);
    expect(addProfile(book, { name: '', avatar: AVATARS[1]!, mode: 'expert' as never }).error).toMatch(/mode/);
    const full = made(...Array.from({ length: T.maxProfiles.value }, () => ({})));
    const r = addProfile(full, { name: '', avatar: AVATARS[T.maxProfiles.value]!, mode: 'main' });
    expect(r.error).toMatch(/most/);
    expect(r.book).toBe(full);
  });

  it('there are enough pictures for the most profiles', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(T.maxProfiles.max);
  });

  it('edits the name and picture, never the mode', () => {
    const book = made({ name: 'Sam' }, { mode: 'kindy' });
    const r = editProfile(book, 'p2', { name: 'Pip', avatar: AVATARS[5]! });
    expect(r.error).toBeNull();
    expect(r.book.profiles[1]).toMatchObject({ name: 'Pip', avatar: AVATARS[5], mode: 'kindy' });
    expect(editProfile(book, 'p2', { name: 'Pip', avatar: AVATARS[0]! }).error).toMatch(/picture/);
    // Keeping your own picture is fine.
    expect(editProfile(book, 'p1', { name: 'Samuel', avatar: AVATARS[0]! }).error).toBeNull();
    expect(editProfile(book, 'p9', { name: 'x', avatar: AVATARS[7]! }).error).toMatch(/No such/);
  });

  it('deletes a profile, never the last one, and never reuses its id', () => {
    const book = made({}, {});
    const r = removeProfile(book, 'p1');
    expect(r.error).toBeNull();
    expect(r.book.profiles.map((p) => p.id)).toEqual(['p2']);
    expect(removeProfile(r.book, 'p2').error).toMatch(/last/);
    expect(removeProfile(book, 'p7').error).toMatch(/No such/);
    const again = addProfile(r.book, { name: '', avatar: AVATARS[0]!, mode: 'main' });
    expect(again.id).toBe('p3');
  });

  it('remembers the slot each profile is playing, separately', () => {
    let book = made({}, {});
    book = setActive(book, 'p1', 'daily-main-20400');
    book = setActive(book, 'p2', 'practice-main');
    expect(book.profiles.map((p) => p.active)).toEqual(['daily-main-20400', 'practice-main']);
  });
});

describe('the streak (RULES 9, D10, decision record K7)', () => {
  it('is 0 with nothing finished', () => {
    expect(streakOf([], D)).toBe(0);
  });

  it('counts consecutive days up to today', () => {
    expect(streakOf(days(D - 2, D - 1, D), D)).toBe(3);
  });

  it('stays alive through today until today is missed: yesterday’s streak still shows', () => {
    expect(streakOf(days(D - 2, D - 1), D)).toBe(2);
  });

  it('a missed day resets it to 0', () => {
    expect(streakOf(days(D - 3, D - 2), D)).toBe(0);
    expect(streakOf(days(D - 5, D - 4, D - 2, D - 1, D), D)).toBe(3);
  });

  it('a day finished after retries counts like any other', () => {
    let book = made({});
    book = recordDaily(book, 'p1', done(D - 1, 0));
    book = recordDaily(book, 'p1', done(D, 4));
    expect(profileView(book.profiles[0]!, D).streak).toBe(2);
  });

  it('a run that started before midnight and finished after counts for the day it started', () => {
    // Started on D, finished at 00:10 on D + 1: the host records the puzzle's day, D.
    let book = made({});
    book = recordDaily(book, 'p1', done(D - 1));
    book = recordDaily(book, 'p1', done(D));
    const view = profileView(book.profiles[0]!, D + 1);
    expect(view.streak).toBe(2);
    expect(view.today).toBeNull();
    expect(view.recent.at(-1)?.day).toBe(D);
  });

  it('a timezone change that moves today back a day neither breaks nor double counts it', () => {
    let book = made({});
    for (const day of [D - 2, D - 1, D]) book = recordDaily(book, 'p1', done(day));
    // Flying west: today is D - 1 again for a while.
    expect(profileView(book.profiles[0]!, D - 1)).toMatchObject({ streak: 2, today: { day: D - 1 } });
    book = recordDaily(book, 'p1', done(D - 1));
    expect(book.profiles[0]!.history.map((r) => r.day)).toEqual([D - 2, D - 1, D]);
    // Back home: the same streak.
    expect(profileView(book.profiles[0]!, D).streak).toBe(3);
  });

  it('a timezone change that skips a day forward is a missed day', () => {
    const book = recordDaily(made({}), 'p1', done(D));
    expect(profileView(book.profiles[0]!, D + 2).streak).toBe(0);
  });

  it('a clock set backwards never crashes and leaves the history alone', () => {
    let book = made({});
    for (const day of [D - 1, D]) book = recordDaily(book, 'p1', done(day));
    expect(profileView(book.profiles[0]!, D - 400)).toMatchObject({ streak: 0, today: null });
    expect(profileView(book.profiles[0]!, 0).streak).toBe(0);
    expect(profileView(book.profiles[0]!, -5).streak).toBe(0);
    // Finishing the "old" day the clock shows is recorded, and the real streak is untouched.
    book = recordDaily(book, 'p1', done(D - 400));
    expect(profileView(book.profiles[0]!, D - 400).streak).toBe(1);
    expect(profileView(book.profiles[0]!, D).streak).toBe(2);
    expect(book.profiles[0]!.history.map((r) => r.day)).toEqual([D - 400, D - 1, D]);
  });

  it('the best streak is the longest run ever, and survives a reset', () => {
    let book = made({});
    for (const day of [D - 10, D - 9, D - 8, D - 7, D - 1, D]) book = recordDaily(book, 'p1', done(day));
    const view = profileView(book.profiles[0]!, D);
    expect(view).toMatchObject({ streak: 2, best: 4 });
    expect(longestStreak(book.profiles[0]!.history)).toBe(4);
  });

  it('hints used are kept with the day, and never change the streak (RULES 8b)', () => {
    let book = made({});
    book = recordDaily(book, 'p1', done(D - 1, 0, 0));
    book = recordDaily(book, 'p1', done(D, 1, 7));
    expect(profileView(book.profiles[0]!, D)).toMatchObject({ streak: 2, today: { day: D, hints: 7, retries: 1 } });
    // A host from before K11 reports no hints: 0.
    book = recordDaily(book, 'p1', { day: D + 1, fed: 1, hungry: 0, retries: 0 });
    expect(book.profiles[0]!.history.at(-1)?.hints).toBe(0);
    // Stored and read back; a stored day from before K11 has no hints field and reads as 0.
    const raw = JSON.parse(JSON.stringify(book));
    delete raw.profiles[0].history[0].hints;
    expect(readBook(raw).profiles[0]!.history.map((r) => r.hints)).toEqual([0, 7, 0]);
  });

  it('recording a day twice changes nothing: the first finish stands', () => {
    let book = recordDaily(made({}), 'p1', done(D));
    const once = book;
    book = recordDaily(book, 'p1', { day: D, fed: 2, hungry: 3, retries: 9 });
    expect(book.profiles[0]!.history).toEqual(once.profiles[0]!.history);
  });

  it('the bonus round marks the day but never makes a streak; it needs the daily first', () => {
    let book = made({});
    book = recordBonus(book, 'p1', D);
    expect(book.profiles[0]!.history).toEqual([]);
    book = recordBonus(recordDaily(book, 'p1', done(D)), 'p1', D);
    expect(profileView(book.profiles[0]!, D)).toMatchObject({ streak: 1, today: { day: D, bonus: true } });
  });

  it('never trims a streak that is still going, however long', () => {
    let book = made({});
    const total = T.historyKept.value + 30;
    for (let i = 0; i < total; i++) book = recordDaily(book, 'p1', done(D - total + 1 + i));
    const p = book.profiles[0]!;
    expect(p.history.length).toBe(total);
    expect(profileView(p, D)).toMatchObject({ streak: total, best: total });
  });

  it('once a streak ends, keeps only the newest days of history, and the best streak with them', () => {
    let book = made({});
    const total = T.historyKept.value + 30;
    // A long run ending the day before yesterday, a missed day, then today.
    for (let i = 0; i < total; i++) book = recordDaily(book, 'p1', done(D - 1 - total + i));
    book = recordDaily(book, 'p1', done(D));
    const p = book.profiles[0]!;
    expect(p.history.length).toBe(T.historyKept.value);
    expect(p.history[0]!.day).toBe(D - T.historyKept.value);
    expect(profileView(p, D)).toMatchObject({ streak: 1, best: total });
    expect(profileView(p, D).recent.length).toBe(T.recentDays.value);
  });

  it('profiles keep their own history: one finishing never touches another', () => {
    let book = made({}, {});
    book = recordDaily(book, 'p2', done(D));
    expect(book.profiles[0]!.history).toEqual([]);
    expect(homeView(book, 'p2', D).profiles.map((p) => p.streak)).toEqual([0, 1]);
  });

  it('property: the streak is the run of finished days ending today or yesterday', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: D - 40, max: D + 3 }), { maxLength: 40 }), fc.integer({ min: D - 45, max: D + 5 }), (list, today) => {
        const set = new Set(list);
        let book = made({});
        for (const day of list) book = recordDaily(book, 'p1', done(day));
        const streak = streakOf(book.profiles[0]!.history, today);
        const end = set.has(today) ? today : today - 1;
        for (let i = 0; i < streak; i++) expect(set.has(end - i)).toBe(true);
        expect(set.has(end - streak)).toBe(false);
        expect(book.profiles[0]!.best).toBeGreaterThanOrEqual(streak);
      }),
    );
  });
});

describe('the profile save: versioned, read with care (S9, K7)', () => {
  it('a JSON round trip gives the same book', () => {
    let book = made({ name: 'Sam' }, { mode: 'kindy' });
    book = setActive(recordDaily(book, 'p1', done(D)), 'p1', 'daily-main-20400');
    expect(readBook(JSON.parse(JSON.stringify(book)))).toEqual(book);
    expect(book.version).toBe(PROFILE_BOOK_VERSION);
  });

  it('refuses something that is not a profile book, or one from a newer game', () => {
    expect(() => readBook(null)).toThrow(/not a Snack Attack profile/);
    expect(() => readBook({ format: 'snack-attack-save' })).toThrow(/not a Snack Attack profile/);
    expect(() => readBook({ ...emptyBook(), version: PROFILE_BOOK_VERSION + 1 })).toThrow(/newer version/);
  });

  it('repairs a damaged book instead of crashing: bad profiles, bad days and duplicates go', () => {
    const raw = {
      format: 'snack-attack-profiles',
      version: PROFILE_BOOK_VERSION,
      nextId: 'x',
      profiles: [
        { id: 'p1', name: 7, avatar: 'dog', mode: 'main', history: [{ day: D }, { day: D }, { day: 1.5 }, 'x', { day: D - 1, fed: -3 }], best: -1, active: 9 },
        { id: 'p1', avatar: 'cat', mode: 'main' },
        { id: 'p4', avatar: 'dog', mode: 'main' },
        { id: 'p5', avatar: 'unicorn', mode: 'main' },
        { avatar: 'fox', mode: 'main' },
        { id: 'p6', avatar: 'fox', mode: 'kindy', history: null },
      ],
    };
    const book = readBook(raw);
    expect(book.profiles.map((p) => p.id)).toEqual(['p1', 'p6']);
    expect(book.nextId).toBe(7);
    const p1 = book.profiles[0]!;
    expect(p1).toMatchObject({ name: '', active: null, best: 2 });
    expect(p1.history).toEqual([
      { day: D - 1, fed: 0, hungry: 0, retries: 0, hints: 0, bonus: false },
      { day: D, fed: 0, hungry: 0, retries: 0, hints: 0, bonus: false },
    ]);
    expect(book.profiles[1]!.history).toEqual([]);
  });

  it('folds the old single save into a first profile, keeping its game and finished days (version 0)', () => {
    const book = legacyBook('daily-main-20400', [done(D - 1, 2), done(D - 2)], [D - 1]);
    expect(book.version).toBe(PROFILE_BOOK_VERSION);
    expect(book.profiles).toHaveLength(1);
    expect(book.profiles[0]).toMatchObject({ id: 'p1', mode: 'main', name: '', avatar: AVATARS[0], active: 'daily-main-20400', best: 2 });
    expect(book.profiles[0]!.history).toEqual([
      { ...done(D - 2), bonus: false },
      { ...done(D - 1, 2), bonus: true },
    ]);
    expect(profileView(book.profiles[0]!, D).streak).toBe(2);
    expect(readBook(JSON.parse(JSON.stringify(book)))).toEqual(book);
  });

  it('a fresh device folds to the same first profile with nothing in it', () => {
    expect(legacyBook(null, [], [])).toEqual(addProfile(emptyBook(), { name: '', avatar: AVATARS[0]!, mode: 'main' }).book);
  });
});

// ---- the sticker book and the wardrobe (RULES 9a, K12) ----

const finish = (book: ProfileBook, id: string, ...list: number[]): ProfileBook => list.reduce((b, day) => recordDaily(b, id, done(day)), book);
const mine = (book: ProfileBook, id: string) => book.profiles.find((p) => p.id === id)!;

describe('earning (RULES 9a)', () => {
  it('a new profile has an empty book, nothing worn', () => {
    const p = mine(made({}), 'p1');
    expect(p.stickers).toEqual([]);
    expect(p.cosmetics).toEqual([]);
    expect(p.worn).toEqual({ hat: null, outfit: null });
  });

  it('a finished daily gives one daily sticker, not yet seen, and recording it again gives no more', () => {
    const once = finish(made({}), 'p1', D);
    const p = mine(once, 'p1');
    expect(p.stickers).toHaveLength(1);
    expect(p.stickers[0]).toMatchObject({ kind: 'daily', day: D, seen: false });
    expect(STICKERS.find((s) => s.id === p.stickers[0]!.id)?.kind).toBe('daily');
    expect(mine(finish(once, 'p1', D), 'p1').stickers).toHaveLength(1);
  });

  it('the first sticker is a function of the profile and the day, not of when it is claimed', () => {
    const a = mine(finish(made({}), 'p1', D), 'p1').stickers[0]!.id;
    const b = mine(finish(made({}), 'p1', D), 'p1').stickers[0]!.id;
    expect(a).toBe(b);
    const others = new Set(Array.from({ length: 6 }, (_, i) => mine(finish(made({}), 'p1', D + i), 'p1').stickers[0]!.id));
    expect(others.size).toBeGreaterThan(1);
  });

  it('a won bonus round gives one bonus sticker, only with its daily, and only once', () => {
    const base = finish(made({}), 'p1', D);
    expect(mine(recordBonus(made({}), 'p1', D), 'p1').stickers).toEqual([]);
    const bonus = recordBonus(base, 'p1', D);
    expect(mine(bonus, 'p1').stickers.map((s) => s.kind)).toEqual(['daily', 'bonus']);
    expect(mine(recordBonus(bonus, 'p1', D), 'p1').stickers).toHaveLength(2);
  });

  it('streak milestones 3, 7, 14 and 30 each give their hat or outfit, once', () => {
    let book = made({});
    const at: number[] = [];
    for (let i = 0; i < 40; i++) {
      const before = mine(book, 'p1').cosmetics.length;
      book = finish(book, 'p1', D + i);
      if (mine(book, 'p1').cosmetics.length > before) at.push(i + 1);
    }
    expect(at).toEqual([3, 7, 14, 30]);
    expect(mine(book, 'p1').cosmetics.map((c) => [c.id, c.streak])).toEqual(COSMETICS.map((c) => [c.id, c.streak]));
  });

  it('a streak that breaks and builds again does not give the same hat twice', () => {
    let book = finish(made({}), 'p1', D, D + 1, D + 2);
    expect(mine(book, 'p1').cosmetics).toHaveLength(1);
    book = finish(book, 'p1', D + 10, D + 11, D + 12);
    expect(mine(book, 'p1').cosmetics).toHaveLength(1);
  });

  it('a full book gives nothing more, but the day is still finished', () => {
    let book = made({});
    for (let i = 0; i < 25; i++) book = finish(book, 'p1', D + i * 2);
    const p = mine(book, 'p1');
    expect(p.history).toHaveLength(25);
    expect(p.stickers).toHaveLength(24);
    expect(new Set(p.stickers.map((s) => s.id)).size).toBe(24);
  });
});

describe('equipping and the reveal (RULES 9a)', () => {
  const streak3 = (): ProfileBook => finish(made({}, {}), 'p1', D, D + 1, D + 2);

  it('wears an earned hat or outfit in its own slot, and takes it off again', () => {
    const worn = equipCosmetic(streak3(), 'p1', 'hat', 'party-hat');
    expect(worn.error).toBeNull();
    expect(mine(worn.book, 'p1').worn).toEqual({ hat: 'party-hat', outfit: null });
    expect(mine(equipCosmetic(worn.book, 'p1', 'hat', null).book, 'p1').worn).toEqual({ hat: null, outfit: null });
  });

  it('refuses what is not earned, what is in the wrong slot and what does not exist', () => {
    const base = streak3();
    for (const [slot, id] of [['outfit', 'scarf'], ['outfit', 'party-hat'], ['hat', 'crown'], ['hat', 'nonsense']] as const) {
      const r = equipCosmetic(base, 'p1', slot, id);
      expect(r.error).not.toBeNull();
      expect(r.book).toBe(base);
    }
    expect(equipCosmetic(base, 'p9', 'hat', 'party-hat').error).not.toBeNull();
  });

  it('marking things seen clears the reveal and nothing else', () => {
    const base = streak3();
    expect(mine(base, 'p1').stickers.every((s) => !s.seen)).toBe(true);
    const seen = acknowledgeStickers(base, 'p1');
    const p = mine(seen, 'p1');
    expect(p.stickers.every((s) => s.seen) && p.cosmetics.every((c) => c.seen)).toBe(true);
    expect(p.stickers.map((s) => s.id)).toEqual(mine(base, 'p1').stickers.map((s) => s.id));
    expect(acknowledgeStickers(seen, 'p1')).toBe(seen);
  });

  it('the profile view lists what is unseen', () => {
    const base = streak3();
    const view = profileView(mine(base, 'p1'), D + 2);
    expect(view.unseen.stickers).toHaveLength(3);
    expect(view.unseen.cosmetics.map((c) => c.id)).toEqual(['party-hat']);
    expect(profileView(mine(acknowledgeStickers(base, 'p1'), 'p1'), D + 2).unseen).toEqual({ stickers: [], cosmetics: [] });
  });
});

describe('every profile has its own book', () => {
  it('earning, equipping and revealing for one child leave the other child exactly as it was', () => {
    const base = finish(made({}, { mode: 'kindy' }), 'p2', D);
    const before = JSON.stringify(mine(base, 'p2'));
    let book = finish(base, 'p1', D, D + 1, D + 2);
    book = recordBonus(book, 'p1', D);
    book = equipCosmetic(book, 'p1', 'hat', 'party-hat').book;
    book = acknowledgeStickers(book, 'p1');
    expect(JSON.stringify(mine(book, 'p2'))).toBe(before);
  });

  it('deleting one profile does not touch another’s book', () => {
    let book = finish(made({}, {}, { mode: 'kindy' }), 'p1', D, D + 1, D + 2);
    book = finish(book, 'p2', D, D + 1, D + 2);
    book = equipCosmetic(book, 'p2', 'hat', 'party-hat').book;
    book = finish(book, 'p3', D);
    const keep = JSON.stringify([mine(book, 'p2'), mine(book, 'p3')]);
    const removed = removeProfile(book, 'p1');
    expect(removed.error).toBeNull();
    expect(removed.book.profiles.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(JSON.stringify(removed.book.profiles)).toBe(keep);
    expect(mine(removeProfile(removed.book, 'p3').book, 'p2').worn.hat).toBe('party-hat');
  });

  it('a new profile never inherits a deleted profile’s book', () => {
    let book = finish(made({}, {}), 'p1', D, D + 1, D + 2);
    book = removeProfile(book, 'p1').book;
    const added = addProfile(book, { name: '', avatar: AVATARS[0]!, mode: 'main' });
    expect(added.id).toBe('p3');
    expect(mine(added.book, 'p3').stickers).toEqual([]);
  });
});
