import type { AirportCommand, AirportSaveFile, AirportState } from '@airport/contracts';
import { hashState } from './hash.ts';
import { AIRPORT_SCHEMA_VERSION } from './state.ts';
import { advanceMany, step } from './step.ts';

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM (S9): `AIRPORT_MIGRATIONS[1]`
 * turns a version-1 save into version 2. Version 1 is the first airport save, so
 * there are none yet. When AIRPORT_SCHEMA_VERSION is bumped, add the entry and a
 * test with a real old save file.
 */
export const AIRPORT_MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Brings a parsed save up to the current schema, or throws a message a player can act on. */
export function migrateAirportSave(raw: unknown, migrations: Readonly<Record<number, Migration>> = AIRPORT_MIGRATIONS, target = AIRPORT_SCHEMA_VERSION): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let save = raw as Record<string, unknown>;
  const found = save.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found)) throw new Error('Save has no schemaVersion');
  let version = found;
  if (version > target) throw new Error(`Save is from a newer game version (${version} > ${target}); update the app`);
  while (version < target) {
    const migrate = migrations[version];
    if (migrate === undefined) throw new Error(`No migration from save version ${version}`);
    save = migrate(save);
    if (save.schemaVersion !== version + 1) throw new Error(`Migration from ${version} did not produce ${version + 1}`);
    version += 1;
  }
  return save;
}

export function createAirportSave(snapshot: AirportState, commandLog: readonly AirportCommand[], current: AirportState): AirportSaveFile {
  return { schemaVersion: AIRPORT_SCHEMA_VERSION, snapshot, commandLog: [...commandLog], savedAtTick: current.tick, stateHash: hashState(current) };
}

/** Steps `state` to `untilTick`, applying commands at their ticks and catching up fast in between. */
export function replay(state: AirportState, commands: readonly AirportCommand[], untilTick: number): AirportState {
  const byTick = new Map<number, AirportCommand[]>();
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

export interface LoadedAirport {
  readonly state: AirportState;
  readonly snapshot: AirportState;
  /** Commands before the save point: still the log since the snapshot. */
  readonly replayed: readonly AirportCommand[];
  /** Commands for the save point or later, to queue again. */
  readonly pending: readonly AirportCommand[];
}

/** Migrate, replay the log from the snapshot, and verify the hash. */
export function loadAirportSave(raw: unknown): LoadedAirport {
  const save = migrateAirportSave(raw) as unknown as AirportSaveFile;
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
