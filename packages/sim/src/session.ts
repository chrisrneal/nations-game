import type { GameCommand, GameSaveFile, GameSpec, GameState } from '@snacks/contracts';
import { startGame, step, type StepResult } from './game.ts';
import { generatePuzzle } from './generate.ts';
import { createSave, loadSave } from './save.ts';

/** A new game from a spec: the day's (or practice seed's) puzzle, ready for wave 1. */
export function newGame(spec: GameSpec): GameState {
  return startGame(generatePuzzle(spec.mode, spec.round, spec.day, spec.seed));
}

/**
 * One game being played: the state, the snapshot it started from and the
 * commands since (S9). Refused commands are not logged.
 */
export class GameSession {
  private snapshot: GameState;
  private current: GameState;
  private log: GameCommand[];

  constructor(state: GameState, log: readonly GameCommand[] = [], snapshot: GameState = state) {
    this.snapshot = snapshot;
    this.current = state;
    this.log = [...log];
  }

  get state(): GameState {
    return this.current;
  }

  submit(command: GameCommand): StepResult {
    const result = step(this.current, command);
    if (result.error === null) {
      this.current = result.state;
      this.log.push(command);
    }
    return result;
  }

  /** A save. `compact` makes the current state the snapshot and drops the replay history. */
  save(options: { compact?: boolean } = {}): GameSaveFile {
    if (options.compact === true) {
      this.snapshot = this.current;
      this.log = [];
    }
    return createSave(this.snapshot, this.log, this.current);
  }

  static load(raw: unknown): GameSession {
    const loaded = loadSave(raw);
    return new GameSession(loaded.state, loaded.log, loaded.snapshot);
  }
}
