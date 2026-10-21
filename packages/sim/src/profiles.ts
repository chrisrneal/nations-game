import type { AvatarId, CosmeticSlot, DayRecord, EarnedCosmetic, EarnedSticker, HomeView, Mode, Profile, ProfileBook, ProfileDraft, ProfileEdit, ProfileView, StickerKind, Worn } from '@snacks/contracts';
import { CATALOGUE, COSMETICS, STICKERS, cosmeticFor, stickerFor } from './stickers.ts';
import { SNACK_TUNABLES as T } from './tunables.ts';

/**
 * Profiles, finished days and the streak (RULES 9, 12; decision record K7).
 *
 * The profile book is a plain value: the host keeps it on the device and
 * passes in today (days since 1970-01-01 on the device's calendar, D18).
 * Nothing here reads a clock, so a clock set backwards or a timezone change
 * can only change which day is "today", never break the book.
 */

/** Current profile-book format. Bump it with a migration in BOOK_MIGRATIONS. */
/** 2 added each profile's sticker book and wardrobe (RULES 9a, K12). */
export const PROFILE_BOOK_VERSION = 2;

const NOTHING_WORN: Worn = { hat: null, outfit: null };

/** The pictures, in the order the picker offers them. The first is the default profile's. */
export const AVATARS: readonly AvatarId[] = ['dog', 'cat', 'fox', 'panda', 'frog', 'owl', 'bunny', 'tiger'];

const MODES: readonly Mode[] = ['main', 'kindy'];

/** A finished daily as the host reports it; the bonus flag is added by recordBonus. Hints count 0 when left out (a save from before K11). */
export type FinishedDay = Omit<DayRecord, 'bonus' | 'hints'> & { readonly hints?: number };

/** A change to the book: the new book, or the old one and why it was refused. */
export interface BookChange {
  readonly book: ProfileBook;
  readonly error: string | null;
  /** The profile made or changed; null when refused. */
  readonly id: string | null;
}

export function emptyBook(): ProfileBook {
  return { format: 'snack-attack-profiles', version: PROFILE_BOOK_VERSION, nextId: 1, profiles: [] };
}

function refuse(book: ProfileBook, error: string): BookChange {
  return { book, error, id: null };
}

/** A name as stored: no control characters, single spaces, trimmed, at most `nameLength` characters. */
function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const plain = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return [...plain].slice(0, T.nameLength.value).join('').trim();
}

function avatarProblem(book: ProfileBook, avatar: AvatarId, self: string | null): string | null {
  if (!AVATARS.includes(avatar)) return 'Pick one of the pictures.';
  if (book.profiles.some((p) => p.avatar === avatar && p.id !== self)) return 'Another child has that picture.';
  return null;
}

/** A new profile (RULES 12): a picture nobody else has, an optional name and a mode. */
export function addProfile(book: ProfileBook, draft: ProfileDraft): BookChange {
  if (book.profiles.length >= T.maxProfiles.value) return refuse(book, `${T.maxProfiles.value} profiles is the most on one phone.`);
  if (!MODES.includes(draft.mode)) return refuse(book, 'Pick a mode: Main or Kindy.');
  const problem = avatarProblem(book, draft.avatar, null);
  if (problem !== null) return refuse(book, problem);
  const id = `p${book.nextId}`;
  const profile: Profile = { id, name: cleanName(draft.name), avatar: draft.avatar, mode: draft.mode, history: [], best: 0, active: null, stickers: [], cosmetics: [], worn: NOTHING_WORN };
  return { book: { ...book, nextId: book.nextId + 1, profiles: [...book.profiles, profile] }, error: null, id };
}

function update(book: ProfileBook, id: string, change: (p: Profile) => Profile): ProfileBook {
  return { ...book, profiles: book.profiles.map((p) => (p.id === id ? change(p) : p)) };
}

/** A new name or picture. The mode stays as the profile was made (RULES 12). */
export function editProfile(book: ProfileBook, id: string, edit: ProfileEdit): BookChange {
  if (!book.profiles.some((p) => p.id === id)) return refuse(book, 'No such profile.');
  const problem = avatarProblem(book, edit.avatar, id);
  if (problem !== null) return refuse(book, problem);
  return { book: update(book, id, (p) => ({ ...p, name: cleanName(edit.name), avatar: edit.avatar })), error: null, id };
}

