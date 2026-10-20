import type { GameCommand, GameSaveFile, GameSpec, GameState, GameView, Mode, Phase, Round, WaveResult } from '@snacks/contracts';
import { GameSession, SNACK_TUNABLES, gameView, hashState, loadSave, newGame } from '@snacks/sim';

/** What the engine hands the host after every change; the host adds whose game it is. */
export interface EngineUpdate {
  readonly view: GameView;
  /** Fingerprint of the whole game: proves a save resumes the same game. */
  readonly fingerprint: string;
  /** Why the last command was refused, in words a player can read; null if it was applied. */
  readonly error: string | null;
  /** What the wave just played did, when the last command was Go. */
  readonly wave: WaveResult | null;
  /** How far a Nurse heals (the `nurseRange` tunable), so the setup screen can show it without a number of its own. */
  readonly healRange: number;
  /** Seconds a Kindy child may go without a tap before a hint shows itself (the `kindyHintIdle` tunable). */
  readonly hintIdle: number;
}

/** What a game came to, for the profile's record of finished days (RULES 9). */
export interface GameSummary {
  readonly mode: Mode;
  readonly round: Round;
  /** The puzzle's day: the day the run started. */
  readonly day: number;
  readonly phase: Phase;
  readonly fed: number;
  readonly hungry: number;
  /** Failed waves tried again (D10). */
  readonly retries: number;
  /** Hints used in the whole game (RULES 8b). */
  readonly hints: number;
}

function summarize(state: GameState, log: readonly GameCommand[]): GameSummary {
  const { mode, round, day } = state.puzzle;
  return { mode, round, day, phase: state.phase, fed: state.fed, hungry: state.hungry, retries: log.filter((c) => c.type === 'retry').length, hints: state.hints.reduce((a, b) => a + b, 0) };
}

/**
 * One game, owned by the Web Worker: the sim session. Turn-based, so there is
 * no clock (K3): every call answers with the new View. Generating a day's
 * puzzle takes tens of milliseconds, which is why this runs off the interface
 * thread. Free of Worker and Comlink code so it is tested in Node.
 */
export class GameEngine {
  private session: GameSession | null = null;

  /** A new game: today's daily or bonus, or a practice board from a seed. */
  newGame(spec: GameSpec): EngineUpdate {
    this.session = new GameSession(newGame(spec));
    return this.update(null, null);
  }

  submit(command: GameCommand): EngineUpdate {
    const result = this.requireSession().submit(command);
    return this.update(result.error, result.wave);
  }

  current(): EngineUpdate | null {
    return this.session === null ? null : this.update(null, null);
  }

  /** The save: the game's first state and every command since. */
  exportGame(): GameSaveFile {
    return this.requireSession().save();
  }

  /** Resumes a save (its hash is verified). */
  importGame(save: GameSaveFile): EngineUpdate {
    this.session = GameSession.load(save);
    return this.update(null, null);
  }

  /** What the game being played came to. */
  summary(): GameSummary {
    const session = this.requireSession();
    return summarize(session.state, session.save().log);
  }

  /** What a saved game came to, without playing it: used when old saves are folded into a profile. */
  inspect(save: GameSaveFile): GameSummary {
    const loaded = loadSave(save);
    return summarize(loaded.state, loaded.log);
  }

  private update(error: string | null, wave: WaveResult | null): EngineUpdate {
    const state = this.requireSession().state;
    return { view: gameView(state), fingerprint: hashState(state), error, wave, healRange: SNACK_TUNABLES.nurseRange.value, hintIdle: SNACK_TUNABLES.kindyHintIdle.value };
  }

  private requireSession(): GameSession {
    if (this.session === null) throw new Error('No game is running');
    return this.session;
  }
}
