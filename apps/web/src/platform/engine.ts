import type { Command, Event, HostUpdate, NationId, NationView, Pace } from '@nations/contracts';
import { AiDirector, endowmentsOf, type DirectorSnapshot, type ExplanationEvent } from '@nations/ai';
import {
  Session,
  TUNABLES,
  createWorld,
  hashState,
  mix32,
  nationId,
  rosterFromWorldData,
  viewFor,
  type RosterEntry,
  type SimSaveFile,
} from '@nations/sim';
import world2030 from '../../../../data/world-2030.json' with { type: 'json' };
import { Journal, type JournalSnapshot } from './journal.ts';
import { LIVE_POLL_MS, PACE_INTERVAL_MS, SUPPORTED_PACES, liveTicksDue } from './pace.ts';
import { EMPTY_BOOK, guess, predictionsView, recordAnswers, resolved, type PredictionBook, type PredictionsView, type ResolvedPrediction } from './predictions.ts';
import { awayRecap, type AwayRecap } from './recap.ts';

/** The player's View: the contracts NationView. */
export type PlayerView = NationView;

/**
 * Game-level facts the host adds for the interface. Scores and the collective
 * multiplier are in the View itself (`view.scores`, prompt 12).
 */
export interface Standing {
  /** Months in a full game. */
  readonly gameLength: number;
  /** True once the last month has been played; the clock stops. */
  readonly over: boolean;
  /** Fingerprint of the whole game, to prove a save or a file resumes the same game. */
  readonly fingerprint: string;
}

/** The live clock, while the game runs live: when the next month is due, in wall-clock ms. */
export interface LiveClock {
  readonly nextTickAt: number;
  readonly intervalMs: number;
}

/** What the host pushes to the interface: the contracts update plus the pace and host-side derived data. */
export interface GameUpdate extends HostUpdate {
  readonly view: PlayerView;
  readonly pace: Pace;
  readonly standing: Standing;
  /** Explanations, recent trades and trust causes the player has seen (derived, never State). */
  readonly journal: JournalSnapshot;
  /** The latest away recap the player has not dismissed, if any. */
  readonly recap: AwayRecap | null;
  readonly predictions: PredictionsView;
  readonly live: LiveClock | null;
}

/** Everything needed to resume a game: the sim save plus who plays whom, and host-side memory. */
export interface SavedGame {
  readonly humanId: string;
  readonly aiSeed: number;
  readonly save: SimSaveFile;
  /** AI memory (grievances, retaliation, goals). Missing in saves before prompt 11: the AI then starts afresh. */
  readonly ai?: DirectorSnapshot;
  readonly journal?: JournalSnapshot;
  /** Prediction mode, and every guess with the real answer. */
  readonly predictions?: PredictionBook;
  /** Present while the game runs on the live clock: wall-clock ms up to which live months have been counted. */
  readonly live?: { readonly anchor: number };
}

export interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Wall-clock milliseconds (Date.now in the app). Only the live clock reads it; the sim never does. */
  now?(): number;
}

const defaultTimers: Timers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
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

/** AI announcements the sim does not relay (no command carries them): retaliation, forgiveness, resumption. */
const ANNOUNCEMENTS: Readonly<Record<string, string>> = { suspend: 'suspend', forgive: 'forgive', resume: 'resume' };
/** AI crisis answers are explained to every nation (their audience is public), under the command's name. */
const CRISIS_DECISIONS: Readonly<Record<string, string>> = { pledge: 'contribute', skipPledge: 'declineAppeal' };

/**
 * Turns the AI's own explanation events into the contracts `explanation`
 * event the interface reads, for the explanations the sim does not relay:
 * announcements, and crisis answers (which the sim relays to the actor only).
 */
export function deliverable(explanations: readonly ExplanationEvent[]): Event[] {
  const out: Event[] = [];
  for (const x of explanations) {
    const p = x.payload;
    const announcement = ANNOUNCEMENTS[p.decision];
    const crisis = p.crisisId !== null && x.audience.length === 0 ? CRISIS_DECISIONS[p.decision] : undefined;
    const decision = announcement ?? crisis;
    if (decision === undefined) continue;
    out.push({
      tick: x.tick,
      type: 'explanation',
      payload: { nationId: p.nationId, decision, subject: p.crisisId ?? p.offerId, reasons: [p.text, ...p.reasons], by: 'command' },
      audience: x.audience,
    });
  }
  return out;
}

/**
 * One running game, owned by the Web Worker. Holds the sim Session, runs the
 * layered AI (`AiDirector`, docs/AI_DESIGN.md) for every nation the player
 * does not control (including the player's own nation while it is in the
 * caretaker's hands), and owns the clock: nothing else can advance the tick.
 * The clock stops at the end of the game (gameLengthTicks).
 *
 * The live pace advances by wall time: one month per 30 minutes, counted from
 * an anchor that is saved with the game, so a phone that was closed for a day
 * steps the 48 months it missed when it reopens and shows an away recap.
 *
 * Deliberately free of Worker and Comlink code so it can be tested in Node and
 * later moved behind a server without change.
 */
