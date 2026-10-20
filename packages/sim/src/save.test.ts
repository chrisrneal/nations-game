import { describe, expect, it } from 'vitest';
import { generatePuzzle } from './generate.ts';
import { hashState } from './hash.ts';
import { GameSession } from './session.ts';
import { startGame } from './game.ts';
import { witnessCommands } from './witness.ts';

function played(): GameSession {
  const session = new GameSession(startGame(generatePuzzle('main', 'practice', 0, 3)));
  const layout = session.state.puzzle.witness[0]!;
  for (const c of witnessCommands(session.state, layout)) expect(session.submit(c).error).toBeNull();
  return session;
}

describe('saves (S9)', () => {
  it('a save reloads to the same game, through a JSON round trip', () => {
    const session = played();
    const loaded = GameSession.load(JSON.parse(JSON.stringify(session.save())));
    expect(hashState(loaded.state)).toBe(hashState(session.state));
    expect(loaded.state.wave).toBe(2);
  });

  it('a compact save keeps the game and drops the log', () => {
    const session = played();
    const save = session.save({ compact: true });
    expect(save.log).toEqual([]);
    expect(hashState(GameSession.load(save).state)).toBe(hashState(session.state));
  });

  it('refuses a damaged save, a save from a newer game and things that are not saves', () => {
    const save = played().save();
    expect(() => GameSession.load({ ...save, hash: '0000000000000000' })).toThrow(/does not lead/);
    expect(() => GameSession.load({ ...save, schemaVersion: 99 })).toThrow(/newer version/);
    expect(() => GameSession.load({ hello: 1 })).toThrow(/not a Snack Attack save/);
  });

  it('refused commands are not logged', () => {
    const session = played();
    const before = session.save().log.length;
    expect(session.submit({ type: 'retry' }).error).not.toBeNull();
    expect(session.save().log.length).toBe(before);
  });
});
