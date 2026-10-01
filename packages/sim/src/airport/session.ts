import type { AirportCommand, AirportEvent, AirportSaveFile, AirportState } from '@nations/contracts';
import { airportCommandProblem } from './commands.ts';
import { createAirportSave, loadAirportSave } from './save.ts';
import { advanceMany, step } from './step.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

export type AirportSubmitResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * One running airport: the state, commands waiting for their tick, and the log
 * since the snapshot. No clock: the host calls `advance` (S4). Catch-up is
 * `advance(n, { events: false })`, which steps the gaps between queued commands
 * with `advanceMany` (P4).
 */
export class AirportSession {
  private snapshot: AirportState;
  private current: AirportState;
  private log: AirportCommand[];
  private queue: AirportCommand[] = [];

  constructor(state: AirportState, log: readonly AirportCommand[] = [], snapshot: AirportState = state) {
    this.snapshot = snapshot;
    this.current = state;
    this.log = [...log];
  }

  get state(): AirportState {
    return this.current;
  }

  /** Queue a command for its tick. The step decides whether it succeeds. */
  submit(command: AirportCommand): AirportSubmitResult {
    const problem = airportCommandProblem(command);
    if (problem !== null) return { ok: false, reason: problem };
    if (command.tick < this.current.tick) return { ok: false, reason: 'tick already stepped' };
    if (this.queue.filter((c) => c.tick === command.tick).length >= T.maxCommandsPerTick.value) return { ok: false, reason: 'too many commands this tick' };
    this.queue.push(command);
    return { ok: true };
  }

  /** Step `ticks` ticks. With `events: false`, quiet ticks are batched and no events are returned. */
  advance(ticks = 1, options: { events?: boolean } = {}): AirportEvent[] {
    const wantEvents = options.events !== false;
    const end = this.current.tick + ticks;
    const events: AirportEvent[] = [];
    while (this.current.tick < end) {
      const tick = this.current.tick;
      const commands = this.take(tick);
      if (commands.length === 0 && !wantEvents) {
        const next = this.queue.reduce((min, c) => Math.min(min, c.tick), end);
        this.current = advanceMany(this.current, Math.max(1, Math.min(end, next) - tick));
        continue;
      }
      this.log.push(...commands);
      const result = step(this.current, commands);
      this.current = result.state;
      if (wantEvents) events.push(...result.events);
    }
    return events;
  }

  /** A save. `compact` makes the current state the snapshot and drops the replay history. */
  save(options: { compact?: boolean } = {}): AirportSaveFile {
    if (options.compact === true) {
      this.snapshot = this.current;
      this.log = [];
    }
    return createAirportSave(this.snapshot, [...this.log, ...this.queue], this.current);
  }

  static load(raw: unknown): AirportSession {
    const loaded = loadAirportSave(raw);
    const session = new AirportSession(loaded.state, loaded.replayed, loaded.snapshot);
    for (const command of loaded.pending) {
      const result = session.submit(command);
      if (!result.ok) throw new Error(`Saved command could not be queued again: ${result.reason}`);
    }
    return session;
  }

  private take(tick: number): AirportCommand[] {
    const taken = this.queue.filter((c) => c.tick === tick);
    if (taken.length > 0) this.queue = this.queue.filter((c) => c.tick !== tick);
    return taken;
  }
}
