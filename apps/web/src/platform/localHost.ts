import type { GameCommand, GameSaveFile, GameSpec, HomeView, Mode, Profile, ProfileBook, ProfileDraft, ProfileEdit, Round } from '@snacks/contracts';
import { AVATARS, addProfile, editProfile, homeView, legacyBook, readBook, recordBonus, recordDaily, removeProfile, setActive, type FinishedDay } from '@snacks/sim';
import type { EngineUpdate, GameEngine } from './engine.ts';
import type { SaveStore } from './saves.ts';

/** What the host hands the interface after every change to the game: the engine's update and whose game it is. */
export interface GameUpdate extends EngineUpdate {
  /** The profile playing this game. */
  readonly profile: string;
}

/**
 * The Host the interface talks to (S3). Everything is async, so the interface
 * cannot tell the sim runs in a Web Worker; it sends commands and reads Views.
 *
 * Profiles (RULES 12, K7): every child on the device has a profile, and each
 * profile has its own save slots: today's daily (finished once, then it shows
 * its result, RULES 9), today's bonus round, and practice. The slot a profile
 * is playing is remembered, so it reopens where that child left off.
 */
export interface GameHost {
  subscribe(listener: (update: GameUpdate) => void): () => void;
  /** Who is on the device, who is playing and their streaks. */
  subscribeHome(listener: (home: HomeView) => void): () => void;
  /** Opens the app: the only profile's game, or the picker when there are more. */
  start(): Promise<void>;
  /** A child tapped their picture: their game, main or Kindy, reopens where they left it. */
  choose(profile: string): Promise<void>;
  /** Apply a command; resolves to why it was refused, or null. */
  submit(command: GameCommand): Promise<string | null>;
  /** Today's daily: continued if started, shown finished if finished. */
  daily(): Promise<void>;
  /** Today's bonus round, once today's daily is finished (RULES 8); today's daily before that, and always for Kindy. */
  bonus(): Promise<void>;
  /** A fresh practice board from a new seed. */
  practice(): Promise<void>;
  /** The grown-ups' menu (D17): each resolves to why it was refused, or null. */
  addProfile(draft: ProfileDraft): Promise<string | null>;
  editProfile(id: string, edit: ProfileEdit): Promise<string | null>;
  deleteProfile(id: string): Promise<string | null>;
  /** Today, as days since 1970-01-01 on this device's calendar (D18). */
  today(): number;
  /** Milliseconds to the next local midnight, when the next daily opens. */
  msToNextDay(): number;
}

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 in local time: the daily changes at local midnight (D18). */
export function dayNumber(ms: number, timezoneOffsetMinutes: number): number {
  return Math.floor((ms - timezoneOffsetMinutes * 60_000) / DAY_MS);
}

type Async<T> = T | Promise<T>;
/** The engine as LocalHost sees it: in-process in tests, a Comlink Remote in the app. */
export type EngineApi = {
  [K in 'newGame' | 'submit' | 'current' | 'exportGame' | 'importGame' | 'summary' | 'inspect']: (...args: Parameters<GameEngine[K]>) => Async<ReturnType<GameEngine[K]>>;
};

/** Where the app kept the slot being played before profiles (localStorage): read once, by the migration. */
export interface LegacySlot {
  get(): string | null;
  clear(): void;
}

export interface LocalHostOptions {
  readonly engine: EngineApi;
  readonly store: SaveStore;
  readonly legacyActive?: LegacySlot;
  /** Wall-clock milliseconds and the timezone offset; only the host reads the clock, never the sim. */
  readonly now?: () => number;
  readonly timezoneOffset?: () => number;
  readonly newSeed?: () => number;
}

/** A slot's name within a profile. */
export function slotFor(mode: Mode, round: Round, day: number): string {
  return round === 'practice' ? `practice-${mode}` : `${round}-${mode}-${day}`;
}

/** Where a profile's slot is stored: its name behind the profile's id. */
const keyFor = (profile: string, slot: string): string => `${profile}/${slot}`;

const BOOK = 'profiles';
/** A profile book that could not be read is kept here, never thrown away. */
const UNREAD = 'profiles-unread';

