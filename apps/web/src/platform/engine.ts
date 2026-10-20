import type { GameCommand, GameSaveFile, GameSpec, GameView, WaveResult } from '@snacks/contracts';
import { GameSession, gameView, hashState, newGame } from '@snacks/sim';

/** What the host hands the interface after every change. */
export interface GameUpdate {
  readonly view: GameView;
  /** Fingerprint of the whole game: proves a save resumes the same game. */
  readonly fingerprint: string;
  /** Why the last command was refused, in words a player can read; null if it was applied. */
  readonly error: string | null;
  /** What the wave just played did, when the last command was Go. */
  readonly wave: WaveResult | null;
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
  newGame(spec: GameSpec): GameUpdate {
    this.session = new GameSession(newGame(spec));
    return this.update(null, null);
  }

  submit(command: GameCommand): GameUpdate {
    const result = this.requireSession().submit(command);
    return this.update(result.error, result.wave);
  }

  current(): GameUpdate | null {
    return this.session === null ? null : this.update(null, null);
  }

  /** The save: the game's first state and every command since. */
  exportGame(): GameSaveFile {
    return this.requireSession().save();
  }

  /** Resumes a save (its hash is verified). */
  importGame(save: GameSaveFile): GameUpdate {
    this.session = GameSession.load(save);
    return this.update(null, null);
  }

  private update(error: string | null, wave: WaveResult | null): GameUpdate {
    const state = this.requireSession().state;
    return { view: gameView(state), fingerprint: hashState(state), error, wave };
  }

  private requireSession(): GameSession {
    if (this.session === null) throw new Error('No game is running');
    return this.session;
  }
}
