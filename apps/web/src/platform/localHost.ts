import type { AirportIntent, UpgradeId } from '@nations/contracts';
import type { AirportEngine, AirportUpdate, SavedAirport } from './engine.ts';
import type { SaveStore } from './saves.ts';

/** The slot written automatically. */
export const AUTOSAVE_SLOT = 'autosave';
/** Autosave every this many ticks while running (10 s), as well as when the app is hidden. */
export const AUTOSAVE_EVERY_TICKS = 40;

/**
 * The Host the interface talks to (S3). Everything is async, so the interface
 * cannot tell the sim runs in a Web Worker, and it can only send intents and
 * read Views.
 */
export interface AirportHost {
  subscribe(listener: (update: AirportUpdate) => void): () => void;
  /** Continue the autosave (caught up by the wall clock), or open a new airport if there is none. */
  start(): Promise<'continued' | 'new'>;
  submit(intent: AirportIntent): Promise<void>;
  tap(gate: number): Promise<void>;
  buy(upgrade: UpgradeId): Promise<void>;
  /** Sell this airport for slots and open the next city (RULES 10). */
  sell(): Promise<void>;
  /** Throw this airport away and open a new one at the first city. */
  newGame(): Promise<void>;
  /** The running game as a file: a name and the text to write into it. */
  exportFile(): Promise<{ name: string; text: string }>;
  /** Resume the airport in an exported file, and autosave it on this device. */
  importFile(text: string): Promise<void>;
  /** The app was hidden or closed: stop the clock and save. */
  away(): Promise<void>;
  /** The app is visible again: catch up by the wall clock (and write the away recap after a minute or more). */
  back(): Promise<void>;
  /** The player has read the away recap. */
  dismissRecap(): Promise<void>;
}

/** Marker and version of an exported save file. */
export const FILE_FORMAT = 'airport-idle-save';
export const FILE_VERSION = 1;

type Async<T> = T | Promise<T>;
/** The engine as LocalHost sees it: in-process in tests, a Comlink Remote in the app. */
export type EngineApi = {
  [K in 'newGame' | 'submit' | 'subscribe' | 'current' | 'pump' | 'pause' | 'resume' | 'exportGame' | 'importGame' | 'dismissRecap']: (
    ...args: Parameters<AirportEngine[K]>
  ) => Async<ReturnType<AirportEngine[K]>>;
};

export interface LocalHostOptions {
  readonly engine: EngineApi;
  readonly store: SaveStore;
  /** Wraps the listener for transport (Comlink.proxy in the app). */
  readonly wrapListener?: (listener: (update: AirportUpdate) => void) => (update: AirportUpdate) => void;
  readonly now?: () => number;
  readonly newSeed?: () => number;
}

/** Host backed by an AirportEngine in a Web Worker on this device. */
export class LocalHost implements AirportHost {
  private readonly listeners = new Set<(update: AirportUpdate) => void>();
  private latest: AirportUpdate | null = null;
  private lastAutosaveTick = 0;
  private readonly ready: Promise<void>;
  private started: Promise<'continued' | 'new'> | null = null;

  constructor(private readonly options: LocalHostOptions) {
    const wrap = options.wrapListener ?? ((listener) => listener);
    this.ready = Promise.resolve(options.engine.subscribe(wrap((update) => this.receive(update))));
  }

  subscribe(listener: (update: AirportUpdate) => void): () => void {
    this.listeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => this.listeners.delete(listener);
  }

  /** Idempotent: React's strict mode mounts twice, and the airport must open once. */
  start(): Promise<'continued' | 'new'> {
    this.started ??= this.open();
    return this.started;
  }

  private async open(): Promise<'continued' | 'new'> {
    await this.ready;
    const record = await this.options.store.get(AUTOSAVE_SLOT);
    if (record !== undefined) {
      try {
        await this.resume(record.game);
        return 'continued';
      } catch (error) {
        console.warn('The autosave could not be loaded; opening a new airport.', error);
      }
    }
    await this.newGame();
    return 'new';
  }

  async submit(intent: AirportIntent): Promise<void> {
    await this.options.engine.submit(intent);
  }

  tap(gate: number): Promise<void> {
    return this.submit({ type: 'tap', payload: { gate } });
  }

  buy(upgrade: UpgradeId): Promise<void> {
    return this.submit({ type: 'buy', payload: { upgrade } });
  }

  sell(): Promise<void> {
    return this.submit({ type: 'sell', payload: {} });
  }

  async newGame(): Promise<void> {
    await this.ready;
    const seed = this.options.newSeed?.() ?? (Math.random() * 0x7fffffff) | 0;
    this.publish(await this.options.engine.newGame(seed));
    this.lastAutosaveTick = 0;
    await this.autosave();
  }

  async exportFile(): Promise<{ name: string; text: string }> {
    const game = await this.options.engine.exportGame();
    const exportedAt = this.now();
    const text = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, exportedAt, game });
    return { name: `airport-tick-${game.save.savedAtTick}.json`, text };
  }

  async importFile(text: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('That file is not a saved airport');
    }
    const file = parsed as { format?: unknown; version?: unknown; game?: SavedAirport };
    if (typeof parsed !== 'object' || parsed === null || file.format !== FILE_FORMAT || file.game === undefined) {
      throw new Error('That file is not a saved airport');
    }
    if (typeof file.version !== 'number' || file.version > FILE_VERSION) {
      throw new Error('That save file is from a newer version of the game; update the app');
    }
    await this.ready;
    await this.resume(file.game);
  }

  async away(): Promise<void> {
    await this.ready;
    await this.options.engine.pause();
    await this.autosave();
  }

  async back(): Promise<void> {
    await this.ready;
    await this.options.engine.resume();
  }

  async dismissRecap(): Promise<void> {
    await this.options.engine.dismissRecap();
  }

  /** Write the autosave slot now, if an airport is running. */
  async autosave(): Promise<void> {
    if ((await this.options.engine.current()) === null) return;
    const game = await this.options.engine.exportGame();
    await this.options.store.put({ slot: AUTOSAVE_SLOT, savedAt: this.now(), tick: game.save.savedAtTick, game });
    this.lastAutosaveTick = game.save.savedAtTick;
  }

  private async resume(game: SavedAirport): Promise<void> {
    this.publish(await this.options.engine.importGame(game));
    await this.autosave();
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private receive(update: AirportUpdate): void {
    this.publish(update);
    if (update.view.tick - this.lastAutosaveTick >= AUTOSAVE_EVERY_TICKS) {
      this.lastAutosaveTick = update.view.tick;
      void this.autosave().catch((error: unknown) => console.warn('Autosave failed', error));
    }
  }

  private publish(update: AirportUpdate): void {
    this.latest = update;
    for (const listener of this.listeners) listener(update);
  }
}
