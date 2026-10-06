/**
 * Saves load, and the migration mechanism works (S9). The warehouse starts at
 * save version 1 (W1), so there is no real old warehouse save yet; the first
 * migration must add one to packages/harness/fixtures with its own test. A real
 * airport save (the game this repo held before, P12's version 2) is refused
 * with a message a player can act on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WarehouseSaveFile } from '@warehouse/contracts';
import { WAREHOUSE_MIGRATIONS, WAREHOUSE_SCHEMA_VERSION, WarehouseSession, createWarehouse, hashState, loadWarehouseSave, migrateWarehouseSave } from '@warehouse/sim';

const airport = JSON.parse(readFileSync(new URL('../fixtures/airport-save-v2.json', import.meta.url), 'utf8')) as unknown;

/** A compact save of a warehouse that has played for a minute, as the game writes them. */
function played(): WarehouseSaveFile {
  const session = new WarehouseSession({ ...createWarehouse({ seed: 5 }), cash: 100_000 });
  session.submit({ tick: 3, type: 'buy', payload: { upgrade: 'receiving' } });
  session.submit({ tick: 5, type: 'tapReceive', payload: {} });
  session.advance(240);
  return session.save({ compact: true });
}

describe('save migrations (S9)', () => {
  it('the warehouse is at save version 1 with no migrations yet', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(WAREHOUSE_MIGRATIONS)).toEqual([]);
  });

  it('refuses an airport save, saying why', () => {
    expect(() => migrateWarehouseSave(airport)).toThrow(/airport save/);
    expect(() => WarehouseSession.load(airport)).toThrow(/airport save/);
  });

  it('a migration changes the snapshot, then the save is replayed under today’s rules and re-hashed', () => {
    const save = played();
    const bumped = migrateWarehouseSave(save, { 1: (raw) => ({ ...raw, schemaVersion: 2, snapshot: { ...(raw.snapshot as object), schemaVersion: 2 } }) }, 2) as unknown as WarehouseSaveFile;
    expect(bumped.schemaVersion).toBe(2);
    expect(bumped.snapshot.schemaVersion).toBe(2);
    expect(bumped.stateHash).toBe(hashState({ ...save.snapshot, schemaVersion: 2 }));
  });

  it('refuses a compact old save that was tampered with, and one from a newer game', () => {
    const save = played();
    const old = { ...save, schemaVersion: 0 };
    const upgrade = { 0: (raw: Record<string, unknown>) => ({ ...raw, schemaVersion: 1 }) };
    expect(() => migrateWarehouseSave({ ...old, stateHash: 'nope' }, upgrade, 1)).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...old, snapshot: { ...save.snapshot, cash: save.snapshot.cash + 1 } }, upgrade, 1)).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...save, schemaVersion: 2 })).toThrow(/newer game version/);
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
