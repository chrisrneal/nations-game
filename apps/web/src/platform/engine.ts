import type { AirportEvent, AirportIntent, AirportSaveFile, AirportView } from '@nations/contracts';
import { AIRPORT_TUNABLES, AirportSession, airportView, createAirport, hashState } from '@nations/sim/airport';
import { LIVE_EVENT_TICKS, ticksDue } from './clock.ts';

/** What the host pushes to the interface on every tick it steps. */
export interface AirportUpdate {
  readonly view: AirportView;
  /** Events from the ticks just stepped live (none from quiet catch-up). */
  readonly events: readonly AirportEvent[];
  /** Fingerprint of the whole airport: proves a save or a file resumes the same game. */
  readonly fingerprint: string;
}

/** Everything needed to resume: the sim save, and the wall-clock time its tick stands for. */
export interface SavedAirport {
  readonly save: AirportSaveFile;
  /** Wall-clock ms at which the saved tick happened; the clock owes everything since. */
  readonly anchor: number;
}

export interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Wall-clock milliseconds (Date.now in the app). Only the host reads it; the sim never does. */
  now(): number;
}

const defaultTimers: Timers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

/**
 * One running airport, owned by the Web Worker. Holds the sim session and owns
 * the clock (S4): every `tickMs` it steps whatever ticks the wall clock owes,
 * so a throttled timer or a sleeping phone catches up exactly (P4). Free of
 * Worker and Comlink code so it is tested in Node.
 */
export class AirportEngine {
  private session: AirportSession | null = null;
  private anchor = 0;
  private timer: unknown = null;
  private listener: ((update: AirportUpdate) => void) | null = null;

  constructor(private readonly timers: Timers = defaultTimers) {}

  /** A new airport at the first city, running from now. */
  newGame(seed: number): AirportUpdate {
    this.session = new AirportSession(createAirport({ seed }));
    this.anchor = this.timers.now();
    this.startClock();
    return this.emit([]);
  }

  subscribe(listener: (update: AirportUpdate) => void): void {
    this.listener = listener;
  }

  /** The player's intent, stamped for the next tick to be stepped. */
  submit(intent: AirportIntent): void {
    const session = this.requireSession();
    const result = session.submit({ ...intent, tick: session.state.tick } as Parameters<AirportSession['submit']>[0]);
    if (!result.ok) throw new Error(result.reason);
  }

  current(): AirportUpdate | null {
    return this.session === null ? null : this.update([]);
  }

  /** Steps every tick the wall clock owes and pushes an update if any were due. */
  pump(): AirportUpdate | null {
    const session = this.requireSession();
    const due = ticksDue(this.anchor, this.timers.now(), AIRPORT_TUNABLES.tickMs.value);
    if (due.ticks === 0) return null;
    this.anchor = due.anchor;
    const quiet = Math.max(0, due.ticks - LIVE_EVENT_TICKS);
    if (quiet > 0) session.advance(quiet, { events: false });
    const events = session.advance(due.ticks - quiet);
    return this.emit(events);
  }

  /** The app was hidden: stop the timer (the wall clock keeps the debt). */
  pause(): void {
    this.stopClock();
  }

  /** The app is visible again: catch up and restart the timer. */
  resume(): AirportUpdate | null {
    if (this.session === null) return null;
    const update = this.pump() ?? this.emit([]);
    this.startClock();
    return update;
  }

  /** A compact save: the current state becomes the snapshot. */
  exportGame(): SavedAirport {
    return { save: this.requireSession().save({ compact: true }), anchor: this.anchor };
  }

  /** Resume a save (its hash is verified), catching up to now by the wall clock. */
  importGame(saved: SavedAirport): AirportUpdate {
    this.session = AirportSession.load(saved.save);
    this.anchor = saved.anchor;
    this.startClock();
    return this.pump() ?? this.emit([]);
  }

  private startClock(): void {
    this.stopClock();
    this.timer = this.timers.setInterval(() => this.pump(), AIRPORT_TUNABLES.tickMs.value);
  }

  private stopClock(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private emit(events: readonly AirportEvent[]): AirportUpdate {
    const update = this.update(events);
    this.listener?.(update);
    return update;
  }

  private update(events: readonly AirportEvent[]): AirportUpdate {
    const state = this.requireSession().state;
    return { view: airportView(state), events, fingerprint: hashState(state) };
  }

  private requireSession(): AirportSession {
    if (this.session === null) throw new Error('No airport is running');
    return this.session;
  }
}
