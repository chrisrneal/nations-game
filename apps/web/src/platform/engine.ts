import type { WarehouseEvent, WarehouseIntent, WarehouseSaveFile, WarehouseState, WarehouseView, Bottleneck, Stats } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES, WarehouseSession, UPGRADE_TEXT, warehouseView, createWarehouse, estimate, hashState, offlineCapTicks, offlineMinutesAt } from '@warehouse/sim';
import { LIVE_EVENT_TICKS, RECAP_MIN_AWAY_MS, capped, ticksDue } from './clock.ts';

/**
 * What happened while the player was away (RULES 9): numbers for the
 * interface's three-line recap. Derived by the host from the stats before and
 * after the catch-up; never saved.
 */
export interface AwayRecap {
  /** Wall-clock time away. */
  readonly awayMs: number;
  /** How much of it the warehouse ran: less than `awayMs` when the offline cap cut it short. */
  readonly ranMs: number;
  readonly capMinutes: number;
  /** The testing time skip ran it, not an absence. */
  readonly skipped: boolean;
  readonly earned: number;
  readonly shipments: number;
  readonly fullShipments: number;
  /** Whole passengers carried and turned away by a full sales. */
  readonly orders: number;
  readonly missed: number;
  readonly expresses: number;
  readonly bottleneck: Bottleneck;
  /** Name of the upgrade that fixes the bottleneck. */
  readonly fixName: string;
}

/** What the host pushes to the interface on every tick it steps. */
export interface WarehouseUpdate {
  readonly view: WarehouseView;
  /** Events from the ticks just stepped live (none from quiet catch-up). */
  readonly events: readonly WarehouseEvent[];
  /** Fingerprint of the whole warehouse: proves a save or a file resumes the same game. */
  readonly fingerprint: string;
  /** The latest away recap the player has not dismissed. */
  readonly recap: AwayRecap | null;
}

function diff(after: Stats, before: Stats): Stats {
  return {
    earned: after.earned - before.earned,
    shipments: after.shipments - before.shipments,
    fullShipments: after.fullShipments - before.fullShipments,
    orders: after.orders - before.orders,
    missed: after.missed - before.missed,
    expresses: after.expresses - before.expresses,
    taps: after.taps - before.taps,
  };
}

/** The recap for a catch-up from `before` to `after`. Lifetime stats, so a sale in between still counts. */
export function awayRecap(before: WarehouseState, after: WarehouseState, awayMs: number, ranMs: number, skipped = false): AwayRecap {
  const d = diff(after.life, before.life);
  const { bottleneck } = estimate(after);
  const fix = bottleneck.fix[0];
  return {
    awayMs,
    ranMs,
    capMinutes: offlineMinutesAt(after.levels.night),
    skipped,
    earned: d.earned,
    shipments: d.shipments,
    fullShipments: d.fullShipments,
    orders: d.orders,
    missed: Math.floor(d.missed / 1000),
    expresses: d.expresses,
    bottleneck,
    fixName: fix === undefined ? '' : UPGRADE_TEXT[fix].name,
  };
}

/** Everything needed to resume: the sim save, and the wall-clock time its tick stands for. */
export interface SavedWarehouse {
  readonly save: WarehouseSaveFile;
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
 * One running warehouse, owned by the Web Worker. Holds the sim session and owns
 * the clock (S4): every `tickMs` it steps whatever ticks the wall clock owes,
 * so a throttled timer or a sleeping phone catches up exactly (P4). Free of
 * Worker and Comlink code so it is tested in Node.
 */
export class WarehouseEngine {
  private session: WarehouseSession | null = null;
  private anchor = 0;
  private timer: unknown = null;
  private listener: ((update: WarehouseUpdate) => void) | null = null;
  private recap: AwayRecap | null = null;

  constructor(private readonly timers: Timers = defaultTimers) {}

  /** A new warehouse at the first site, running from now. */
  newGame(seed: number): WarehouseUpdate {
    this.session = new WarehouseSession(createWarehouse({ seed }));
    this.recap = null;
    this.anchor = this.timers.now();
    this.startClock();
    return this.emit([]);
  }

  subscribe(listener: (update: WarehouseUpdate) => void): void {
    this.listener = listener;
  }

