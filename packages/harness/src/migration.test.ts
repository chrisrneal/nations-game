/**
 * Saves from older versions still load (S9): a real version-1 save, written by
 * the game before boosts (P11), migrates to the current version and replays to
 * the same airport, with every boost ready.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AirportSaveFile } from '@airport/contracts';
import { AIRPORT_SCHEMA_VERSION, AirportSession, READY_BOOSTS, hashState, loadAirportSave, migrateAirportSave } from '@airport/sim';

const v1 = JSON.parse(readFileSync(new URL('../fixtures/airport-save-v1.json', import.meta.url), 'utf8')) as AirportSaveFile;

describe('save migrations (S9)', () => {
  it('the fixture is a version-1 save with play in its log', () => {
    expect(v1.schemaVersion).toBe(1);
    expect(v1.commandLog.length).toBeGreaterThan(100);
    expect('boosts' in v1.snapshot).toBe(false);
  });

  it('version 1 to 2 adds ready boosts and replays to the version-1 airport', () => {
    const migrated = migrateAirportSave(v1) as unknown as AirportSaveFile;
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.snapshot.boosts).toEqual(READY_BOOSTS);
    const loaded = loadAirportSave(v1);
    expect(loaded.state.tick).toBe(v1.savedAtTick);
    expect(loaded.state.boosts).toEqual(READY_BOOSTS);
    const asV1 = Object.fromEntries(Object.entries({ ...loaded.state, schemaVersion: 1 }).filter(([key]) => key !== 'boosts'));
    expect(hashState(asV1)).toBe(v1.stateHash);
    expect(AIRPORT_SCHEMA_VERSION).toBe(2);
  });

  it('a migrated airport keeps playing, and its pending command is queued again', () => {
    const session = AirportSession.load(v1);
    const events = session.advance(4);
    expect(session.state.run.taps).toBe(loadAirportSave(v1).state.run.taps + 1);
    expect(events.some((e) => e.type === 'rejected')).toBe(false);
    session.submit({ tick: session.state.tick, type: 'boost', payload: { boost: 'rushHour' } });
    expect(session.advance(1).some((e) => e.type === 'boosted')).toBe(true);
  });

  it('refuses a version-1 save that was tampered with', () => {
    expect(() => migrateAirportSave({ ...v1, stateHash: 'nope' })).toThrow(/does not replay/);
  });
});