/** Deletes a profile (its saves are the host's to delete). The last profile stays: the game needs someone to play. */
export function removeProfile(book: ProfileBook, id: string): BookChange {
  if (!book.profiles.some((p) => p.id === id)) return refuse(book, 'No such profile.');
  if (book.profiles.length === 1) return refuse(book, 'The last profile can’t be deleted. Add another one first.');
  return { book: { ...book, profiles: book.profiles.filter((p) => p.id !== id) }, error: null, id };
}

/** The save slot a profile is playing, so it reopens there. */
export function setActive(book: ProfileBook, id: string, slot: string | null): ProfileBook {
  return update(book, id, (p) => (p.active === slot ? p : { ...p, active: slot }));
}

/** Longest run of consecutive finished days. */
export function longestStreak(history: readonly DayRecord[]): number {
  const sorted = [...new Set(history.map((r) => r.day))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * The streak (RULES 9, K7): consecutive days with the daily finished, ending
 * today, or ending yesterday while today is still to play. A missed day
 * makes it 0. Days after today (a clock set backwards) are ignored.
 */
export function streakOf(history: readonly DayRecord[], today: number): number {
  const finished = new Set(history.map((r) => r.day));
  let day = finished.has(today) ? today : today - 1;
  let streak = 0;
  while (finished.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

/**
 * Sorted, one record per day: the newest `historyKept`, and all of the
 * newest run however long, so trimming never shortens a streak still going.
 * The best streak never drops.
 */
function withHistory(profile: Profile, history: readonly DayRecord[]): Profile {
  const sorted = [...history].sort((a, b) => a.day - b.day);
  let runStart = sorted.length - 1;
  while (runStart > 0 && sorted[runStart - 1]!.day === sorted[runStart]!.day - 1) runStart -= 1;
  const kept = sorted.slice(Math.max(0, Math.min(runStart, sorted.length - T.historyKept.value)));
  return { ...profile, history: kept, best: Math.max(profile.best, longestStreak(sorted)) };
}

/** Adds a sticker for a finished day or bonus round, if the pool has one left (RULES 9a). */
function withSticker(p: Profile, day: number, kind: StickerKind, seen: boolean): Profile {
  const id = stickerFor(p.id, day, kind, new Set(p.stickers.map((s) => s.id)));
  return id === null ? p : { ...p, stickers: [...p.stickers, { id, kind, day, seen }] };
}

/** Adds the hat or outfit a streak ending on `day` has reached, if it has not been earned yet. */
function withMilestone(p: Profile, day: number, seen: boolean): Profile {
  const streak = streakOf(p.history, day);
  const id = cosmeticFor(streak, new Set(p.cosmetics.map((c) => c.id)));
  return id === null ? p : { ...p, cosmetics: [...p.cosmetics, { id, day, streak, seen }] };
}

/**
 * A finished daily (RULES 9). The host passes the puzzle's day, so a run
 * that crosses midnight counts for the day it started. A day already
 * recorded stays as first finished: recording is safe to repeat, and earns
 * its sticker (and any streak milestone's hat) exactly once (RULES 9a).
 */
export function recordDaily(book: ProfileBook, id: string, finished: FinishedDay): ProfileBook {
  return update(book, id, (p) => {
    if (p.history.some((r) => r.day === finished.day)) return p;
    const record: DayRecord = { day: finished.day, fed: finished.fed, hungry: finished.hungry, retries: finished.retries, hints: finished.hints ?? 0, bonus: false };
    return withMilestone(withSticker(withHistory(p, [...p.history, record]), finished.day, 'daily', false), finished.day, false);
  });
}

/** That day's bonus round was won (D11): marks the day's record and gives a bonus sticker. No streak, and nothing without the daily. */
export function recordBonus(book: ProfileBook, id: string, day: number): ProfileBook {
  return update(book, id, (p) => {
    if (!p.history.some((r) => r.day === day && !r.bonus)) return p;
    return withSticker({ ...p, history: p.history.map((r) => (r.day === day ? { ...r, bonus: true } : r)) }, day, 'bonus', false);
  });
}

/**
 * Wears an earned hat or outfit on the profile's own avatar, or takes the
 * slot's item off with null (RULES 9a). Looks only: nothing here reaches the
 * game. Refused for anything not earned or put in the wrong slot.
 */
export function equipCosmetic(book: ProfileBook, id: string, slot: CosmeticSlot, cosmetic: string | null): BookChange {
  const profile = book.profiles.find((p) => p.id === id);
  if (profile === undefined) return refuse(book, 'No such profile.');
  if (cosmetic !== null) {
    const def = COSMETICS.find((c) => c.id === cosmetic);
    if (def === undefined || def.slot !== slot) return refuse(book, 'That does not go there.');
    if (!profile.cosmetics.some((c) => c.id === cosmetic)) return refuse(book, 'That has not been earned yet.');
  }
  return { book: update(book, id, (p) => ({ ...p, worn: { ...p.worn, [slot]: cosmetic } })), error: null, id };
}

/** The reveal has been shown or skipped: everything earned so far is seen. The same book comes back when there is nothing to mark. */
export function acknowledgeStickers(book: ProfileBook, id: string): ProfileBook {
  const profile = book.profiles.find((p) => p.id === id);
  if (profile === undefined || (profile.stickers.every((s) => s.seen) && profile.cosmetics.every((c) => c.seen))) return book;
  return update(book, id, (p) => ({ ...p, stickers: p.stickers.map((s) => (s.seen ? s : { ...s, seen: true })), cosmetics: p.cosmetics.map((c) => (c.seen ? c : { ...c, seen: true })) }));
}

export function profileView(profile: Profile, today: number): ProfileView {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    mode: profile.mode,
    streak: streakOf(profile.history, today),
    best: profile.best,
    today: profile.history.find((r) => r.day === today) ?? null,
    recent: profile.history.slice(Math.max(0, profile.history.length - T.recentDays.value)),
    stickers: profile.stickers,
    cosmetics: profile.cosmetics,
    worn: profile.worn,
    unseen: { stickers: profile.stickers.filter((x) => !x.seen), cosmetics: profile.cosmetics.filter((x) => !x.seen) },
  };
}

export function homeView(book: ProfileBook, current: string | null, today: number): HomeView {
  return { profiles: book.profiles.map((p) => profileView(p, today)), current: book.profiles.some((p) => p.id === current) ? current : null, day: today, avatars: AVATARS, catalogue: CATALOGUE };
}

// ---- reading a stored book ----

export type BookMigration = (book: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM (S9). Version 1 is the
 * first stored book. Version 0 was no book at all: one save per device,
 * folded into a first profile by `legacyBook`.
 */
export const BOOK_MIGRATIONS: Readonly<Record<number, BookMigration>> = {
  // 1 to 2 (K12): every profile gets the sticker book and hats its finished days would have earned, all marked seen.
  1: (book) => ({ ...book, version: 2, profiles: Array.isArray(book.profiles) ? book.profiles.map(backfill) : book.profiles }),
};

const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);
const count = (v: unknown): number => Math.max(0, whole(v) ?? 0);

function readRecord(raw: unknown): DayRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const day = whole(r.day);
  if (day === null) return null;
  // `hints` came with K11 in the same book version: a record from before has none, so 0 (an older app ignores the field).
  return { day, fed: count(r.fed), hungry: count(r.hungry), retries: count(r.retries), hints: count(r.hints), bonus: r.bonus === true };
}

function readProfile(raw: unknown, taken: readonly Profile[]): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^p\d+$/.test(r.id) || taken.some((p) => p.id === r.id)) return null;
  const avatar = r.avatar as AvatarId;
  const mode = r.mode as Mode;
  if (!AVATARS.includes(avatar) || taken.some((p) => p.avatar === avatar) || !MODES.includes(mode)) return null;
  const records = Array.isArray(r.history) ? r.history.map(readRecord).filter((x): x is DayRecord => x !== null) : [];
  const byDay = new Map<number, DayRecord>();
  for (const record of records) if (!byDay.has(record.day)) byDay.set(record.day, record);
  const cosmetics = readCosmetics(r.cosmetics);
  const base: Profile = { id: r.id, name: cleanName(r.name), avatar, mode, history: [], best: count(r.best), active: typeof r.active === 'string' ? r.active : null, stickers: readStickers(r.stickers), cosmetics, worn: readWorn(r.worn, cosmetics) };
  return withHistory(base, [...byDay.values()]);
}

