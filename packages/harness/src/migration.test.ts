/**
 * Saves from older versions still load (S9). Two real old saves, written by
 * the game itself: a version-1 save from before boosts (P11), with a long
 * history in its log, and a version-2 autosave from before the picking line
 * (P12), compact as the game writes them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WarehouseSaveFile } from '@warehouse/contracts';
import { WAREHOUSE_SCHEMA_VERSION, WarehouseSession, READY_BOOSTS, warehouseView, derive, hashState, loadWarehouseSave, migrateWarehouseSave } from '@warehouse/sim';

const fixture = (name: string): WarehouseSaveFile => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as WarehouseSaveFile;
const v1 = fixture('warehouse-save-v1.json');
const v2 = fixture('warehouse-save-v2.json');

describe('save migrations (S9)', () => {
  it('the fixtures are a version-1 save with play in its log and a compact version-2 autosave', () => {
    expect(WAREHOUSE_SCHEMA_VERSION).toBe(3);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.commandLog.length).toBeGreaterThan(100);
    expect('boosts' in v1.snapshot).toBe(false);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.snapshot.tick).toBe(v2.savedAtTick);
    expect('backlog' in v2.snapshot).toBe(false);
    expect(v2.commandLog.every((c) => c.tick >= v2.savedAtTick)).toBe(true);
  });

  it('version 2 to 3: the saved warehouse exactly, with an empty line and the Picking lanes that keep up with its sales', () => {
    const migrated = migrateWarehouseSave(v2) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(3);
    const loaded = loadWarehouseSave(v2);
    const state = loaded.state;
    expect(state.backlog).toBe(0);
    expect(state.pickRush).toBe(0);
    // Everything else is the version-2 warehouse, field for field.
    const without = (o: object, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    expect(without(state, ['backlog', 'pickRush', 'levels', 'schemaVersion'])).toEqual(without(v2.snapshot, ['levels', 'schemaVersion']));
    const { levels } = state;
    const picking = levels.picking;
    expect(without(levels, ['picking'])).toEqual(v2.snapshot.levels);
    const d = derive(state);
    expect(d.pickingMilli).toBeGreaterThanOrEqual(d.orderMilli);
    expect(derive({ ...state, levels: { ...levels, picking: picking - 1 } }).pickingMilli).toBeLessThan(d.orderMilli);
    expect(warehouseView(state).bottleneck.kind).not.toBe('picking');
  });

  it('version 1 to 3: boosts ready, the line empty; the history since the snapshot replays under today’s rules', () => {
    const migrated = migrateWarehouseSave(v1) as unknown as WarehouseSaveFile;
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.snapshot.boosts).toEqual(READY_BOOSTS);
    expect(migrated.snapshot.backlog).toBe(0);
    expect(migrated.snapshot.levels.picking).toBe(0);
    const loaded = loadWarehouseSave(v1);
    expect(loaded.state.tick).toBe(v1.savedAtTick);
    expect(hashState(loaded.state)).toBe(migrated.stateHash);
  });

  it('migrated warehouses keep playing, and their pending commands are queued again', () => {
    for (const old of [v1, v2]) {
      const session = WarehouseSession.load(old);
      const taps = loadWarehouseSave(old).state.run.taps;
      const events = session.advance(4);
      expect(session.state.run.taps).toBe(taps + 1);
      expect(events.some((e) => e.type === 'rejected')).toBe(false);
      session.submit({ tick: session.state.tick, type: 'tapPick', payload: {} });
      session.advance(1);
      expect(session.state.pickRush).toBeGreaterThan(0);
    }
  });

  it('refuses a compact old save that was tampered with', () => {
    expect(() => migrateWarehouseSave({ ...v2, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateWarehouseSave({ ...v2, snapshot: { ...v2.snapshot, cash: v2.snapshot.cash + 1 } })).toThrow(/does not match/);
  });
});
