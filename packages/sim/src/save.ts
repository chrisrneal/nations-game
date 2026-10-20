import type { GameCommand, GameSaveFile, GameState } from '@snacks/contracts';
import { SCHEMA_VERSION, step } from './game.ts';
import { hashState } from './hash.ts';

export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM (S9): `MIGRATIONS[1]`
 * would turn a version-1 save into version 2. Snack Attack starts at 1 (K1);
 * warehouse saves are not carried over (a different database name, too).
 * Each migration needs a test with a real old save file.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** A save: the snapshot, the commands since, and the hash of where they lead. */
export function createSave(snapshot: GameState, log: readonly GameCommand[], current: GameState): GameSaveFile {
  return { format: 'snack-attack-save', schemaVersion: SCHEMA_VERSION, snapshot, log: [...log], hash: hashState(current) };
}

/** Upgrades an older save, step by step; refuses one from a newer game. */
export function migrateSave(raw: Record<string, unknown>): Record<string, unknown> {
  let save = raw;
  let version = typeof save.schemaVersion === 'number' ? save.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error('That save is from a newer version of the game; update the app');
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (migrate === undefined) throw new Error(`No way to read a version ${version} save`);
    save = migrate(save);
    version = save.schemaVersion as number;
  }
  return save;
}

export interface LoadedGame {
  readonly snapshot: GameState;
  readonly log: readonly GameCommand[];
  readonly state: GameState;
}

/** Reads a save: replays its log over the snapshot and checks the hash, so a damaged save is never played. */
export function loadSave(raw: unknown): LoadedGame {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 'snack-attack-save') throw new Error('That is not a Snack Attack save');
  const save = migrateSave(raw as Record<string, unknown>) as unknown as GameSaveFile;
  let state = save.snapshot;
  for (const command of save.log) {
    const r = step(state, command);
    if (r.error !== null) throw new Error(`Saved command refused: ${r.error}`);
    state = r.state;
  }
  if (hashState(state) !== save.hash) throw new Error('The save does not lead where it says it does');
  return { snapshot: save.snapshot, log: save.log, state };
}
