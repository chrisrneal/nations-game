import type { GameCommand, GameState, Puzzle, WaveLayout } from '@snacks/contracts';
import { startGame, step } from './game.ts';

/**
 * Playing a solution through the real game: the proof a witness wins
 * (RULES 10), and the scripted player the harness uses for determinism.
 */

/** The commands that set up one wave's layout from `state` and press Go: buy, clear the board, place. */
export function witnessCommands(state: GameState, layout: WaveLayout): GameCommand[] {
  const commands: GameCommand[] = [];
  let nextId = state.nextFriendId;
  const owned = state.friends.map((f) => ({ id: f.id, type: f.type }));
  for (const type of layout.buys) {
    commands.push({ type: 'buy', friend: type });
    owned.push({ id: nextId++, type });
  }
  for (const f of state.friends) if (f.cell >= 0) commands.push({ type: 'toTray', friend: f.id });
  const used = new Set<number>();
  for (const placed of layout.friends) {
    const friend = owned.find((f) => f.type === placed.type && !used.has(f.id));
    if (friend === undefined) throw new Error(`The witness needs a ${placed.type} the player does not own`);
    used.add(friend.id);
    commands.push({ type: 'place', friend: friend.id, cell: placed.cell, facing: placed.facing });
  }
  commands.push({ type: 'go' });
  return commands;
}

/** Plays a puzzle's witness (or the given layouts) wave by wave and returns the final state; throws on any refusal. */
export function playWitness(puzzle: Puzzle, layouts: readonly WaveLayout[] = puzzle.witness): GameState {
  let state = startGame(puzzle);
  for (const layout of layouts) {
    for (const command of witnessCommands(state, layout)) {
      const r = step(state, command);
      if (r.error !== null) throw new Error(`wave ${layout.wave}, ${command.type}: ${r.error}`);
      state = r.state;
    }
  }
  return state;
}