export class GameEngine {
  private session: Session | null = null;
  private humanId: NationId | null = null;
  private aiSeed = 0;
  private director: AiDirector | null = null;
  private journal: Journal | null = null;
  private book: PredictionBook = EMPTY_BOOK;
  private recap: AwayRecap | null = null;
  private away: { view: NationView; events: Event[] } | null = null;
  private pace: Pace = 'paused';
  private liveAnchor: number | null = null;
  private timer: unknown = null;
  private listener: ((update: GameUpdate) => void) | null = null;

  constructor(private readonly timers: Timers = defaultTimers) {}

  newGame(humanId: string, seed: number): GameUpdate {
    if (!playableRoster().some((entry) => entry.id === humanId)) throw new Error(`"${humanId}" is not a playable nation`);
    // The phone player starts with "keep us supplied" on (RULES 3.4): routine imports are a standing policy, not a monthly card.
    const state = createWorld({ seed, roster: fullRoster(), controllers: { [humanId]: 'human' }, policies: { [humanId]: { autoImport: true } } });
    const aiSeed = mix32(seed ^ 0x2545f491);
    this.start(new Session(state), nationId(humanId), aiSeed, null, undefined, { ...EMPTY_BOOK, mode: this.book.mode });
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
    this.liveAnchor = next === 'live' ? this.now() : null;
    this.startTimer();
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
    if (session.state.tick >= GAME_LENGTH) this.stopClock();
    return this.emit(events);
  }

  current(): GameUpdate | null {
    return this.session === null ? null : this.update([]);
  }

  /** The player left (the app was hidden or closed): remember what they last saw, for the recap. */
  markAway(): void {
    if (this.session === null || this.away !== null) return;
    this.away = { view: this.playerView(), events: [] };
  }

  /**
   * The player is back: catch up a live game by wall time, then write the away
   * recap if any month passed while they were gone.
   */
  markBack(): GameUpdate | null {
    if (this.session === null) return null;
    const started = this.now();
    const caught = this.catchUpLive();
    const away = this.away;
    this.away = null;
    if (away !== null && this.session.state.tick > away.view.tick) {
      // away.events holds only what the player may see, the caught-up months included (stepWithAi adds them).
      this.recap = awayRecap(away.view, this.playerView(), away.events, this.now() - started);
    }
    return this.emit(caught);
  }

  dismissRecap(): GameUpdate {
    this.recap = null;
    return this.emit([]);
  }

  setPredictionMode(on: boolean): GameUpdate {
    this.book = { ...this.book, mode: on };
    return this.emit([]);
  }

  /** The player's guess for one prediction question; returns the real answer with the AI's reasons. */
  predict(id: number, choice: string): ResolvedPrediction {
    const { session } = this.requireGame();
    const result = guess(this.book, id, choice, session.state.tick);
    this.book = result.book;
    this.emit([]);
    return resolved(result.record);
  }

  /** A compact save: the current state becomes the snapshot, with the AI's memory and the player's journal beside it. */
  exportGame(): SavedGame {
    const { session, humanId } = this.requireGame();
    const live = this.pace === 'live' && this.liveAnchor !== null ? { live: { anchor: this.liveAnchor } } : {};
    return {
      humanId,
      aiSeed: this.aiSeed,
      save: session.save({ compact: true }),
      ai: this.requireDirector().snapshot(),
      journal: this.requireJournal().snapshot(),
      predictions: this.book,
      ...live,
    };
  }

  /**
   * Resume a save. Session.load verifies the state hash. Paused, unless
   * `resumeLive` is set and the game was running live: then the months the
   * wall clock owes are stepped now and the away recap is written.
   */
  importGame(saved: SavedGame, options: { resumeLive?: boolean } = {}): GameUpdate {
    const session = Session.load(saved.save);
    const humanId = nationId(saved.humanId);
    if (session.state.controllers[humanId] === undefined) throw new Error('Save does not contain its player nation');
    this.start(session, humanId, saved.aiSeed, saved.ai ?? null, saved.journal, saved.predictions ?? EMPTY_BOOK);
    if (options.resumeLive === true && saved.live !== undefined && session.state.tick < GAME_LENGTH) {
      this.pace = 'live';
      this.liveAnchor = saved.live.anchor;
      this.markAway();
      this.markBack();
      this.startTimer();
    }
    return this.update([]);
  }

  /**
   * Gate 0 speed check on the device itself: `ticks` catch-up ticks of a fresh
   * game with the AI everywhere, on a throwaway session. Returns milliseconds.
   */
  benchmark(ticks: number, now: () => number = () => performance.now()): number {
    const state = createWorld({ seed: 7, roster: fullRoster() });
    const session = new Session(state);
    const director = new AiDirector({ endowments: endowmentsOf(fullRoster()), seed: 7 });
    const started = now();
    for (let i = 0; i < ticks; i++) {
      const s = session.state;
      for (const command of director.decide(s.tick, (id) => s.controllers[id], (id) => viewFor(s, id)).commands) session.submit(command);
      director.observe(session.advance(1));
    }
    return now() - started;
  }

