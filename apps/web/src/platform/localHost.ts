import type { GameCommand, GameSaveFile, GameSpec, Mode, Round } from '@snacks/contracts';
import type { GameEngine, GameUpdate } from './engine.ts';
import type { SaveStore } from './saves.ts';

/**
 * The Host the interface talks to (S3). Everything is async, so the interface
 * cannot tell the sim runs in a Web Worker; it sends commands and reads Views.
 *
 * Each kind of game has its own save slot: today's daily (finished once, then
 * it shows its result, RULES 9), today's bonus round, and practice. The slot
 * being played is remembered, so the app reopens where the player left off.
 */
export interface GameHost {
  subscribe(listener: (update: GameUpdate) => void): () => void;
  /** Reopen the game being played, or today's daily if there is none. */
  start(): Promise<'continued' | 'new'>;
  /** Apply a command; resolves to why it was refused, or null. */
  submit(command: GameCommand): Promise<string | null>;
  /** Today's daily: continued if started, shown finished if finished. */
  daily(mode?: Mode): Promise<void>;
  /** Today's bonus round (the interface offers it once the daily is won). */
  bonus(): Promise<void>;
  /** A fresh practice board from a new seed. */
  practice(mode?: Mode): Promise<void>;
  /** Today, as days since 1970-01-01 on this device's calendar (D18). */
  today(): number;
}

/** Days since 1970-01-01 in local time: the daily changes at local midnight (D18). */
export function dayNumber(ms: number, timezoneOffsetMinutes: number): number {
  return Math.floor((ms - timezoneOffsetMinutes * 60_000) / 86_400_000);
}

type Async<T> = T | Promise<T>;
/** The engine as LocalHost sees it: in-process in tests, a Comlink Remote in the app. */
export type EngineApi = {
  [K in 'newGame' | 'submit' | 'current' | 'exportGame' | 'importGame']: (...args: Parameters<GameEngine[K]>) => Async<ReturnType<GameEngine[K]>>;
};

/** Where the name of the slot being played is kept: localStorage in the app, memory in tests. */
export interface ActiveSlot {
  get(): string | null;
  set(slot: string): void;
}

export interface LocalHostOptions {
  readonly engine: EngineApi;
  readonly store: SaveStore;
  readonly active: ActiveSlot;
  /** Wall-clock milliseconds and the timezone offset; only the host reads the clock, never the sim. */
  readonly now?: () => number;
  readonly timezoneOffset?: () => number;
  readonly newSeed?: () => number;
}

export function slotFor(mode: Mode, round: Round, day: number): string {
  return round === 'practice' ? `practice-${mode}` : `${round}-${mode}-${day}`;
}

/** Host backed by a GameEngine in a Web Worker on this device. */
export class LocalHost implements GameHost {
  private readonly listeners = new Set<(update: GameUpdate) => void>();
  private latest: GameUpdate | null = null;
  private slot: string | null = null;
  private started: Promise<'continued' | 'new'> | null = null;

  constructor(private readonly options: LocalHostOptions) {}

  subscribe(listener: (update: GameUpdate) => void): () => void {
    this.listeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => this.listeners.delete(listener);
  }

  today(): number {
    const now = this.options.now?.() ?? Date.now();
    const offset = this.options.timezoneOffset?.() ?? new Date(now).getTimezoneOffset();
    return dayNumber(now, offset);
  }

  /** Idempotent: React's strict mode mounts twice, and the game must open once. */
  start(): Promise<'continued' | 'new'> {
    this.started ??= this.open();
    return this.started;
  }

  private async open(): Promise<'continued' | 'new'> {
    const slot = this.options.active.get();
    // A daily or bonus from an earlier day is over: open today's daily instead.
    const stale = slot !== null && !slot.startsWith('practice') && !slot.endsWith(`-${this.today()}`);
    if (slot !== null && !stale && (await this.resume(slot))) return 'continued';
    await this.daily();
    return 'new';
  }

  async submit(command: GameCommand): Promise<string | null> {
    const update = await this.options.engine.submit(command);
    this.publish(update);
    if (update.error === null) await this.autosave();
    return update.error;
  }

  daily(mode: Mode = 'main'): Promise<void> {
    return this.openSlot({ mode, round: 'daily', day: this.today(), seed: 0 });
  }

  bonus(): Promise<void> {
    return this.openSlot({ mode: 'main', round: 'bonus', day: this.today(), seed: 0 });
  }

  async practice(mode: Mode = 'main'): Promise<void> {
    const seed = this.options.newSeed?.() ?? (Math.random() * 0x7fffffff) | 0;
    await this.begin({ mode, round: 'practice', day: 0, seed });
  }

  /** Continue a day's slot if it is saved, else start it. */
  private async openSlot(spec: GameSpec): Promise<void> {
    if (await this.resume(slotFor(spec.mode, spec.round, spec.day))) return;
    await this.begin(spec);
  }

  private async begin(spec: GameSpec): Promise<void> {
    this.publish(await this.options.engine.newGame(spec));
    this.slot = slotFor(spec.mode, spec.round, spec.day);
    this.options.active.set(this.slot);
    await this.autosave();
  }

  private async resume(slot: string): Promise<boolean> {
    const record = await this.options.store.get(slot);
    if (record === undefined) return false;
    try {
      this.publish(await this.options.engine.importGame(record.game));
    } catch (error) {
      console.warn(`The save in ${slot} could not be loaded.`, error);
      return false;
    }
    this.slot = slot;
    this.options.active.set(slot);
    return true;
  }

  private async autosave(): Promise<void> {
    if (this.slot === null) return;
    const game: GameSaveFile = await this.options.engine.exportGame();
    await this.options.store.put({ slot: this.slot, savedAt: this.options.now?.() ?? Date.now(), game });
  }

  private publish(update: GameUpdate): void {
    this.latest = update;
    for (const listener of this.listeners) listener(update);
  }
}
