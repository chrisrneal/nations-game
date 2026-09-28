import type { Command, Pace } from '@nations/contracts';
import type { GameEngine, GameUpdate } from './engine.ts';
import type { SaveStore, SlotSummary } from './saves.ts';

/** The slot written automatically; the three manual slots sit beside it. */
export const AUTOSAVE_SLOT = 'autosave';
export const MANUAL_SLOTS = ['slot-1', 'slot-2', 'slot-3'] as const;
/** Autosave every this many ticks while running, as well as when the app is hidden. */
export const AUTOSAVE_EVERY_TICKS = 10;

/**
 * The Host the interface talks to (seam 3), plus the game-management calls a
 * single-player device needs. Everything is async so a RemoteHost can replace
 * LocalHost later with no change to the interface.
 */
export interface GameHost {
  submit(command: Command): Promise<void>;
  subscribe(listener: (update: GameUpdate) => void): () => void;
  setPace(pace: Pace): Promise<void>;
  newGame(nationId: string): Promise<void>;
  saveTo(slot: string): Promise<SlotSummary>;
  loadFrom(slot: string): Promise<void>;
  listSaves(): Promise<SlotSummary[]>;
  deleteSave(slot: string): Promise<void>;
  /** Write the autosave slot now, if a game is running. */
  autosave(): Promise<void>;
  /** Milliseconds for `ticks` catch-up ticks on this device (Gate 0). */
  benchmark(ticks: number): Promise<number>;
}

type Async<T> = T | Promise<T>;
/** The engine as LocalHost sees it: in-process in tests, a Comlink Remote in the app. */
export type EngineApi = {
  [K in 'newGame' | 'submit' | 'setPace' | 'subscribe' | 'exportGame' | 'importGame' | 'current' | 'benchmark']: (
    ...args: Parameters<GameEngine[K]>
  ) => Async<ReturnType<GameEngine[K]>>;
};

export interface LocalHostOptions {
  readonly engine: EngineApi;
  readonly store: SaveStore;
  /** Wraps the listener for transport (Comlink.proxy in the app). */
  readonly wrapListener?: (listener: (update: GameUpdate) => void) => (update: GameUpdate) => void;
  readonly now?: () => number;
  readonly newSeed?: () => number;
}

/** Host backed by a GameEngine in a Web Worker on this device. */
export class LocalHost implements GameHost {
  private readonly listeners = new Set<(update: GameUpdate) => void>();
  private latest: GameUpdate | null = null;
  private lastAutosaveTick = 0;
  private readonly ready: Promise<void>;

  constructor(private readonly options: LocalHostOptions) {
    const wrap = options.wrapListener ?? ((listener) => listener);
    this.ready = Promise.resolve(options.engine.subscribe(wrap((update) => this.receive(update))));
  }

  async submit(command: Command): Promise<void> {
    await this.options.engine.submit(command);
  }

  subscribe(listener: (update: GameUpdate) => void): () => void {
    this.listeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => this.listeners.delete(listener);
  }

  async setPace(pace: Pace): Promise<void> {
    await this.ready;
    await this.options.engine.setPace(pace);
  }

  async newGame(nationId: string): Promise<void> {
    await this.ready;
    const seed = this.options.newSeed?.() ?? (Math.random() * 0x7fffffff) | 0;
    this.publish(await this.options.engine.newGame(nationId, seed));
    this.lastAutosaveTick = 0;
    await this.autosave();
  }

  async saveTo(slot: string): Promise<SlotSummary> {
    const game = await this.options.engine.exportGame();
    const record = {
      slot,
      savedAt: this.options.now?.() ?? Date.now(),
      tick: game.save.savedAtTick,
      humanId: game.humanId,
      game,
    };
    await this.options.store.put(record);
    return { slot, savedAt: record.savedAt, tick: record.tick, humanId: record.humanId };
  }

  async loadFrom(slot: string): Promise<void> {
    await this.ready;
    const record = await this.options.store.get(slot);
    if (record === undefined) throw new Error('That save slot is empty');
    this.publish(await this.options.engine.importGame(record.game));
    this.lastAutosaveTick = record.tick;
  }

  listSaves(): Promise<SlotSummary[]> {
    return this.options.store.list();
  }

  deleteSave(slot: string): Promise<void> {
    return this.options.store.remove(slot);
  }

  async autosave(): Promise<void> {
    if ((await this.options.engine.current()) === null) return;
    const saved = await this.saveTo(AUTOSAVE_SLOT);
    this.lastAutosaveTick = saved.tick;
  }

  async benchmark(ticks: number): Promise<number> {
    return this.options.engine.benchmark(ticks);
  }

  private receive(update: GameUpdate): void {
    this.publish(update);
    if (update.view.tick - this.lastAutosaveTick >= AUTOSAVE_EVERY_TICKS) {
      this.lastAutosaveTick = update.view.tick;
      void this.autosave().catch((error: unknown) => console.warn('Autosave failed', error));
    }
  }

  private publish(update: GameUpdate): void {
    this.latest = update;
    for (const listener of this.listeners) listener(update);
  }
}
