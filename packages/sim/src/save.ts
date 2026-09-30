import type { Command, SaveFile } from '@nations/contracts';
import { hashState } from './hash.ts';
import { step } from './step.ts';
import { EMPTY_LEDGER, EMPTY_REPORT, SCHEMA_VERSION, defaultPolicy, emptyPools, type WorldState } from './world.ts';

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
 *
 * 2 -> 3 (prompt 09: structural baseline, own-imbalance trade gains, smoothed
 * score). A save with nothing to replay (every phone save: the snapshot is the
 * saved position) keeps its position exactly: the snapshot gains an empty
 * score track, so smoothing starts from the next month, and its hash is
 * re-recorded for the new shape. A save whose move history must be replayed
 * cannot be: the new rules would replay it to a different position, so it is
 * refused with a message a player can act on.
 */
function migrate2to3(save: Record<string, unknown>): Record<string, unknown> {
  const snapshot = save.snapshot as Record<string, unknown> | undefined;
  const log = save.commandLog;
  if (typeof snapshot !== 'object' || snapshot === null || !Array.isArray(log)) {
    throw new Error('Save is missing its snapshot or command log');
  }
  const savedAtTick = save.savedAtTick;
  const replays = snapshot.tick !== savedAtTick || (log as { tick?: unknown }[]).some((c) => typeof c.tick === 'number' && c.tick < (savedAtTick as number));
  if (replays) {
    throw new Error(
      'This save needs its moves replayed, and the scoring rules changed since it was made, so they would not replay to the same position. Start a new game.',
    );
  }
  const upgraded = { ...snapshot, schemaVersion: 3, scoreTrack: {} } as unknown as WorldState;
  return { ...save, schemaVersion: 3, snapshot: upgraded, stateHash: hashState(upgraded) };
}

/** True when a save's command log must be replayed from its snapshot to reach the saved position. */
function needsReplay(save: Record<string, unknown>): boolean {
  const snapshot = save.snapshot as Record<string, unknown> | undefined;
  const log = save.commandLog;
  if (typeof snapshot !== 'object' || snapshot === null || !Array.isArray(log)) {
    throw new Error('Save is missing its snapshot or command log');
  }
  const savedAtTick = save.savedAtTick;
  return snapshot.tick !== savedAtTick || (log as { tick?: unknown }[]).some((c) => typeof c.tick === 'number' && c.tick < (savedAtTick as number));
}

/**
 * 3 -> 4 (Phase 2 prompt 09: crises, pools, pledges, crisis policies). Like
 * 2 -> 3, a save with nothing to replay keeps its position: the world gains
 * empty pools and no open crises (the first appeal opens on the next
 * schedule), each nation gains the default crisis policy and zero pledge
 * counters, and the hash is re-recorded. A save that must replay is refused:
 * crises now draw from the RNG every month, so it would replay differently.
 */
function migrate3to4(save: Record<string, unknown>): Record<string, unknown> {
  if (needsReplay(save)) {
    throw new Error('This save needs its moves replayed, and crises changed the rules since it was made, so they would not replay to the same position. Start a new game.');
  }
  const snapshot = save.snapshot as Record<string, unknown>;
  const nations = (snapshot.nations ?? {}) as Record<string, Record<string, unknown>>;
  const upgradedNations: Record<string, unknown> = {};
  const policyDefaults = defaultPolicy();
  for (const [id, n] of Object.entries(nations)) {
    const priv = n.private as Record<string, unknown>;
    upgradedNations[id] = {
      ...n,
      private: {
        ...priv,
        policy: {
          ...(priv.policy as object),
          crisisRule: policyDefaults.crisisRule,
          contributionBp: policyDefaults.contributionBp,
          contributionTo: policyDefaults.contributionTo,
        },
        last: { ...EMPTY_REPORT, ...(priv.last as object) },
        pledgesHonoured: 0,
        pledgesBroken: 0,
        pooledTotal: 0,
      },
    };
  }
  const upgraded = {
    ...snapshot,
    schemaVersion: 4,
    nations: upgradedNations,
    ledger: { ...EMPTY_LEDGER, ...(snapshot.ledger as object) },
    pools: emptyPools(),
    crises: [],
    recentCrises: [],
    pledges: [],
    hits: [],
    nextCrisisId: 1,
    nextPledgeId: 1,
  } as unknown as WorldState;
  return { ...save, schemaVersion: 4, snapshot: upgraded, stateHash: hashState(upgraded) };
}

/**
 * 4 -> 5 (prompt 17: home investment). Like the earlier steps, a save with
 * nothing to replay keeps its position: every nation gains no home capacity, no
 * builds, the default investment share and a zero investment in its report, the
 * ledger gains the new sink at zero, and the hash is re-recorded. A save that
 * must replay is refused: the standing rule now invests every month, so the log
 * would replay to a different position.
 */
function migrate4to5(save: Record<string, unknown>): Record<string, unknown> {
  if (needsReplay(save)) {
    throw new Error('This save needs its moves replayed, and home investment changed the rules since it was made, so they would not replay to the same position. Start a new game.');
  }
  const snapshot = save.snapshot as Record<string, unknown>;
  const nations = (snapshot.nations ?? {}) as Record<string, Record<string, unknown>>;
  const upgradedNations: Record<string, unknown> = {};
  const policyDefaults = defaultPolicy();
  for (const [id, n] of Object.entries(nations)) {
    const priv = n.private as Record<string, unknown>;
    upgradedNations[id] = {
      ...n,
      private: {
        ...priv,
        home: { food: 0, energy: 0 },
        builds: [],
        policy: { ...(priv.policy as object), investBp: policyDefaults.investBp },
        last: { ...EMPTY_REPORT, ...(priv.last as object), invested: 0 },
      },
    };
  }
  const upgraded = {
    ...snapshot,
    schemaVersion: 5,
    nations: upgradedNations,
    ledger: { ...EMPTY_LEDGER, ...(snapshot.ledger as object), creditSpentInvestment: 0 },
  } as unknown as WorldState;
  return { ...save, schemaVersion: 5, snapshot: upgraded, stateHash: hashState(upgraded) };
}

export const MIGRATIONS: Readonly<Record<number, (save: Record<string, unknown>) => Record<string, unknown>>> = {
  1: () => {
    throw new Error('This save is from the Phase 0 prototype, which had no economy. Start a new game.');
  },
  2: migrate2to3,
  3: migrate3to4,
  4: migrate4to5,
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
