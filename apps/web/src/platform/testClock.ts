import type { Timers } from './engine.ts';

/** A hand-wound clock for platform tests: time moves only when the test says so. */
export class FakeClock implements Timers {
  time = 1_000_000;
  private handlers = new Map<number, () => void>();
  private next = 1;

  setInterval(handler: () => void): unknown {
    const id = this.next++;
    this.handlers.set(id, handler);
    return id;
  }

  clearInterval(handle: unknown): void {
    this.handlers.delete(handle as number);
  }

  now(): number {
    return this.time;
  }

  /** Moves the clock and fires every running interval once, as a throttled timer would. */
  advance(ms: number): void {
    this.time += ms;
    for (const handler of [...this.handlers.values()]) handler();
  }

  get running(): number {
    return this.handlers.size;
  }
}
