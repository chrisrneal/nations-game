import type { Command, Event } from '@nations/contracts';
import { CommandQueue, type SubmitResult } from './queue.ts';
import { createSave, loadSave, type SimSaveFile } from './save.ts';
import { step } from './step.ts';
import type { WorldState } from './world.ts';

/**
 * One running game: current state, the queue of commands waiting for a tick,
 * and the log of every command stepped since the snapshot.
 *
 * Pure bookkeeping, no clock: the host (a Web Worker today, a server later)
 * decides when `advance` is called. That call is the only thing that moves the
 * tick (seam 4). Catch-up after an absence is `advance(n)`.
 */
export class Session {
  private snapshot: WorldState;
  private current: WorldState;
  private log: Command[];
  private readonly queue = new CommandQueue();

  constructor(state: WorldState, log: readonly Command[] = [], snapshot: WorldState = state) {
    this.snapshot = snapshot;
    this.current = state;
    this.log = [...log];
  }

  get state(): WorldState {
    return this.current;
  }

  /** Queue a command for its tick. The step validates again when it runs. */
  submit(command: Command): SubmitResult {
    return this.queue.submit(this.current, command);
  }

  /** Step `ticks` times, returning every event in order. */
  advance(ticks = 1): Event[] {
    const events: Event[] = [];
    for (let i = 0; i < ticks; i++) {
      const commands = this.queue.take(this.current.tick);
      this.log.push(...commands);
      const result = step(this.current, commands);
      this.current = result.state;
      events.push(...result.events);
    }
    return events;
  }

  /**
   * A save file. `compact` makes the current state the snapshot, dropping the
   * replay history; without it the save can replay the game from its start.
   */
  save(options: { compact?: boolean } = {}): SimSaveFile {
    if (options.compact === true) {
      this.snapshot = this.current;
      this.log = [];
    }
    return createSave(this.snapshot, [...this.log, ...this.queue.pending()], this.current);
  }

  /** Rebuild a session from a save (after migration and hash verification). */
  static load(raw: unknown): Session {
    const loaded = loadSave(raw);
    const session = new Session(loaded.state, loaded.replayed, loaded.snapshot);
    for (const command of loaded.pending) {
      const result = session.submit(command);
      if (!result.ok) throw new Error(`Saved command could not be re-queued: ${result.reason}`);
    }
    return session;
  }
}