  private start(
    session: Session,
    humanId: NationId,
    aiSeed: number,
    ai: DirectorSnapshot | null,
    journal: JournalSnapshot | undefined,
    book: PredictionBook,
  ): void {
    this.stopTimer();
    this.pace = 'paused';
    this.liveAnchor = null;
    this.session = session;
    this.humanId = humanId;
    this.aiSeed = aiSeed;
    const options = { endowments: endowmentsOf(fullRoster()), seed: aiSeed };
    this.director = ai === null ? new AiDirector(options) : AiDirector.restore(options, ai);
    this.journal = Journal.restore(journal, this.playerView());
    this.book = book;
    this.recap = null;
    this.away = null;
  }

  private now(): number {
    return this.timers.now?.() ?? Date.now();
  }

  private startTimer(): void {
    if (this.pace === 'x1' || this.pace === 'x4') {
      this.timer = this.timers.setInterval(() => this.tickOnce(), PACE_INTERVAL_MS[this.pace]);
    } else if (this.pace === 'live') {
      this.timer = this.timers.setInterval(() => {
        const events = this.catchUpLive();
        if (events.length > 0 || this.session?.state.tick === GAME_LENGTH) this.emit(events);
      }, LIVE_POLL_MS);
    }
  }

  /** Steps every live month the wall clock owes. Returns the events (empty if none was due or not live). */
  private catchUpLive(): Event[] {
    const { session } = this.requireGame();
    if (this.pace !== 'live' || this.liveAnchor === null) return [];
    const due = liveTicksDue(this.liveAnchor, this.now());
    this.liveAnchor = due.anchor;
    const events: Event[] = [];
    for (let i = 0; i < due.ticks && session.state.tick < GAME_LENGTH; i++) events.push(...this.stepWithAi());
    if (session.state.tick >= GAME_LENGTH) this.stopClock();
    return events;
  }

  private tickOnce(): void {
    const { session } = this.requireGame();
    const events = session.state.tick < GAME_LENGTH ? this.stepWithAi() : [];
    if (session.state.tick >= GAME_LENGTH) this.stopClock();
    this.emit(events);
  }

  private stopClock(): void {
    this.stopTimer();
    this.pace = 'paused';
    this.liveAnchor = null;
  }

  /** One month: the AI decides from each nation's own View, the sim steps, and the player's journal and predictions take in what the player saw. */
  private stepWithAi(): Event[] {
    const { session, humanId } = this.requireGame();
    const director = this.requireDirector();
    const state = session.state;
    // AI nations use the same command API as the player (Gate 0 criterion 3).
    const out = director.decide(state.tick, (id) => state.controllers[id], (id) => viewFor(state, id));
    for (const command of out.commands) session.submit(command);
    const delivered = deliverable(out.explanations);
    const stepped = session.advance(1);
    // The AI observes sim events only; the delivered explanations are its own words.
    director.observe(stepped);
    const events = [...delivered, ...stepped];
    const visible = this.visible(events);
    const after = session.state;
    this.requireJournal().record(humanId, after.tick, visible);
    const view = this.playerView();
    this.book = recordAnswers(this.book, visible, {
      selfId: humanId,
      tick: after.tick,
      controllerOf: (id) => after.controllers[id as NationId],
      isPlayable: (id) => after.nations[id as NationId]?.public.kind === 'playable',
      trust: view.self.private.trust,
      nameOf: (id) => after.nations[id as NationId]?.name ?? id,
    });
    this.away?.events.push(...visible);
    return events;
  }

  private visible(events: readonly Event[]): Event[] {
    const { humanId } = this.requireGame();
    return events.filter((event) => event.audience.length === 0 || event.audience.includes(humanId));
  }

  private playerView(): NationView {
    const { session, humanId } = this.requireGame();
    return viewFor(session.state, humanId);
  }

  private emit(events: readonly Event[]): GameUpdate {
    const update = this.update(events);
    this.listener?.(update);
    return update;
  }

  private update(events: readonly Event[]): GameUpdate {
    const { session } = this.requireGame();
    const state = session.state;
    const standing: Standing = {
      gameLength: GAME_LENGTH,
      over: state.tick >= GAME_LENGTH,
      fingerprint: hashState(state),
    };
    const live = this.pace === 'live' && this.liveAnchor !== null ? { nextTickAt: this.liveAnchor + PACE_INTERVAL_MS.live, intervalMs: PACE_INTERVAL_MS.live } : null;
    return {
      view: this.playerView(),
      events: this.visible(events),
      pace: this.pace,
      standing,
      journal: this.requireJournal().snapshot(),
      recap: this.recap,
      predictions: predictionsView(this.book),
      live,
    };
  }

  private stopTimer(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private requireGame(): { session: Session; humanId: NationId } {
    if (this.session === null || this.humanId === null) throw new Error('No game is running');
    return { session: this.session, humanId: this.humanId };
  }

  private requireDirector(): AiDirector {
    if (this.director === null) throw new Error('No game is running');
    return this.director;
  }

  private requireJournal(): Journal {
    if (this.journal === null) throw new Error('No game is running');
    return this.journal;
  }
}
