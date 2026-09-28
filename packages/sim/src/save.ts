import type { Command, SaveFile } from '@nations/contracts';
import { hashState } from './hash.ts';
import { step } from './step.ts';
import { SCHEMA_VERSION, type WorldState } from './world.ts';

/**
 * A save (seam 9): snapshot plus every command since it, plus where to stop.
 * `savedAtTick` is needed because ticks without commands leave no trace in the
 * log; `stateHash` lets a load prove it rebuilt exactly the saved game.
 * Extends the contracts `SaveFile` (lane C owns it; see docs/GAPS.md).
 */
export interface SimSaveFile extends SaveFile {
  readonly snapshot: WorldState;
  readonly savedAtTick: number;
  readonly stateHash: string;
}

/**
 * Migrations keyed by the version they upgrade FROM: `MIGRATIONS[1]` turns a
 * version-1 save into version 2. When `SCHEMA_VERSION` is bumped, add the
 * matching entry and a test with a real old save file.
 *
 * 1 -> 2 cannot be done: a Phase 0 save holds no economy, and its recorded
 * hash was made by rules that no longer exist, so it could never verify. It
 * fails with a message a player can act on instead of a hash mismatch.
 */
export const MIGRATIONS: Readonly<Record<number, (save: Record<string, unknown>) => Record<string, unknown>>> = {
  1: () => {
    throw new Error('This save is from the Phase 0 prototype, which had no economy. Start a new game.');
  },
};

/** Brings a parsed save up to the current schema, or throws loudly. */
export function migrateSave(
  raw: unknown,
  migrations: typeof MIGRATIONS = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let save = raw as Record<string, unknown>;
  const found = save.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found)) {
    throw new Error('Save has no schemaVersion');
  }
  let version: number = found;
  if (version > target) {
    throw new Error(`Save is from a newer game version (${version} > ${target}); update the app`);
  }
  while (version < target) {
    const migrate = migrations[version];
    if (migrate === undefined) throw new Error(`No migration from save version ${version}`);
    save = migrate(save);
    if (save.schemaVersion !== version + 1) {
      throw new Error(`Migration from ${version} did not produce ${version + 1}`);
    }
    version += 1;
  }
  return save;
}

export function createSave(
  snapshot: WorldState,
  commandLog: readonly Command[],
  current: WorldState,
): SimSaveFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    snapshot,
    commandLog: [...commandLog],
    savedAtTick: current.tick,
    stateHash: hashState(current),
  };
}

export interface LoadedGame {
  readonly state: WorldState;
  /** Commands stamped for ticks at or after the save point, to re-queue. */
  readonly pending: readonly Command[];
  /** Commands before the save point, still valid as the log since `snapshot`. */
  readonly replayed: readonly Command[];
  readonly snapshot: WorldState;
}

/** Migrate, replay the log from the snapshot, and verify the hash. */
export function loadSave(raw: unknown): LoadedGame {
  const save = migrateSave(raw) as unknown as SimSaveFile;
  const { snapshot, commandLog, savedAtTick, stateHash } = save;
  if (typeof snapshot !== 'object' || snapshot === null || !Array.isArray(commandLog)) {
    throw new Error('Save is missing its snapshot or command log');
  }
  if (!Number.isInteger(savedAtTick) || savedAtTick < snapshot.tick) {
    throw new Error('Save has an invalid savedAtTick');
  }

  const byTick = new Map<number, Command[]>();
  const pending: Command[] = [];
  const replayed: Command[] = [];
  for (const command of commandLog) {
    if (command.tick < snapshot.tick) throw new Error('Command log starts before the snapshot');
    if (command.tick >= savedAtTick) {
      pending.push(command);
      continue;
    }
    replayed.push(command);
    const list = byTick.get(command.tick) ?? [];
    list.push(command);
    byTick.set(command.tick, list);
  }

  let state = snapshot;
  while (state.tick < savedAtTick) state = step(state, byTick.get(state.tick) ?? []).state;

  const actual = hashState(state);
  if (actual !== stateHash) {
    throw new Error(`Save does not replay to its recorded state (hash ${actual}, expected ${stateHash})`);
  }
  return { state, pending, replayed, snapshot };
}
