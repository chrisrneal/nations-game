import type { SavedAirport } from './engine.ts';

/** One save slot on this device. */
export interface SlotRecord {
  readonly slot: string;
  /** Wall-clock time of the save, for the list only; the sim never sees it. */
  readonly savedAt: number;
  readonly tick: number;
  readonly game: SavedAirport;
}

export type SlotSummary = Omit<SlotRecord, 'game'>;

/** Where slots live. IndexedDB on the phone, memory in tests. */
export interface SaveStore {
  put(record: SlotRecord): Promise<void>;
  get(slot: string): Promise<SlotRecord | undefined>;
  list(): Promise<SlotSummary[]>;
  remove(slot: string): Promise<void>;
}

function summary(record: SlotRecord): SlotSummary {
  return { slot: record.slot, savedAt: record.savedAt, tick: record.tick };
}

function bySlot(a: SlotSummary, b: SlotSummary): number {
  return a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
}

export class MemorySaveStore implements SaveStore {
  private readonly records = new Map<string, SlotRecord>();

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
}

/** A fresh database name, so the retired Nations saves (database "nations") are never read as airports. */
export const DB_NAME = 'airport';
const STORE = 'slots';

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
      const req = this.factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'slot' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open saves'));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
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
}
