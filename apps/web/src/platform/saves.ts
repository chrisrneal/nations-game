import type { GameSaveFile } from '@snacks/contracts';

/** One save slot on this device. Since profiles (K7) a slot's name starts with its profile: `p1/daily-main-20400`. */
export interface SlotRecord {
  readonly slot: string;
  /** Wall-clock time of the save, for the list only; the sim never sees it. */
  readonly savedAt: number;
  readonly game: GameSaveFile;
}

export type SlotSummary = Omit<SlotRecord, 'game'>;

/** Where slots live. IndexedDB on the phone, memory in tests. */
export interface SaveStore {
  put(record: SlotRecord): Promise<void>;
  get(slot: string): Promise<SlotRecord | undefined>;
  list(): Promise<SlotSummary[]>;
  remove(slot: string): Promise<void>;
  /** Device-wide records beside the slots: the profile book lives under `profiles`. Undefined when absent. */
  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
}

function summary(record: SlotRecord): SlotSummary {
  return { slot: record.slot, savedAt: record.savedAt };
}

function bySlot(a: SlotSummary, b: SlotSummary): number {
  return a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
}

export class MemorySaveStore implements SaveStore {
  private readonly records = new Map<string, SlotRecord>();
  private readonly meta = new Map<string, unknown>();

  async put(record: SlotRecord): Promise<void> {
    this.records.set(record.slot, structuredClone(record));
  }

  async get(slot: string): Promise<SlotRecord | undefined> {
    const record = this.records.get(slot);
    return record === undefined ? undefined : structuredClone(record);
  }

  async list(): Promise<SlotSummary[]> {
    return [...this.records.values()].map(summary).sort(bySlot);
  }

  async remove(slot: string): Promise<void> {
    this.records.delete(slot);
  }

  async getMeta(key: string): Promise<unknown> {
    return structuredClone(this.meta.get(key));
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, structuredClone(value));
  }
}

/** A fresh database name, so the retired Nations, airport and warehouse saves are never read as Snack Attack games (K1). */
export const DB_NAME = 'snacks';
const STORE = 'slots';
const META = 'meta';
/** Version 1 held slots only; version 2 (K7) adds the meta store for the profile book. */
const DB_VERSION = 2;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Save slots in IndexedDB, which survives closing the app and airplane mode. */
export class IndexedDbSaveStore implements SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        if (event.oldVersion < 1) db.createObjectStore(STORE, { keyPath: 'slot' });
        if (event.oldVersion < 2) db.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open saves'));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode, name = STORE): Promise<IDBObjectStore> {
    return (await this.open()).transaction(name, mode).objectStore(name);
  }

  async put(record: SlotRecord): Promise<void> {
    await request((await this.store('readwrite')).put(record));
  }

  async get(slot: string): Promise<SlotRecord | undefined> {
    return (await request((await this.store('readonly')).get(slot))) as SlotRecord | undefined;
  }

  async list(): Promise<SlotSummary[]> {
    const all = (await request((await this.store('readonly')).getAll())) as SlotRecord[];
    return all.map(summary).sort(bySlot);
  }

  async remove(slot: string): Promise<void> {
    await request((await this.store('readwrite')).delete(slot));
  }

  async getMeta(key: string): Promise<unknown> {
    const row = (await request((await this.store('readonly', META)).get(key))) as { key: string; value: unknown } | undefined;
    return row?.value;
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    await request((await this.store('readwrite', META)).put({ key, value }));
  }
}
