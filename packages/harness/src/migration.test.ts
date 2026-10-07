/**
 * Saves load, and the migration mechanism works (S9). The warehouse started at
 * save version 1 (W1); version 2 adds the WMS (W5), version 3 its clocks
 * and counters, version 4 expedites and version 5 inbound and inventory (W6),
 * each tested with a real save the game wrote (fixtures/warehouse-save-v1.json
 * to -v5.json). A real
 * airport save (the game this repo held before, P12's version 2) is refused
 * with a message a player can act on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WarehouseSaveFile } from '@warehouse/contracts';
import { WAREHOUSE_MIGRATIONS, WAREHOUSE_SCHEMA_VERSION, WarehouseSession, createWarehouse, createWms, emptyInbound, hashState, loadWarehouseSave, migrateWarehouseSave } from '@warehouse/sim';

const airport = JSON.parse(readFileSync(new URL('../fixtures/airport-save-v2.json', import.meta.url), 'utf8')) as unknown;
const v1 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v1.json', import.meta.url), 'utf8')) as WarehouseSaveFile;
const v2 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v2.json', import.meta.url), 'utf8')) as WarehouseSaveFile;
const v3 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v3.json', import.meta.url), 'utf8')) as WarehouseSaveFile;
const v4 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v4.json', import.meta.url), 'utf8')) as WarehouseSaveFile;
const v5 = JSON.parse(readFileSync(new URL('../fixtures/warehouse-save-v5.json', import.meta.url), 'utf8')) as WarehouseSaveFile;

/** A compact save of a warehouse that has played for a minute, as the game writes them. */
function played(): WarehouseSaveFile {
  const session = new WarehouseSession({ ...createWarehouse({ seed: 5 }), cash: 100_000 });
  session.submit({ tick: 3, type: 'buy', payload: { upgrade: 'receiving' } });
  session.submit({ tick: 5, type: 'tapReceive', payload: {} });
  session.advance(240);
  return session.save({ compact: true });
}

describe('save migrations (S9)', () => {
  it('the warehouse is at save version 6, with migrations from 1 to 5', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(6);
    expect(Object.keys(WAREHOUSE_MIGRATIONS)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('a real version-5 save gains the default plan; each picker stands at its line’s bin, and the WMS plays on (W7)', () => {
    const migrated = migrateWarehouseSave(v5) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(6);
    const { wms, ...rest } = migrated.snapshot;
    const oldRest: Record<string, unknown> = { ...v5.snapshot };
    delete oldRest.wms;
    expect(rest).toEqual({ ...oldRest, schemaVersion: 6 });
    const old = v5.snapshot.wms as unknown as Record<string, unknown> & typeof wms;
    expect(wms.policy).toEqual({ pick: 'priority', release: 'waves', pickers: old.pickers.length });
    expect({ ...wms, pickers: [], policy: null }).toEqual({ ...old, pickers: [], policy: null });
    const busy = old.pickers.filter((p) => p.order > 0);
    expect(busy.length).toBeGreaterThan(0);
    for (const p of wms.pickers) {
      const line = old.orders.find((o) => o.no === p.order)?.lines.find((l) => l.no === p.line);
      expect(p).toEqual({ ...old.pickers.find((x) => x.id === p.id), at: line?.bin ?? -1, walk: 0 });
    }
    const session = WarehouseSession.load(v5);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    session.advance(2400);
    expect(session.state.wms.stats.shipped).toBeGreaterThan(old.stats.shipped);
  });

  it('a real version-4 save keeps its orders, stock and log; the WMS gains inbound and inventory, then raises POs (W6)', () => {
    const migrated = migrateWarehouseSave(v4) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(6);
    const { wms, ...rest } = migrated.snapshot;
    const oldRest: Record<string, unknown> = { ...v4.snapshot };
    delete oldRest.wms;
    expect(rest).toEqual({ ...oldRest, schemaVersion: 6 });
    expect(wms.orders).toEqual(v4.snapshot.wms.orders);
    expect(wms.events).toEqual(v4.snapshot.wms.events);
    expect(wms.inventory).toEqual(v4.snapshot.wms.inventory.map((s) => ({ ...s, picked: 0, counted: -1, variance: 0 })));
    expect(wms).toMatchObject(emptyInbound(v4.snapshot.tick));
    const session = WarehouseSession.load(v4);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    session.advance(2400);
    expect(session.state.wms.pos.length).toBeGreaterThan(0);
    expect(session.state.wms.inbound.unitsReceived).toBeGreaterThan(0);
    expect(session.state.wms.stats.shipped).toBeGreaterThan(v4.snapshot.wms.stats.shipped);
  });

  it('a real version-3 save keeps its moving WMS; every order gains expedited: false', () => {
    const migrated = migrateWarehouseSave(v3) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.snapshot.wms.orders).toEqual(v3.snapshot.wms.orders.map((o) => ({ ...o, expedited: false })));
    expect({ ...migrated.snapshot.wms, orders: [], inventory: [], pickers: [], policy: null }).toEqual({ ...v3.snapshot.wms, orders: [], inventory: [], pickers: [], policy: null, ...emptyInbound(v3.snapshot.tick) });
    const session = WarehouseSession.load(v3);
    session.advance(400);
    expect(session.state.wms.stats.shipped).toBeGreaterThan(v3.snapshot.wms.stats.shipped);
  });

  it.each([
    ['1', v1],
    ['2', v2],
  ])('a real version-%s save gets today’s WMS, and nothing else changes', (_, old) => {
    const migrated = migrateWarehouseSave(old) as unknown as WarehouseSaveFile;
    const { wms, ...rest } = migrated.snapshot;
    const oldRest: Record<string, unknown> = { ...old.snapshot };
    delete oldRest.wms;
    expect(migrated.schemaVersion).toBe(6);
    expect(rest).toEqual({ ...oldRest, schemaVersion: 6 });
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
    const bumped = migrateWarehouseSave(save, { 6: (raw) => ({ ...raw, schemaVersion: 7, snapshot: { ...(raw.snapshot as object), schemaVersion: 7 } }) }, 7) as unknown as WarehouseSaveFile;
    expect(bumped.schemaVersion).toBe(7);
    expect(bumped.snapshot.schemaVersion).toBe(7);
    expect(bumped.stateHash).toBe(hashState({ ...save.snapshot, schemaVersion: 7 }));
  });

  it('refuses a compact old save that was tampered with, and one from a newer game', () => {
    const save = played();
    const old = { ...save, schemaVersion: 5 };
    expect(() => migrateWarehouseSave({ ...old, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...old, snapshot: { ...save.snapshot, cash: save.snapshot.cash + 1 } })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...save, schemaVersion: 7 })).toThrow(/newer game version/);
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