/** Host backed by a GameEngine in a Web Worker on this device. */
export class LocalHost implements GameHost {
  private readonly listeners = new Set<(update: GameUpdate) => void>();
  private readonly homeListeners = new Set<(home: HomeView) => void>();
  private latest: GameUpdate | null = null;
  private home: HomeView | null = null;
  private book: ProfileBook | null = null;
  private current: string | null = null;
  /** The slot being played in the current profile, or null (the picker). */
  private slot: string | null = null;
  private started: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LocalHostOptions) {}

  subscribe(listener: (update: GameUpdate) => void): () => void {
    this.listeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => this.listeners.delete(listener);
  }

  subscribeHome(listener: (home: HomeView) => void): () => void {
    this.homeListeners.add(listener);
    if (this.home !== null) listener(this.home);
    return () => this.homeListeners.delete(listener);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private offset(now: number): number {
    return this.options.timezoneOffset?.() ?? new Date(now).getTimezoneOffset();
  }

  today(): number {
    const now = this.now();
    return dayNumber(now, this.offset(now));
  }

  msToNextDay(): number {
    const now = this.now();
    const offset = this.offset(now);
    return Math.max(0, (dayNumber(now, offset) + 1) * DAY_MS + offset * 60_000 - now);
  }

  /** One thing at a time: a tap mid-switch must not land in the wrong profile's game. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Idempotent: React's strict mode mounts twice, and the app must open once. */
  start(): Promise<void> {
    this.started ??= this.serial(() => this.open());
    return this.started;
  }

  private async open(): Promise<void> {
    let book = await this.loadBook();
    if (book.profiles.length === 0) book = addProfile(book, { name: '', avatar: AVATARS[0]!, mode: 'main' }).book;
    await this.saveBook(book);
    // More than one child: the picker first (RULES 12). One: straight into their game.
    if (book.profiles.length === 1) await this.enter(book.profiles[0]!.id);
    else this.publishHome();
  }

  choose(profile: string): Promise<void> {
    return this.serial(async () => {
      if (!this.requireBook().profiles.some((p) => p.id === profile)) return;
      await this.enter(profile);
    });
  }

  /** Opens a profile: back to the slot it was playing, or today's daily if that slot is from another day. Main and Kindy alike (RULES 11). */
  private async enter(id: string): Promise<void> {
    this.current = id;
    this.slot = null;
    const profile = this.requireProfile();
    const active = profile.active;
    const today = this.today();
    // A daily or bonus from another day is over: today's daily opens instead.
    const stale = active !== null && !active.startsWith('practice') && !active.endsWith(`-${today}`);
    if (active === null || stale || !(await this.resume(active))) await this.openSlot(this.spec('daily', today));
    this.publishHome();
  }

  submit(command: GameCommand): Promise<string | null> {
    return this.serial(async () => {
      if (this.slot === null) return 'Pick who is playing first.';
      const update = await this.options.engine.submit(command);
      this.publish(update);
      if (update.error === null) await this.autosave();
      if (update.wave !== null && update.view.phase === 'won') await this.recordWin();
      return update.error;
    });
  }

  daily(): Promise<void> {
    return this.serial(() => this.openSlot(this.spec('daily', this.today())));
  }

  bonus(): Promise<void> {
    return this.serial(async () => {
      const today = this.today();
      const profile = this.requireProfile();
      const finished = profile.history.some((r) => r.day === today);
      // Kindy has no bonus round (RULES 8, 11): its finished daily shows again.
      await this.openSlot(this.spec(finished && profile.mode === 'main' ? 'bonus' : 'daily', today));
    });
  }

  practice(): Promise<void> {
    return this.serial(async () => {
      const seed = this.options.newSeed?.() ?? (Math.random() * 0x7fffffff) | 0;
      await this.begin({ ...this.spec('practice', 0), seed });
    });
  }

  addProfile(draft: ProfileDraft): Promise<string | null> {
    return this.serial(async () => {
      const change = addProfile(this.requireBook(), draft);
      if (change.error !== null) return change.error;
      await this.saveBook(change.book);
      this.publishHome();
      return null;
    });
  }

  editProfile(id: string, edit: ProfileEdit): Promise<string | null> {
    return this.serial(async () => {
      const change = editProfile(this.requireBook(), id, edit);
      if (change.error !== null) return change.error;
      await this.saveBook(change.book);
      this.publishHome();
      return null;
    });
  }

  /** Deletes a profile and every save it had. The book goes first, so a profile is never left without its slots. */
  deleteProfile(id: string): Promise<string | null> {
    return this.serial(async () => {
      const change = removeProfile(this.requireBook(), id);
      if (change.error !== null) return change.error;
      await this.saveBook(change.book);
      for (const { slot } of await this.options.store.list()) if (slot.startsWith(`${id}/`)) await this.options.store.remove(slot);
      if (this.current === id) {
        this.current = null;
        this.slot = null;
      }
      this.publishHome();
      return null;
    });
  }

  // ---- games ----

  /** A game spec in the current profile's mode: a Kindy profile plays Kindy boards, from the Kindy salt (RULES 11). */
  private spec(round: Round, day: number): GameSpec {
    return { mode: this.requireProfile().mode, round, day, seed: 0 };
  }

  /** Continue a day's slot if it is saved, else start it. */
  private async openSlot(spec: GameSpec): Promise<void> {
    if (await this.resume(slotFor(spec.mode, spec.round, spec.day))) return;
    await this.begin(spec);
  }

  private async begin(spec: GameSpec): Promise<void> {
    const update = await this.options.engine.newGame(spec);
    await this.use(slotFor(spec.mode, spec.round, spec.day));
    this.publish(update);
    await this.autosave();
  }

  private async resume(slot: string): Promise<boolean> {
    const profile = this.requireProfile().id;
    const record = await this.options.store.get(keyFor(profile, slot));
    if (record === undefined) return false;
    let update: EngineUpdate;
    try {
      update = await this.options.engine.importGame(record.game);
    } catch (error) {
      console.warn(`The save in ${slot} could not be loaded.`, error);
      return false;
    }
    await this.use(slot);
    this.publish(update);
    // A won game is on the record, even if the app closed before it was written down.
    if (update.view.phase === 'won') await this.recordWin();
    return true;
  }

  /** Makes a slot the one being played, and the one this profile reopens. */
  private async use(slot: string): Promise<void> {
    this.slot = slot;
    const book = this.requireBook();
    const id = this.requireProfile().id;
    if (this.requireProfile().active !== slot) await this.saveBook(setActive(book, id, slot));
  }

  private async autosave(): Promise<void> {
    if (this.slot === null || this.current === null) return;
    const game: GameSaveFile = await this.options.engine.exportGame();
    await this.options.store.put({ slot: keyFor(this.current, this.slot), savedAt: this.now(), game });
  }

  /**
   * A won daily goes on the profile's record (RULES 9) under the puzzle's day,
   * the day the run started, even if it ended after midnight (K7). A won
   * bonus round marks that day. Practice records nothing.
   */
  private async recordWin(): Promise<void> {
    const profile = this.requireProfile();
    const s = await this.options.engine.summary();
    if (s.mode !== profile.mode || s.phase !== 'won') return;
    const day = profile.history.find((r) => r.day === s.day);
    let book = this.requireBook();
    if (s.round === 'daily' && day === undefined) book = recordDaily(book, profile.id, { day: s.day, fed: s.fed, hungry: s.hungry, retries: s.retries });
    else if (s.round === 'bonus' && day !== undefined && !day.bonus) book = recordBonus(book, profile.id, s.day);
    else return;
    await this.saveBook(book);
    this.publishHome();
  }

  // ---- the profile book ----

  private requireBook(): ProfileBook {
    if (this.book === null) throw new Error('The app has not started');
    return this.book;
  }

  private requireProfile(): Profile {
    const profile = this.requireBook().profiles.find((p) => p.id === this.current);
    if (profile === undefined) throw new Error('Nobody is playing');
    return profile;
  }

  private async saveBook(book: ProfileBook): Promise<void> {
    await this.options.store.putMeta(BOOK, book);
    this.book = book;
  }

  /**
   * The stored book; or, the first time, the old single save folded into a
   * first profile (version 0 to 1, K7). A book that can't be read is kept
   * aside and the app carries on with a fresh one, whose first profile finds
   * its saves again. New profile ids always go past every id a slot uses, so
   * a new child never inherits someone's old saves.
   */
  private async loadBook(): Promise<ProfileBook> {
    const store = this.options.store;
    const raw = await store.getMeta(BOOK);
    let book: ProfileBook | null = null;
    if (raw !== undefined) {
      try {
        book = readBook(raw);
      } catch (error) {
        console.warn('The profiles could not be read; they are kept aside.', error);
        await store.putMeta(UNREAD, raw);
        book = legacyBook(null, [], []);
      }
    }
    const slots = (await store.list()).map((s) => s.slot);
    const legacy = slots.filter((s) => !s.includes('/'));
    // Slots without a profile once a book exists (an old cached copy of the app ran once more) are left alone, never deleted.
    if (book === null) book = await this.migrate(legacy);
    const highest = Math.max(0, ...slots.map((s) => /^p(\d+)\//.exec(s)).map((m) => (m === null ? 0 : Number(m[1]))));
    return highest >= book.nextId ? { ...book, nextId: highest + 1 } : book;
  }

  /** Version 0: slots without a profile become the first profile's, with every finished daily and won bonus round on its record. */
  private async migrate(legacy: readonly string[]): Promise<ProfileBook> {
    const store = this.options.store;
    const finished: FinishedDay[] = [];
    const bonusWon: number[] = [];
    for (const slot of legacy) {
      const record = await store.get(slot);
      if (record === undefined) continue;
      try {
        const s = await this.options.engine.inspect(record.game);
        if (s.mode === 'main' && s.phase === 'won' && s.round === 'daily') finished.push({ day: s.day, fed: s.fed, hungry: s.hungry, retries: s.retries });
        if (s.mode === 'main' && s.phase === 'won' && s.round === 'bonus') bonusWon.push(s.day);
      } catch (error) {
        console.warn(`The old save in ${slot} could not be read; it is moved as it is.`, error);
      }
      await store.put({ ...record, slot: keyFor('p1', slot) });
    }
    const active = this.options.legacyActive?.get() ?? null;
    const book = legacyBook(active !== null && legacy.includes(active) ? active : null, finished, bonusWon);
    // Written before the old slots go: a migration cut short runs again from the old slots, or finds the book.
    await this.saveBook(book);
    for (const slot of legacy) await store.remove(slot);
    this.options.legacyActive?.clear();
    return book;
  }

  // ---- telling the interface ----

  private publish(update: EngineUpdate): void {
    if (this.current === null) return;
    const latest: GameUpdate = { ...update, profile: this.current };
    this.latest = latest;
    for (const listener of this.listeners) listener(latest);
  }

  private publishHome(): void {
    const home = homeView(this.requireBook(), this.current, this.today());
    this.home = home;
    for (const listener of this.homeListeners) listener(home);
  }
}
