import type { Command, Event, HostUpdate, NationId, NationView, Pace } from '@nations/contracts';
import { greedyDecide } from '@nations/ai';
import {
  Session,
  TUNABLES,
  createWorld,
  hashState,
  mix32,
  nationId,
  rosterFromWorldData,
  scoreboard,
  viewFor,
  type RosterEntry,
  type SimSaveFile,
} from '@nations/sim';
import world2030 from '../../../../data/world-2030.json' with { type: 'json' };
import { PACE_INTERVAL_MS, SUPPORTED_PACES } from './pace.ts';

/** The player's View: the contracts NationView. */
export type PlayerView = NationView;

/**
 * World-level standing the host derives for the interface. Public by nature
 * (the collective multiplier is the same for every nation); it rides beside the
 * View until the sim puts it in the View itself (docs/GAPS.md, prompt 07).
 */
export interface Standing {
  /** Collective multiplier x 10,000 (RULES 5.2). */
  readonly multiplierBp: number;
  /** Months in a full game. */
  readonly gameLength: number;
  /** True once the last month has been played; the clock stops. */
  readonly over: boolean;
  /** Fingerprint of the whole game, to prove a save or a file resumes the same game. */
  readonly fingerprint: string;
}

/** What the host pushes to the interface: the contracts update plus the pace. */
export interface GameUpdate extends HostUpdate {
  readonly view: PlayerView;
  readonly pace: Pace;
  readonly standing: Standing;
}

/** Everything needed to resume a game: the sim save plus who plays whom. */
export interface SavedGame {
  readonly humanId: string;
  readonly aiSeed: number;
  readonly save: SimSaveFile;
}

export interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultTimers: Timers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** The full roster from data/world-2030.json: 17 playable nations, then 6 background regions. */
export function fullRoster(): RosterEntry[] {
  return rosterFromWorldData(world2030);
}

/** The 17 playable nations. */
export function playableRoster(): RosterEntry[] {
  return fullRoster().filter((entry) => entry.endowment?.kind === 'playable');
}

const GAME_LENGTH = TUNABLES.gameLengthTicks.value;

/**
 * One running game, owned by the Web Worker. Holds the sim Session, runs the
 * greedy trader for every nation the player does not control (including the
 * player's own nation while it is in the caretaker's hands), and owns the
 * clock: nothing else can advance the tick. The clock stops at the end of the
 * game (gameLengthTicks).
 *
 * Deliberately free of Worker and Comlink code so it can be tested in Node and
 * later moved behind a server without change.
 */
export class GameEngine {
  private session: Session | null = null;
  private humanId: NationId | null = null;
  private aiSeed = 0;
  private pace: Pace = 'paused';
  private timer: unknown = null;
  private listener: ((update: GameUpdate) => void) | null = null;

  constructor(private readonly timers: Timers = defaultTimers) {}

  newGame(humanId: string, seed: number): GameUpdate {
    if (!playableRoster().some((entry) => entry.id === humanId)) throw new Error(`"${humanId}" is not a playable nation`);
    const state = createWorld({ seed, roster: fullRoster(), controllers: { [humanId]: 'human' } });
    this.start(new Session(state), nationId(humanId), mix32(seed ^ 0x2545f491));
    return this.update([]);
  }

  /** The player's intent. Only commands for the player's own nation are accepted. */
  submit(command: Command): void {
    const { session, humanId } = this.requireGame();
    if (command.nationId !== humanId) throw new Error('You can only act for your own nation');
    const result = session.submit(command);
    if (!result.ok) throw new Error(result.reason);
  }

  setPace(pace: Pace): GameUpdate {
    if (!SUPPORTED_PACES.includes(pace)) throw new Error(`Pace "${pace}" is not available yet`);
    const { session } = this.requireGame();
    this.stopTimer();
    const next: Pace = session.state.tick >= GAME_LENGTH ? 'paused' : pace;
    this.pace = next;
    if (next === 'x1' || next === 'x4') {
      this.timer = this.timers.setInterval(() => this.tickOnce(), PACE_INTERVAL_MS[next]);
    }
    return this.emit([]);
  }

  subscribe(listener: (update: GameUpdate) => void): void {
    this.listener = listener;
  }

  /** Step `ticks` ticks now (never past the end of the game), with the AI acting before each one. Also catch-up. */
  advance(ticks: number): GameUpdate {
    const { session } = this.requireGame();
    const events: Event[] = [];
    for (let i = 0; i < ticks && session.state.tick < GAME_LENGTH; i++) events.push(...this.stepWithAi());
    return this.emit(events);
  }

  current(): GameUpdate | null {
    return this.session === null ? null : this.update([]);
  }

  /** A compact save: the current state becomes the snapshot. */
  exportGame(): SavedGame {
    const { session, humanId } = this.requireGame();
    return { humanId, aiSeed: this.aiSeed, save: session.save({ compact: true }) };
  }

  /** Resume a save, paused. Session.load verifies the state hash. */
  importGame(saved: SavedGame): GameUpdate {
    const session = Session.load(saved.save);
    const humanId = nationId(saved.humanId);
    if (session.state.controllers[humanId] === undefined) throw new Error('Save does not contain its player nation');
    this.start(session, humanId, saved.aiSeed);
    return this.update([]);
  }

  /**
   * Gate 0 speed check on the device itself: `ticks` catch-up ticks of a fresh
   * game with the AI everywhere, on a throwaway session. Returns milliseconds.
   */
  benchmark(ticks: number, now: () => number = () => performance.now()): number {
    const state = createWorld({ seed: 7, roster: fullRoster() });
    const session = new Session(state);
    const started = now();
    for (let i = 0; i < ticks; i++) {
      for (const id of session.state.nationOrder) {
        for (const command of greedyDecide(viewFor(session.state, id), 7).commands) session.submit(command);
      }
      session.advance(1);
    }
    return now() - started;
  }

  private start(session: Session, humanId: NationId, aiSeed: number): void {
    this.stopTimer();
    this.pace = 'paused';
    this.session = session;
    this.humanId = humanId;
    this.aiSeed = aiSeed;
  }

  private tickOnce(): void {
    const { session } = this.requireGame();
    const events = session.state.tick < GAME_LENGTH ? this.stepWithAi() : [];
    if (session.state.tick >= GAME_LENGTH) {
      this.stopTimer();
      this.pace = 'paused';
    }
    this.emit(events);
  }

  private stepWithAi(): Event[] {
    const { session } = this.requireGame();
    const state = session.state;
    for (const id of state.nationOrder) {
      if (state.controllers[id] === 'human') continue;
      // AI nations use the same command API as the player (Gate 0 criterion 3).
      for (const command of greedyDecide(viewFor(state, id), this.aiSeed).commands) session.submit(command);
    }
    return session.advance(1);
  }

  private emit(events: readonly Event[]): GameUpdate {
    const update = this.update(events);
    this.listener?.(update);
    return update;
  }

  private update(events: readonly Event[]): GameUpdate {
    const { session, humanId } = this.requireGame();
    const visible = events.filter((event) => event.audience.length === 0 || event.audience.includes(humanId));
    const state = session.state;
    const standing: Standing = {
      multiplierBp: scoreboard(state).multiplierBp,
      gameLength: GAME_LENGTH,
      over: state.tick >= GAME_LENGTH,
      fingerprint: hashState(state),
    };
    return { view: viewFor(state, humanId), events: visible, pace: this.pace, standing };
  }

  private stopTimer(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private requireGame(): { session: Session; humanId: NationId } {
    if (this.session === null || this.humanId === null) throw new Error('No game is running');
    return { session: this.session, humanId: this.humanId };
  }
}
