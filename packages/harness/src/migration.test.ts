/**
 * Saves from older versions still load (S9). Two real old saves, written by
 * the game itself: a version-1 save from before boosts (P11), with a long
 * history in its log, and a version-2 autosave from before the security line
 * (P12), compact as the game writes them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AirportSaveFile } from '@airport/contracts';
import { AIRPORT_SCHEMA_VERSION, AirportSession, READY_BOOSTS, airportView, derive, hashState, loadAirportSave, migrateAirportSave } from '@airport/sim';

const fixture = (name: string): AirportSaveFile => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as AirportSaveFile;
const v1 = fixture('airport-save-v1.json');
const v2 = fixture('airport-save-v2.json');

describe('save migrations (S9)', () => {
  it('the fixtures are a version-1 save with play in its log and a compact version-2 autosave', () => {
    expect(AIRPORT_SCHEMA_VERSION).toBe(3);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.commandLog.length).toBeGreaterThan(100);
    expect('boosts' in v1.snapshot).toBe(false);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.snapshot.tick).toBe(v2.savedAtTick);
    expect('line' in v2.snapshot).toBe(false);
    expect(v2.commandLog.every((c) => c.tick >= v2.savedAtTick)).toBe(true);
  });

  it('version 2 to 3: the saved airport exactly, with an empty line and the Security lanes that keep up with its terminal', () => {
    const migrated = migrateAirportSave(v2) as unknown as AirportSaveFile;
    expect(migrated.schemaVersion).toBe(3);
    const loaded = loadAirportSave(v2);
    const state = loaded.state;
    expect(state.line).toBe(0);
    expect(state.securityRush).toBe(0);
    // Everything else is the version-2 airport, field for field.
    const without = (o: object, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    expect(without(state, ['line', 'securityRush', 'levels', 'schemaVersion'])).toEqual(without(v2.snapshot, ['levels', 'schemaVersion']));
    const { levels } = state;
    const security = levels.security;
    expect(without(levels, ['security'])).toEqual(v2.snapshot.levels);
    const d = derive(state);
    expect(d.securityMilli).toBeGreaterThanOrEqual(d.arrivalMilli);
    expect(derive({ ...state, levels: { ...levels, security: security - 1 } }).securityMilli).toBeLessThan(d.arrivalMilli);
    expect(airportView(state).bottleneck.kind).not.toBe('security');
  });

  it('version 1 to 3: boosts ready, the line empty; the history since the snapshot replays under today’s rules', () => {
    const migrated = migrateAirportSave(v1) as unknown as AirportSaveFile;
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.snapshot.boosts).toEqual(READY_BOOSTS);
    expect(migrated.snapshot.line).toBe(0);
    expect(migrated.snapshot.levels.security).toBe(0);
    const loaded = loadAirportSave(v1);
    expect(loaded.state.tick).toBe(v1.savedAtTick);
    expect(hashState(loaded.state)).toBe(migrated.stateHash);
  });

  it('migrated airports keep playing, and their pending commands are queued again', () => {
    for (const old of [v1, v2]) {
      const session = AirportSession.load(old);
      const taps = loadAirportSave(old).state.run.taps;
      const events = session.advance(4);
      expect(session.state.run.taps).toBe(taps + 1);
      expect(events.some((e) => e.type === 'rejected')).toBe(false);
      session.submit({ tick: session.state.tick, type: 'tapSecurity', payload: {} });
      session.advance(1);
      expect(session.state.securityRush).toBeGreaterThan(0);
    }
  });

  it('refuses a compact old save that was tampered with', () => {
    expect(() => migrateAirportSave({ ...v2, stateHash: 'nope' })).toThrow(/does not match/);
    expect(() => migrateAirportSave({ ...v2, snapshot: { ...v2.snapshot, cash: v2.snapshot.cash + 1 } })).toThrow(/does not match/);
  });
});
