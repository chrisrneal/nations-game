import type { WarehouseCommand, WarehouseSaveFile, WarehouseState } from '@warehouse/contracts';
import { hashState } from './hash.ts';
import { orderMilliAt, pickingMilliAt } from './rules.ts';
import { WAREHOUSE_SCHEMA_VERSION, READY_BOOSTS } from './state.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { advanceMany, step } from './step.ts';

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** The snapshot of an older save, checked for shape only. */
function snapshotOf(raw: Record<string, unknown>): Record<string, unknown> {
  const save = raw as unknown as WarehouseSaveFile;
  if (typeof save.snapshot !== 'object' || save.snapshot === null || !Array.isArray(save.commandLog)) throw new Error('Save is missing its snapshot or command log');
  return save.snapshot as unknown as Record<string, unknown>;
}

/** Version 1 to 2: boosts (RULES 15, P11), every one ready and not running. */
function addBoosts(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, schemaVersion: 2, snapshot: { ...snapshotOf(raw), schemaVersion: 2, boosts: READY_BOOSTS } };
}

/**
 * Version 2 to 3: the picking line (RULES 3, P12). The line starts empty, and
 * the warehouse gets the Picking lanes level that keeps up with its sales, so
 * an old warehouse is not suddenly choked by a checkpoint it never had to build.
 */
function addPicking(raw: Record<string, unknown>): Record<string, unknown> {
  const snapshot = snapshotOf(raw) as unknown as WarehouseState;
  const levels = snapshot.levels as Omit<WarehouseState['levels'], 'picking'>;
  const arrivals = orderMilliAt(levels.sales);
  let picking = 0;
  while (picking < T.maxPickingLevel.value && pickingMilliAt(picking, levels.contract) < arrivals) picking += 1;
  return { ...raw, schemaVersion: 3, snapshot: { ...snapshot, schemaVersion: 3, backlog: 0, pickRush: 0, levels: { ...levels, picking } } };
}

/**
 * Migrations keyed by the version they upgrade FROM (S9): `WAREHOUSE_MIGRATIONS[1]`
 * turns a version-1 save into version 2. Each has a test with a real old save
 * file (packages/harness/fixtures).
 *
 * Old rules are not kept, so a migration changes only the snapshot, and
 * `migrateWarehouseSave` replays the history since it under today's rules and
 * records the new hash. The game's own saves are compact (the snapshot is the
 * save point, no history): for those the old hash is checked first, and the
 * migrated warehouse is exactly the one that was saved.
 */
export const WAREHOUSE_MIGRATIONS: Readonly<Record<number, Migration>> = { 1: addBoosts, 2: addPicking };

/** Brings a parsed save up to the current schema, or throws a message a player can act on. */
export function migrateWarehouseSave(raw: unknown, migrations: Readonly<Record<number, Migration>> = WAREHOUSE_MIGRATIONS, target = WAREHOUSE_SCHEMA_VERSION): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let save = raw as Record<string, unknown>;
  const found = save.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found)) throw new Error('Save has no schemaVersion');
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