/** Stickers as stored: ones in the catalogue under their own kind, each once, in the order they were earned. A bad `seen` reads as seen, so nothing replays. */
function readStickers(raw: unknown): EarnedSticker[] {
  const out = new Map<string, EarnedSticker>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const def = STICKERS.find((s) => s.id === e.id);
    const day = whole(e.day);
    if (def === undefined || def.kind !== e.kind || day === null || out.has(def.id)) continue;
    out.set(def.id, { id: def.id, kind: def.kind, day, seen: e.seen !== false });
  }
  return [...out.values()];
}

function readCosmetics(raw: unknown): EarnedCosmetic[] {
  const out = new Map<string, EarnedCosmetic>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const def = COSMETICS.find((c) => c.id === e.id);
    const day = whole(e.day);
    if (def === undefined || day === null || out.has(def.id)) continue;
    out.set(def.id, { id: def.id, day, streak: def.streak, seen: e.seen !== false });
  }
  return [...out.values()];
}

/** What is worn must be earned and in its own slot; anything else is taken off. */
function readWorn(raw: unknown, owned: readonly EarnedCosmetic[]): Worn {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = (slot: CosmeticSlot): string | null => {
    const def = COSMETICS.find((c) => c.id === r[slot]);
    return def !== undefined && def.slot === slot && owned.some((c) => c.id === def.id) ? def.id : null;
  };
  return { hat: pick('hat'), outfit: pick('outfit') };
}

