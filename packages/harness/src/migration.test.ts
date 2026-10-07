/**
 * Saves load, and the migration mechanism works (S9). The warehouse started at
 * save version 1 (W1); versions 2-6 added the WMS beside the idle game
 * (W5-W7), and version 7 drops the idle game and opens a fresh WMS with its
 * crew, tasks and dock appointments (W8); version 8 gives the plan its wave
 * interval and labour setting (W9). Each step is tested with a real save
 * the game wrote (fixtures/warehouse-save-v1.json to -v7.json). A real airport
 * save (the game this repo held before, P12's version 2) is refused with a
 * message a player can act on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WarehouseSaveFile } from '@warehouse/contracts';
import { WAREHOUSE_MIGRATIONS, WAREHOUSE_SCHEMA_VERSION, WarehouseSession, createWarehouse, createWms, hashState, loadWarehouseSave, migrateWarehouseSave } from '@warehouse/sim';

const fixture = (name: string): WarehouseSaveFile => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as WarehouseSaveFile;
const airport = fixture('airport-save-v2') as unknown;
const old = [1, 2, 3, 4, 5, 6].map((v) => [v, fixture(`warehouse-save-v${v}`)] as const);

/**
 * A real version-7 save with its full history (seed 77, a hire, a plan change
 * naming three settings): the hash of the state it reached under version 7,
 * with the plan's two new settings added at their old values (W9). Replayed
 * under today's rules it must reach exactly that.
 */
const V7 = fixture('warehouse-save-v7');
const V7_PLAYED_HASH = 'fe606883511299e1';

/** What an idle-game snapshot kept that version 7 still has. */
interface IdleSnapshot {
  readonly tick: number;
  readonly cash: number;
  readonly site: number;
  readonly rng: { readonly seed: number };
}

/** A compact save of a warehouse that has played for a minute, as the game writes them. */
function played(): WarehouseSaveFile {
  const session = new WarehouseSession({ ...createWarehouse({ seed: 5 }), cash: 100_000 });
  session.submit({ tick: 3, type: 'wms', payload: { action: 'hire', role: 'receive' } });
  session.advance(240);
  return session.save({ compact: true });
}

describe('save migrations (S9)', () => {
  it('the warehouse is at save version 8, with migrations from 1 to 7', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(8);
    expect(Object.keys(WAREHOUSE_MIGRATIONS)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('a real version-7 save gains the wave interval and the fixed labour plan, and its history replays exactly (W9)', () => {
    const migrated = migrateWarehouseSave(V7) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.snapshot.schemaVersion).toBe(8);
    expect(migrated.snapshot.wms.policy).toEqual({ ...V7.snapshot.wms.policy, waveTicks: 240, labor: 'fixed' });
    expect(migrated.stateHash).toBe(V7_PLAYED_HASH);
    const session = WarehouseSession.load(V7);
    expect(hashState(session.state)).toBe(V7_PLAYED_HASH);
    expect(session.state.wms.policy).toEqual({ pick: 'nearest', release: 'continuous', pickers: 6, waveTicks: 240, labor: 'fixed' });
    session.advance(240);
    expect(session.state.cash).toBe(V7.snapshot.cash + session.state.wms.stats.earned - session.state.wms.stats.spent);
  });

  it.each(old)('a real version-%s save keeps its tick and cash, opens a fresh WMS, and plays on (W8)', (_, save) => {
    const snapshot = save.snapshot as unknown as IdleSnapshot;
    const migrated = migrateWarehouseSave(save) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.snapshot).toEqual({ schemaVersion: 8, tick: snapshot.tick, cash: snapshot.cash, wms: createWms({ seed: snapshot.rng.seed + snapshot.site, tick: snapshot.tick }) });
    expect(migrated.commandLog.every((c) => c.type === 'wms')).toBe(true);
    const session = WarehouseSession.load(save);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    session.advance(2400);
    expect(session.state.tick).toBe(snapshot.tick + 2400);
    expect(session.state.wms.stats.shipped).toBeGreaterThan(0);
    expect(session.state.cash).toBe(snapshot.cash + session.state.wms.stats.earned);
  });

  it('refuses an airport save, saying why', () => {
    expect(() => migrateWarehouseSave(airport)).toThrow(/airport save/);
    expect(() => WarehouseSession.load(airport)).toThrow(/airport save/);
  });

  it('a migration changes the snapshot, then the save is replayed under today’s rules and re-hashed', () => {
    const save = played();
    const bumped = migrateWarehouseSave(save, { 8: (raw) => ({ ...raw, schemaVersion: 9, snapshot: { ...(raw.snapshot as object), schemaVersion: 9 } }) }, 9) as unknown as WarehouseSaveFile;
    expect(bumped.schemaVersion).toBe(9);
    expect(bumped.snapshot.schemaVersion).toBe(9);
    expect(bumped.stateHash).toBe(hashState({ ...save.snapshot, schemaVersion: 9 }));
  });

  it('refuses a compact old save that was tampered with, and one from a newer game', () => {
    const save = played();
    const older = { ...save, schemaVersion: 7 };
    expect(() => migrateWarehouseSave({ ...older, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...older, snapshot: { ...save.snapshot, cash: save.snapshot.cash + 1 } })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...save, schemaVersion: 9 })).toThrow(/newer game version/);
  });

  it('a saved warehouse loads to the same state and keeps playing', () => {
    const save = played();
    const loaded = loadWarehouseSave(save);
    expect(hashState(loaded.state)).toBe(save.stateHash);
    expect(loaded.state.wms.workers).toHaveLength(10);
    const session = WarehouseSession.load(save);
    session.submit({ tick: session.state.tick, type: 'wms', payload: { action: 'policy', policy: { ...session.state.wms.policy, pick: 'nearest' } } });
    const events = session.advance(4);
    expect(events.some((e) => e.type === 'rejected')).toBe(false);
    expect(session.state.wms.policy.pick).toBe('nearest');
  });
});
