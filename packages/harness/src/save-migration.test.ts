/**
 * Every save migration is tested with a real old save file (S9). The file in
 * fixtures/ was written by the game before K9 (schema 1): a practice board
 * with wave 1 played and wave 2 set up but not yet played.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, SCHEMA_VERSION, gameView, hashState, step } from '@snacks/sim';

const v1 = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('../fixtures/save-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;

describe('a version-1 save (before hints, K9)', () => {
  it('loads at the same point, with no hints used yet, and plays on', () => {
    const raw = v1();
    expect(raw.schemaVersion).toBe(1);
    const session = GameSession.load(raw);
    expect(session.state.wave).toBe(2);
    expect(session.state.hints).toEqual([]);
    expect(session.state.hint).toBeNull();
    expect(gameView(session.state).mainHint).toBeNull();
    expect(session.submit({ type: 'hint' }).error).toBeNull();
    expect(session.state.hints).toEqual([0, 1]);
    expect(session.submit({ type: 'go' }).error).toBeNull();
    expect(session.state.wave).toBe(3);
  });

  it('saves again as the current version and reloads to the same game', () => {
    const session = GameSession.load(v1());
    const again = session.save();
    expect(again.schemaVersion).toBe(SCHEMA_VERSION);
    expect(hashState(GameSession.load(JSON.parse(JSON.stringify(again))).state)).toBe(hashState(session.state));
  });

  it('a damaged version-1 save is still refused', () => {
    expect(() => GameSession.load({ ...v1(), hash: '0000000000000000' })).toThrow(/does not lead/);
    const raw = v1();
    const log = raw.log as unknown[];
    expect(() => GameSession.load({ ...raw, log: log.slice(0, -1) })).toThrow();
  });

  it('was a real game: its commands are what the game accepted', () => {
    const raw = v1();
    expect((raw.log as { type: string }[]).some((c) => c.type === 'go')).toBe(true);
    expect(step(GameSession.load(raw).state, { type: 'retry' }).error).not.toBeNull();
  });
});