/**
 * Version 1 to 2: a profile from before the sticker book gets what its
 * finished days would have given, day by day with the same rules as live
 * play, so a migrated book and a played one are the same. All of it is
 * marked seen: nobody is greeted by a reveal for days long past.
 */
function backfill(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return raw;
  const byDay = new Map<number, DayRecord>();
  for (const entry of Array.isArray(r.history) ? r.history : []) {
    const record = readRecord(entry);
    if (record !== null && !byDay.has(record.day)) byDay.set(record.day, record);
  }
  const history = [...byDay.values()].sort((a, b) => a.day - b.day);
  let p: Profile = { id: r.id, name: '', avatar: AVATARS[0]!, mode: 'main', history, best: 0, active: null, stickers: [], cosmetics: [], worn: NOTHING_WORN };
  for (const record of history) {
    p = withMilestone(withSticker(p, record.day, 'daily', true), record.day, true);
    if (record.bonus) p = withSticker(p, record.day, 'bonus', true);
  }
  return { ...r, stickers: p.stickers, cosmetics: p.cosmetics, worn: NOTHING_WORN };
}

/**
 * Reads a stored profile book: migrates an older one, refuses one from a
 * newer game, and repairs what it can rather than crash. Profiles without a
 * valid id, picture or mode, or repeating another's, are dropped; bad days
 * are dropped and counts made whole.
 */
export function readBook(raw: unknown): ProfileBook {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 'snack-attack-profiles') throw new Error('That is not a Snack Attack profile book');
  let book = raw as Record<string, unknown>;
  let version = whole(book.version) ?? 0;
  if (version > PROFILE_BOOK_VERSION) throw new Error('The profiles are from a newer version of the game; update the app');
  while (version < PROFILE_BOOK_VERSION) {
    const migrate = BOOK_MIGRATIONS[version];
    if (migrate === undefined) throw new Error(`No way to read version ${version} profiles`);
    book = migrate(book);
    version = whole(book.version) ?? PROFILE_BOOK_VERSION;
  }
  const profiles: Profile[] = [];
  for (const entry of Array.isArray(book.profiles) ? book.profiles : []) {
    if (profiles.length >= T.maxProfiles.value) break;
    const profile = readProfile(entry, profiles);
    if (profile !== null) profiles.push(profile);
  }
  const highest = Math.max(0, ...profiles.map((p) => Number(p.id.slice(1))));
  return { format: 'snack-attack-profiles', version: PROFILE_BOOK_VERSION, nextId: Math.max(count(book.nextId), highest + 1), profiles };
}

/**
 * Version 0 to 1 (K7): before profiles a device had one player. Their game
 * becomes the first profile's, with every daily they finished and every
 * bonus round they won, so no progress is lost. A new device gets the same
 * first profile, empty.
 */
export function legacyBook(active: string | null, finished: readonly FinishedDay[], bonusWon: readonly number[]): ProfileBook {
  const first = addProfile(emptyBook(), { name: '', avatar: AVATARS[0]!, mode: 'main' });
  const id = first.id!;
  let book = setActive(first.book, id, active);
  for (const day of finished) book = recordDaily(book, id, day);
  for (const day of bonusWon) book = recordBonus(book, id, day);
  // Days long past: no reveal for them (K12).
  return acknowledgeStickers(book, id);
}
