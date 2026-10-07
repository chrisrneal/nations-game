import type { WarehouseCommand, WarehouseSaveFile, WarehouseState } from '@warehouse/contracts';
import { hashState } from './hash.ts';
import { WAREHOUSE_SCHEMA_VERSION } from './state.ts';
import { advanceMany, step } from './step.ts';
import { createWms, emptyInbound } from './wms/generate.ts';
import { defaultPolicy } from './wms/policy.ts';

export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM (S9): `WAREHOUSE_MIGRATIONS[1]`
 * turns a version-1 save into version 2. The warehouse started at version 1
 * (W1): airport saves are not carried over. Each one needs a test with a real
 * old save file (packages/harness/fixtures).
 *
 * - 1 to 2 (W5): the snapshot gains a WMS, generated as a new warehouse's would
 *   be (seeded from the warehouse seed and site, at the snapshot's tick and
 *   contract). Nothing else changes, so every idle number is as saved.
 * - 2 to 3 (W5, WMS slice 2): the WMS gains clocks, counters and per-order
 *   timers. A version-2 WMS never moved, so it is generated again the same
 *   way, which gives the same orders and stock with the new fields.
 * - 3 to 4 (W5, WMS slice 7): every order gains `expedited: false`; the WMS
 *   is otherwise kept exactly as saved.
 * - 4 to 5 (W6, inbound and inventory): the WMS gains purchase orders (none
 *   yet), receivers, a cycle-count clock and inbound totals, and each SKU
 *   gains `picked: 0`, `counted: -1` and `variance: 0`. Orders, stock and the
 *   log are kept exactly as saved; the next planning run raises the POs.
 * - 5 to 6 (W7, the operating plan): the WMS gains the default plan (the
 *   rules it ran by), and each picker stands at the bin of the line it is on
 *   (or the pick-and-drop point when idle) with no walk left, so a line
 *   being picked carries on as it would have.
 *
 * Old rules are not kept, so a migration changes only the snapshot, and
 * `migrateWarehouseSave` replays the history since it under today's rules and
 * records the new hash. The game's own saves are compact (the snapshot is the
 * save point, no history): for those the old hash is checked first, and the
 * migrated warehouse is exactly the one that was saved.
 */
export const WAREHOUSE_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (save) => {
    const snapshot = save.snapshot as Omit<WarehouseState, 'wms'>;
    const wms = createWms({ seed: snapshot.rng.seed + snapshot.site, tick: snapshot.tick, contract: snapshot.levels.contract });
    return { ...save, schemaVersion: 2, snapshot: { ...snapshot, schemaVersion: 2, wms } };
  },
  2: (save) => {
    const snapshot = save.snapshot as Omit<WarehouseState, 'wms'>;
    const wms = createWms({ seed: snapshot.rng.seed + snapshot.site, tick: snapshot.tick, contract: snapshot.levels.contract });
    return { ...save, schemaVersion: 3, snapshot: { ...snapshot, schemaVersion: 3, wms } };
  },
  3: (save) => {
    const snapshot = save.snapshot as WarehouseState;
    const orders = snapshot.wms.orders.map((o) => ({ ...o, expedited: false }));
    return { ...save, schemaVersion: 4, snapshot: { ...snapshot, schemaVersion: 4, wms: { ...snapshot.wms, orders } } };
  },
  4: (save) => {
    const snapshot = save.snapshot as WarehouseState;
    const inventory = snapshot.wms.inventory.map((s) => ({ ...s, picked: 0, counted: -1, variance: 0 }));
    const wms = { ...snapshot.wms, inventory, ...emptyInbound(snapshot.tick) };
    return { ...save, schemaVersion: 5, snapshot: { ...snapshot, schemaVersion: 5, wms } };
  },
  5: (save) => {
    const snapshot = save.snapshot as WarehouseState;
    const w = snapshot.wms;
    const pickers = w.pickers.map((p) => {
      const bin = p.order === 0 ? undefined : w.orders.find((o) => o.no === p.order)?.lines.find((l) => l.no === p.line)?.bin;
      return { ...p, at: bin ?? -1, walk: 0 };
    });
    const wms = { ...w, pickers, policy: { ...defaultPolicy(), pickers: pickers.length } };
    return { ...save, schemaVersion: 6, snapshot: { ...snapshot, schemaVersion: 6, wms } };
  },
};

