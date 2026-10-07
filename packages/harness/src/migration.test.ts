/**
 * Saves load, and the migration mechanism works (S9). The warehouse started at
 * save version 1 (W1); version 2 adds the WMS (W5) and version 3 its clocks
 * and counters, each tested with a real save the game wrote
 * (fixtures/warehouse-save-v1.json, -v2.json). A real
 * airport save (the game this repo held before, P12's version 2) is refused
 * with a message a player can act on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WarehouseSaveFile } from '@warehouse/contracts';
import { WAREHOUSE_MIGRATIONS, WAREHOUSE_SCHEMA_VERSION, WarehouseSession, createWarehouse, createWms, hashState, loadWarehouseSave, migrateWarehouseSave } from '@warehouse/sim';

const airport = JSON.parse(readFileSync(new URL('../fixtures/airport-save-v2.json', import.meta.url), 'utf8')) as unknown;
const v1 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v1.json', import.meta.url), 'utf8')) as WarehouseSaveFile;
const v2 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v2.json', import.meta.url), 'utf8')) as WarehouseSaveFile;

/** A compact save of a warehouse that has played for a minute, as the game writes them. */
function played(): WarehouseSaveFile {
  const session = new WarehouseSession({ ...createWarehouse({ seed: 5 }), cash: 100_000 });
  session.submit({ tick: 3, type: 'buy', payload: { upgrade: 'receiving' } });
  session.submit({ tick: 5, type: 'tapReceive', payload: {} });
  session.advance(240);
  return session.save({ compact: true });
}

describe('save migrations (S9)', () => {
  it('the warehouse is at save version 3, with migrations from 1 and 2', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(3);
    expect(Object.keys(WAREHOUSE_MIGRATIONS)).toEqual(['1', '2']);
  });

  it.each([
    ['1', v1],
    ['2', v2],
  ])('a real version-%s save gets today’s WMS, and nothing else changes', (_, old) => {
    const migrated = migrateWarehouseSave(old) as unknown as WarehouseSaveFile;
    const { wms, ...rest } = migrated.snapshot;
    const oldRest: Record<string, unknown> = { ...old.snapshot };
    delete oldRest.wms;
    expect(migrated.schemaVersion).toBe(3);
    expect(rest).toEqual({ ...oldRest, schemaVersion: 3 });
    expect(wms).toEqual(createWms({ seed: old.snapshot.rng.seed + old.snapshot.site, tick: old.snapshot.tick, contract: old.snapshot.levels.contract }));
    expect(wms.orders.length).toBeGreaterThan(0);
    const session = WarehouseSession.load(old);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    expect(session.state.cash).toBe(old.snapshot.cash);
    session.advance(400);
    expect(session.state.tick).toBe(old.snapshot.tick + 400);
    expect(session.state.wms.events.some((e) => e.code === 'WAVE REL')).toBe(true);
  });

  it('refuses an airport save, saying why', () => {
    expect(() => migrateWarehouseSave(airport)).toThrow(/airport save/);
    expect(() => WarehouseSession.load(airport)).toThrow(/airport save/);
  });

  it('a migration changes the snapshot, then the save is replayed under today’s rules and re-hashed', () => {
    const save = played();
    const bumped = migrateWarehouseSave(save, { 3: (raw) => ({ ...raw, schemaVersion: 4, snapshot: { ...(raw.snapshot as object), schemaVersion: 4 } }) }, 4) as unknown as WarehouseSaveFile;
    expect(bumped.schemaVersion).toBe(4);
    expect(bumped.snapshot.schemaVersion).toBe(4);
    expect(bumped.stateHash).toBe(hashState({ ...save.snapshot, schemaVersion: 4 }));
  });

  it('refuses a compact old save that was tampered with, and one from a newer game', () => {
    const save = played();
    const old = { ...save, schemaVersion: 2 };
    expect(() => migrateWarehouseSave({ ...old, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...old, snapshot: { ...save.snapshot, cash: save.snapshot.cash + 1 } })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...save, schemaVersion: 4 })).toThrow(/newer game version/);
  });

  it('a saved warehouse loads to the same state and keeps playing', () => {
    const save = played();
    const loaded = loadWarehouseSave(save);
    expect(hashState(loaded.state)).toBe(save.stateHash);
    const session = WarehouseSession.load(save);
    session.submit({ tick: session.state.tick, type: 'tapPick', payload: {} });
    const events = session.advance(4);
    expect(events.some((e) => e.type === 'rejected')).toBe(false);
    expect(session.state.run.taps).toBe(loaded.state.run.taps + 1);
  });
});
