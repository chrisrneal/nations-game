/**
 * Saves load, and the migration mechanism works (S9). The warehouse started at
 * save version 1 (W1); versions 2-6 added the WMS beside the idle game
 * (W5-W7), and version 7 drops the idle game and opens a fresh WMS with its
 * crew, tasks and dock appointments (W8); version 8 gives the plan its wave
 * interval and labour setting (W9); version 9 adds the outbound doors and
 * tops up the crew (W10). Each step is tested with a real save the game
 * wrote (fixtures/warehouse-save-v1.json to -v8.json). A real airport
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

/**
 * A real compact version-8 save (seed 88, six warehouse hours in, a hire and
 * a plan change), written by the W9 build at a moment with one order STAGED
 * and one LOADED under the old timers (W10).
 */
const V8 = fixture('warehouse-save-v8');

/** What an idle-game snapshot kept that version 7 still has. */
interface IdleSnapshot {
  readonly tick: number;
  readonly cash: number;
  readonly site: number;
  readonly rng: { readonly seed: number };
}

/** A compact save of a warehouse that has played for a minute, as the game writes them. */
function played(): WarehouseSaveFile {
  const session = new WarehouseSession({ ...createWarehouse({ seed: 5 }), cash: 1_000_000 });
  session.submit({ tick: 3, type: 'wms', payload: { action: 'hire', role: 'receive' } });
  session.advance(240);
  return session.save({ compact: true });
}

describe('save migrations (S9)', () => {
  it('the warehouse is at save version 9, with migrations from 1 to 8', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(9);
    expect(Object.keys(WAREHOUSE_MIGRATIONS)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('a real version-7 save gains the wave interval and the fixed labour plan (W9), then the outbound doors (W10), and plays on', () => {
    const migrated = migrateWarehouseSave(V7) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.snapshot.schemaVersion).toBe(9);
    expect(migrated.snapshot.wms.policy).toMatchObject({ pick: V7.snapshot.wms.policy.pick, release: V7.snapshot.wms.policy.release, waveTicks: 240, labor: 'fixed' });
    const session = WarehouseSession.load(V7);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    expect(session.state.wms.policy).toMatchObject({ pick: 'nearest', release: 'continuous', waveTicks: 240, labor: 'fixed' });
    session.advance(240);
    expect(session.state.cash).toBe(V7.snapshot.cash + session.state.wms.stats.earned - session.state.wms.stats.spent);
    // Under W9's rules the same history reached this hash; W10's rules play it differently.
    expect(migrated.stateHash).not.toBe(V7_PLAYED_HASH);
  });

  it('a real compact version-8 save gains the outbound doors, its staged and loaded orders are staged again, the crew is topped up, and it plays on (W10)', () => {
    const before = V8.snapshot;
    const migrated = migrateWarehouseSave(V8) as unknown as WarehouseSaveFile;
    const w = migrated.snapshot.wms;
    expect(migrated.schemaVersion).toBe(9);
    expect(w.shipDoors).toEqual(Array.from({ length: 3 }, (_, i) => ({ door: i + 1, trailer: i + 1, departs: before.tick + 80 * (i + 1) })));
    expect(w.nextTrailerNo).toBe(4);
    expect(w.stats.trailers).toBe(0);
    for (const o of before.wms.orders) {
      const now = w.orders.find((x) => x.no === o.no);
      expect(now?.door).toBe(0);
      if (o.status === 'STAGED' || o.status === 'LOADED') expect(now).toMatchObject({ status: 'PACKED', next: before.tick });
      else expect(now?.status).toBe(o.status);
    }
    // Everyone stays; new people join to the opening crew: 14 picking, 6 on the dock.
    expect(w.workers.slice(0, before.wms.workers.length)).toEqual(before.wms.workers);
    expect(w.workers.filter((p) => p.role === 'pick')).toHaveLength(14);
    expect(w.workers.filter((p) => p.role === 'receive')).toHaveLength(6);
    expect(w.policy.pickers).toBe(14);
    expect(w.tasks.every((t) => t.status === 'OPEN' || t.status === 'QUEUED' || t.status === 'ACTIVE')).toBe(true);
    expect(w.history.length).toBeGreaterThan(0);
    const session = WarehouseSession.load(V8);
    expect(hashState(session.state)).toBe(migrated.stateHash);
    session.advance(4 * 60 * 3);
    expect(session.state.wms.stats.trailers).toBeGreaterThan(0);
    expect(session.state.wms.stats.shipped).toBeGreaterThan(before.wms.stats.shipped);
    expect(session.state.cash).toBe(before.cash + session.state.wms.stats.earned - before.wms.stats.earned - (session.state.wms.stats.spent - before.wms.stats.spent));
  });

  it.each(old)('a real version-%s save keeps its tick and cash, opens a fresh WMS, and plays on (W8)', (_, save) => {
    const snapshot = save.snapshot as unknown as IdleSnapshot;
    const migrated = migrateWarehouseSave(save) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.snapshot).toEqual({ schemaVersion: 9, tick: snapshot.tick, cash: snapshot.cash, wms: createWms({ seed: snapshot.rng.seed + snapshot.site, tick: snapshot.tick }) });
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
    const bumped = migrateWarehouseSave(save, { 9: (raw) => ({ ...raw, schemaVersion: 10, snapshot: { ...(raw.snapshot as object), schemaVersion: 10 } }) }, 10) as unknown as WarehouseSaveFile;
    expect(bumped.schemaVersion).toBe(10);
    expect(bumped.snapshot.schemaVersion).toBe(10);
    expect(bumped.stateHash).toBe(hashState({ ...save.snapshot, schemaVersion: 10 }));
  });

  it('refuses a compact old save that was tampered with, and one from a newer game', () => {
    const save = played();
    const older = { ...save, schemaVersion: 8 };
    expect(() => migrateWarehouseSave({ ...older, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...older, snapshot: { ...save.snapshot, cash: save.snapshot.cash + 1 } })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...save, schemaVersion: 10 })).toThrow(/newer game version/);
  });

  it('a saved warehouse loads to the same state and keeps playing', () => {
    const save = played();
    const loaded = loadWarehouseSave(save);
    expect(hashState(loaded.state)).toBe(save.stateHash);
    expect(loaded.state.wms.workers).toHaveLength(21);
    const session = WarehouseSession.load(save);
    session.submit({ tick: session.state.tick, type: 'wms', payload: { action: 'policy', policy: { ...session.state.wms.policy, pick: 'nearest' } } });
    const events = session.advance(4);
    expect(events.some((e) => e.type === 'rejected')).toBe(false);
    expect(session.state.wms.policy.pick).toBe('nearest');
  });
});