/** Brings a parsed save up to the current schema, or throws a message a player can act on. */
export function migrateWarehouseSave(raw: unknown, migrations: Readonly<Record<number, Migration>> = WAREHOUSE_MIGRATIONS, target = WAREHOUSE_SCHEMA_VERSION): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let save = raw as Record<string, unknown>;
  const found = save.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found)) throw new Error('Save has no schemaVersion');
  const snapshot: unknown = save.snapshot;
  if (typeof snapshot === 'object' && snapshot !== null && 'gates' in snapshot) throw new Error('This is an airport save: airports do not carry over to the warehouse');
  let version = found;
  if (version > target) throw new Error(`Save is from a newer game version (${version} > ${target}); update the app`);
  if (version === target) return save;
  const old = save as unknown as WarehouseSaveFile;
  const compact = typeof old.snapshot === 'object' && old.snapshot !== null && Array.isArray(old.commandLog) && old.snapshot.tick === old.savedAtTick && old.commandLog.every((c) => c.tick >= old.savedAtTick);
  if (compact && hashState(old.snapshot) !== old.stateHash) throw new Error(`Save does not match its recorded state (version ${version})`);
  while (version < target) {
    const migrate = migrations[version];
    if (migrate === undefined) throw new Error(`No migration from save version ${version}`);
    save = migrate(save);
    if (save.schemaVersion !== version + 1) throw new Error(`Migration from ${version} did not produce ${version + 1}`);
    version += 1;
  }
  const migrated = save as unknown as WarehouseSaveFile;
  if (!Number.isInteger(migrated.savedAtTick) || migrated.savedAtTick < migrated.snapshot.tick) throw new Error('Save has an invalid savedAtTick');
  const state = replay(migrated.snapshot, migrated.commandLog.filter((c) => c.tick < migrated.savedAtTick), migrated.savedAtTick);
  return { ...save, stateHash: hashState(state) };
}

export function createWarehouseSave(snapshot: WarehouseState, commandLog: readonly WarehouseCommand[], current: WarehouseState): WarehouseSaveFile {
  return { schemaVersion: WAREHOUSE_SCHEMA_VERSION, snapshot, commandLog: [...commandLog], savedAtTick: current.tick, stateHash: hashState(current) };
}

/** Steps `state` to `untilTick`, applying commands at their ticks and catching up fast in between. */
export function replay(state: WarehouseState, commands: readonly WarehouseCommand[], untilTick: number): WarehouseState {
  const byTick = new Map<number, WarehouseCommand[]>();
  for (const command of commands) {
    const list = byTick.get(command.tick) ?? [];
    list.push(command);
    byTick.set(command.tick, list);
  }
  const ticks = [...byTick.keys()].sort((a, b) => a - b);
  let current = state;
  for (const tick of ticks) {
    if (tick >= untilTick) break;
    if (tick < current.tick) throw new Error('Command log starts before the snapshot');
    current = advanceMany(current, tick - current.tick);
    current = step(current, byTick.get(tick) ?? []).state;
  }
  return advanceMany(current, untilTick - current.tick);
}

export interface LoadedWarehouse {
  readonly state: WarehouseState;
  readonly snapshot: WarehouseState;
  /** Commands before the save point: still the log since the snapshot. */
  readonly replayed: readonly WarehouseCommand[];
  /** Commands for the save point or later, to queue again. */
  readonly pending: readonly WarehouseCommand[];
}

/** Migrate, replay the log from the snapshot, and verify the hash. */
export function loadWarehouseSave(raw: unknown): LoadedWarehouse {
  const save = migrateWarehouseSave(raw) as unknown as WarehouseSaveFile;
  const { snapshot, commandLog, savedAtTick, stateHash } = save;
  if (typeof snapshot !== 'object' || snapshot === null || !Array.isArray(commandLog)) throw new Error('Save is missing its snapshot or command log');
  if (!Number.isInteger(savedAtTick) || savedAtTick < snapshot.tick) throw new Error('Save has an invalid savedAtTick');
  const replayed = commandLog.filter((c) => c.tick < savedAtTick);
  const pending = commandLog.filter((c) => c.tick >= savedAtTick);
  const state = replay(snapshot, replayed, savedAtTick);
  const actual = hashState(state);
  if (actual !== stateHash) throw new Error(`Save does not replay to its recorded state (hash ${actual}, expected ${stateHash})`);
  return { state, snapshot, replayed, pending };
}
