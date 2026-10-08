import type { WarehouseCommand, WarehouseSaveFile, WarehouseState } from '@warehouse/contracts';
import { hashState } from './hash.ts';
import { WAREHOUSE_SCHEMA_VERSION } from './state.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { advanceMany, step } from './step.ts';
import { WMS_AISLES, WMS_BAYS, WMS_BINS_PER_BAY, WMS_SKUS } from './wms/catalog.ts';
import { createWms } from './wms/generate.ts';
import { binFullUnits } from './wms/inbound.ts';
import { newWorker, openingShipDoors } from './wms/policy.ts';

export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** Moves a save on one version without changing it: the versions W8 made moot. */
function bump(to: number): Migration {
  return (save) => ({ ...save, schemaVersion: to });
}

/**
 * Migrations keyed by the version they upgrade FROM (S9): `WAREHOUSE_MIGRATIONS[1]`
 * turns a version-1 save into version 2. The warehouse started at version 1
 * (W1): airport saves are not carried over. Each one needs a test with a real
 * old save file (packages/harness/fixtures).
 *
 * - 1 to 6: versions 2-6 added the WMS beside the idle game (W5-W7). Since
 *   W8 drops the idle game and opens a fresh WMS, these steps only move the
 *   version on; 6 to 7 does the work.
 * - 6 to 7 (W8, the idle game removed): the snapshot keeps its tick and cash
 *   and opens a fresh WMS (seeded from the old warehouse seed and site, at the
 *   snapshot's tick) with the crew, tasks and dock appointments; the idle
 *   flow (backlog, docks, levels, stars, boosts) is dropped. Commands other
 *   than WMS actions are dropped from the log, and a WMS action naming an
 *   old order is refused when it replays.
 * - 7 to 8 (W9, waves and labour): the plan gains its wave interval (the old
 *   fixed `wmsWaveTicks`) and the fixed labour plan, which is how version 7
 *   ran. Older plan commands name only three settings; the sim keeps the
 *   rest, so the log replays unchanged.
 *
 * - 8 to 9 (W10, outbound doors and a busier warehouse): the warehouse gains
 *   its opening outbound doors, their first trailers leaving over the next
 *   hour; orders staged or loaded under the old timers go back to PACKED and
 *   are staged at a door at once; every order names its door (none yet); the
 *   crew is topped up to the new opening crew (pickers, then the dock), free,
 *   since three times the orders come in; finished tasks move to the history.
 * - 9 to 10 (W11, a SKU a bay): the sixteen SKUs keep their bins and stock;
 *   the 64 new SKUs take the bays nobody uses, in order (aisle A first, the
 *   first bin of each), and arrive full (at the bin's full mark), so an old
 *   warehouse's empty racks fill at once. A warehouse a version-6 save opened
 *   already has all 80.
 *
 * Old rules are not kept, so a migration changes only the snapshot, and
 * `migrateWarehouseSave` replays the history since it under today's rules and
 * records the new hash. The game's own saves are compact (the snapshot is the
 * save point, no history): for those the old hash is checked first.
 */
export const WAREHOUSE_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: bump(2),
  2: bump(3),
  3: bump(4),
  4: bump(5),
  5: bump(6),
  6: (save) => {
    const old = save.snapshot as { tick: number; cash: number; site?: number; rng: { seed: number } };
    const snapshot: WarehouseState = { schemaVersion: 7, tick: old.tick, cash: old.cash, wms: createWms({ seed: old.rng.seed + (old.site ?? 0), tick: old.tick }) };
    const log = Array.isArray(save.commandLog) ? (save.commandLog as { type?: unknown }[]).filter((c) => c.type === 'wms') : [];
    return { ...save, schemaVersion: 7, snapshot, commandLog: log };
  },
  7: (save) => {
    const old = save.snapshot as WarehouseState;
    const policy = { ...old.wms.policy, waveTicks: T.wmsWaveTicks.value, labor: 'fixed' as const };
    return { ...save, schemaVersion: 8, snapshot: { ...old, schemaVersion: 8, wms: { ...old.wms, policy } } };
  },
  8: (save) => {
    const old = save.snapshot as WarehouseState;
    const w = old.wms;
    const tick = old.tick;
    const moved = (status: string | null): boolean => status === 'STAGED' || status === 'LOADED';
    const orders = w.orders.map((o) => ({
      ...o,
      door: 0,
      status: moved(o.status) ? ('PACKED' as const) : o.status,
      held: moved(o.held) ? ('PACKED' as const) : o.held,
      next: moved(o.status) ? tick : o.next,
    }));
    const workers = [...w.workers];
    let id = workers.reduce((max, p) => Math.max(max, p.id), 0);
    const count = (role: 'pick' | 'receive'): number => workers.filter((p) => p.role === role).length;
    while (count('pick') < T.wmsStartPickers.value) workers.push(newWorker((id += 1), 'pick'));
    while (count('receive') < T.wmsStartReceivers.value) workers.push(newWorker((id += 1), 'receive'));
    const live = (t: { status: string }): boolean => t.status === 'OPEN' || t.status === 'QUEUED' || t.status === 'ACTIVE';
    const wms = {
      ...w,
      tasks: w.tasks.filter(live),
      history: w.tasks.filter((t) => !live(t)),
      orders,
      workers,
      policy: { ...w.policy, pickers: count('pick') },
      stats: { ...w.stats, trailers: 0 },
      shipDoors: openingShipDoors(tick),
      nextTrailerNo: T.wmsShipDoors.value + 1,
    };
    return { ...save, schemaVersion: 9, snapshot: { ...old, schemaVersion: 9, wms } };
  },
  9: (save) => {
    const old = save.snapshot as WarehouseState;
    const inventory = [...old.wms.inventory];
    const used = new Set(inventory.map((s) => Math.floor(s.bin / WMS_BINS_PER_BAY)));
    const free = Array.from({ length: WMS_AISLES * WMS_BAYS }, (_, bay) => bay).filter((bay) => !used.has(bay));
    for (let sku = inventory.length; sku < WMS_SKUS.length; sku++) {
      const bay = free.shift() ?? 0;
      inventory.push({ sku, bin: bay * WMS_BINS_PER_BAY, onHand: binFullUnits(), allocated: 0, picked: 0, counted: -1, variance: 0 });
    }
    return { ...save, schemaVersion: 10, snapshot: { ...old, schemaVersion: 10, wms: { ...old.wms, inventory } } };
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