  /** The player's intent, stamped for the next tick to be stepped. */
  submit(intent: WarehouseIntent): void {
    const session = this.requireSession();
    const result = session.submit({ ...intent, tick: session.state.tick } as Parameters<WarehouseSession['submit']>[0]);
    if (!result.ok) throw new Error(result.reason);
  }

  current(): WarehouseUpdate | null {
    return this.session === null ? null : this.update([]);
  }

  /**
   * Steps every tick the wall clock owes and pushes an update if any were due.
   * A gap of a minute or more is an absence (the app was closed, hidden or the
   * phone slept): it is capped by the offline cap (RULES 9), caught up quietly,
   * and summed up in an away recap.
   */
  pump(): WarehouseUpdate | null {
    const session = this.requireSession();
    const tickMs = WAREHOUSE_TUNABLES.tickMs.value;
    const now = this.timers.now();
    const due = ticksDue(this.anchor, now, tickMs);
    if (due.ticks === 0) return null;
    if (due.ticks * tickMs >= RECAP_MIN_AWAY_MS) {
      const before = session.state;
      const awayMs = now - this.anchor;
      const { run, lost } = capped(due.ticks, offlineCapTicks(before));
      session.advance(run, { events: false });
      // Time beyond the cap is lost: the warehouse closed for the night.
      this.anchor = lost > 0 ? now : due.anchor;
      this.recap = awayRecap(before, session.state, awayMs, run * tickMs);
      return this.emit([]);
    }
    this.anchor = due.anchor;
    const quiet = Math.max(0, due.ticks - LIVE_EVENT_TICKS);
    if (quiet > 0) session.advance(quiet, { events: false });
    const events = session.advance(due.ticks - quiet);
    return this.emit(events);
  }

  /**
   * A testing cheat: run the warehouse `minutes` ahead at once, exactly as a
   * catch-up after an absence runs it (P4), but with no offline cap, and sum
   * it up in the away recap. The wall clock does not move, so nothing is owed
   * for the skipped time afterwards.
   */
  skip(minutes: number): WarehouseUpdate {
    const session = this.requireSession();
    const tickMs = WAREHOUSE_TUNABLES.tickMs.value;
    const ticks = Math.max(0, Math.floor((minutes * 60_000) / tickMs));
    const before = session.state;
    this.pump();
    session.advance(ticks, { events: false });
    this.recap = awayRecap(before, session.state, ticks * tickMs, ticks * tickMs, true);
    return this.emit([]);
  }

  /** The player has read the away recap. */
  dismissRecap(): WarehouseUpdate {
    this.recap = null;
    return this.emit([]);
  }

  /** The app was hidden: stop the timer (the wall clock keeps the debt). */
  pause(): void {
    this.stopClock();
  }

  /** The app is visible again: catch up and restart the timer. */
  resume(): WarehouseUpdate | null {
    if (this.session === null) return null;
    const update = this.pump() ?? this.emit([]);
    this.startClock();
    return update;
  }

  /** A compact save: the current state becomes the snapshot. */
  exportGame(): SavedWarehouse {
    return { save: this.requireSession().save({ compact: true }), anchor: this.anchor };
  }

  /** Resume a save (its hash is verified), catching up to now by the wall clock. */
  importGame(saved: SavedWarehouse): WarehouseUpdate {
    this.session = WarehouseSession.load(saved.save);
    this.anchor = saved.anchor;
    this.recap = null;
    this.startClock();
    return this.pump() ?? this.emit([]);
  }

  private startClock(): void {
    this.stopClock();
    this.timer = this.timers.setInterval(() => this.pump(), WAREHOUSE_TUNABLES.tickMs.value);
  }

  private stopClock(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private emit(events: readonly WarehouseEvent[]): WarehouseUpdate {
    const update = this.update(events);
    this.listener?.(update);
    return update;
  }

  private update(events: readonly WarehouseEvent[]): WarehouseUpdate {
    const state = this.requireSession().state;
    return { view: warehouseView(state), events, fingerprint: hashState(state), recap: this.recap };
  }

  private requireSession(): WarehouseSession {
    if (this.session === null) throw new Error('No warehouse is running');
    return this.session;
  }
}
