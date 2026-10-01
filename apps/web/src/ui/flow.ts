import type { AirportEvent, AirportView, CheckpointId } from '@airport/contracts';

/**
 * The people walking through the airport (RULES 14): dots that leave the door,
 * queue at each checkpoint, wait in the lounge and walk to their gate, and
 * dots that step off an arriving plane and walk out through the arrivals
 * checkpoints. Pure bookkeeping on numbers from the View; the Concourse
 * component measures the page and draws (P7: a canvas, never React).
 *
 * The dots follow the real flows: people entering the lounge (arrivals less
 * the ones a full lounge turns away), passengers boarding each gate, and each
 * plane that lands. Checkpoints only make them queue for show; the lounge
 * crowd is the real waiting count. One dot stands for `perDot` people, chosen
 * so a few dots a second walk in however big the airport grows.
 */

export interface Span {
  readonly left: number;
  readonly right: number;
}

/** Where things are on the canvas, in CSS pixels. Measured by the component when the layout changes. */
export interface FlowGeometry {
  readonly depY: number;
  readonly arrY: number;
  /** Where departing passengers come in. */
  readonly door: number;
  /** Departure checkpoints, left to right. */
  readonly dep: readonly Span[];
  /** The lounge's seats: a bench under the departures lane, above the gates. */
  readonly lounge: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** Where arriving passengers join the arrivals lane (its right end). */
  readonly arrStart: number;
  /** Arrival checkpoints in walking order (right to left). */
  readonly arr: readonly (Span & { readonly id: CheckpointId })[];
  readonly exit: Span;
  /** The walkway down between the two columns of gates, from the lounge (`top`) down. */
  readonly pier: { readonly x: number; readonly top: number };
  /** Where each gate's passengers board and step off: the card's side on the pier, kept inside the visible gates. */
  readonly gates: readonly { readonly x: number; readonly y: number }[];
}

export type DotKind = 'dep' | 'board' | 'arr' | 'away';
export type Tint = 'out' | 'in' | 'charter' | 'away';

export interface Dot {
  readonly kind: DotKind;
  readonly tint: Tint;
  readonly gate: number;
  /** A little sideways spread so a queue looks like people, not beads. */
  readonly jy: number;
  /** False until its first frame puts it where it starts. */
  placed: boolean;
  x: number;
  y: number;
  /** Which checkpoint it is walking to (or, past the last, the end of its walk). */
  leg: number;
  /** Queued at a checkpoint: served from `start`, out again at `release` (ms). */
  start: number;
  release: number;
  alpha: number;
  age: number;
}

/** Walking speeds, px a second. */
const SPEED: Readonly<Record<DotKind, number>> = { dep: 52, board: 150, arr: 64, away: 40 };
/** Time inside a checkpoint, ms. Baggage claim is the slow one. */
const SERVICE_DEP = 150;
const SERVICE_ARR = 110;
const SERVICE_BAGGAGE = 220;
/** Space between people in a queue, px. */
const QUEUE_GAP = 5;
/** Ms between people stepping off a landed plane. */
const DEPLANE_STAGGER = 150;
/** Most people a landed plane shows. */
const DEPLANE_MAX = 10;
/** Most dots spawned on one update and alive at once: the frame budget on a slow phone. */
const SPAWN_MAX = 6;
export const DOTS_MAX = 220;
/** Updates further apart than this were caught up quietly: no one walks for them. */
const LIVE_TICKS = 8;
/** A dot lost by a layout change gives up after this long. */
const MAX_AGE = 25_000;

/** People per dot: 1, 2, 5, 10, 20, 50, ... */
export function perDotSteps(): number[] {
  const steps: number[] = [];
  for (let base = 1; base <= 1e12; base *= 10) steps.push(base, base * 2, base * 5);
  return steps;
}
const STEPS = perDotSteps();

/**
 * People per dot for a flow of `perSec` people a second, keeping `current`
 * unless the dot rate leaves 1-6 a second (so Sunvale's waves do not flicker it).
 */
export function choosePerDot(perSec: number, current: number): number {
  const rate = perSec / current;
  if (rate <= 6 && (rate >= 1 || current === 1)) return current;
  return STEPS.find((k) => perSec / k <= 4) ?? (STEPS[STEPS.length - 1] as number);
}

interface Pending {
  readonly at: number;
  readonly gate: number;
  readonly charter: boolean;
}

export class FlowModel {
  readonly dots: Dot[] = [];
  perDot = 1;
  /** The lounge: share of its room in use, 0-1 (the real waiting count). */
  lounge = 0;
  /** Recently turned people away (a full lounge). */
  turningAway = false;
  private prev: AirportView | null = null;
  private accDep = 0;
  private accAway = 0;
  private accBoard: number[] = [];
  private pending: Pending[] = [];
  private busy = new Map<string, number>();
  private seed = 1;
  private awayUntil = 0;

  /** Takes one update from the host. `now` is the animation clock in ms. */
  ingest(view: AirportView, events: readonly AirportEvent[], now: number): void {
    const prev = this.prev;
    this.prev = view;
    this.lounge = view.terminal.cap === 0 ? 0 : Math.min(1, view.terminal.waiting / view.terminal.cap);
    const perSec = (view.terminal.arrivalPerTick * 1000) / view.tickMs / 1000;
    this.perDot = choosePerDot(Math.max(perSec, 0.001), this.perDot);
    const ticks = prev === null ? 0 : view.tick - prev.tick;
    if (prev === null || view.city.index !== prev.city.index || events.some((e) => e.type === 'sold')) {
      this.reset();
      return;
    }
    if (ticks <= 0 || ticks > LIVE_TICKS) {
      this.accBoard = [];
      return;
    }
    const unit = this.perDot * 1000;

    const away = Math.max(0, view.run.missed - prev.run.missed);
    if (away > 0) this.awayUntil = now + 1500;
    this.turningAway = now < this.awayUntil;
    this.accDep += Math.max(0, view.terminal.arrivalPerTick * ticks - away);
    this.accAway += away;
    this.accDep = this.spawn(this.accDep, unit, () => this.add('dep', 'out', -1));
    this.accAway = this.spawn(this.accAway, unit, () => this.add('away', 'away', -1));

    const departed = new Map<number, number>();
    for (const e of events) {
      if (e.type === 'departed') departed.set(e.payload.gate, e.payload.pax * 1000);
      if (e.type === 'arrived') {
        const count = Math.max(1, Math.min(DEPLANE_MAX, Math.round(e.payload.seats / this.perDot)));
        for (let i = 0; i < count; i++) this.pending.push({ at: now + i * DEPLANE_STAGGER, gate: e.payload.gate, charter: e.payload.charter });
      }
    }
    view.gates.forEach((g, i) => {
      const before = prev.gates[i];
      if (before === undefined) return;
      const left = departed.get(i);
      let boarded: number;
      if (left !== undefined) boarded = Math.max(0, left - before.boarded);
      else boarded = before.plane === g.plane ? Math.max(0, g.boarded - before.boarded) : g.boarded;
      this.accBoard[i] = this.spawn((this.accBoard[i] ?? 0) + boarded, unit, () => this.add('board', 'out', i));
    });
  }

  /** Moves everyone `dt` ms on. Call once a frame with the latest geometry. */
  advance(dt: number, now: number, geo: FlowGeometry): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as Pending;
      if (p.at > now) continue;
      this.pending.splice(i, 1);
      const at = geo.gates[p.gate];
      if (at !== undefined) this.add('arr', p.charter ? 'charter' : 'in', p.gate, at);
    }
    let kept = 0;
    for (const d of this.dots) {
      d.age += dt;
      if (d.age < MAX_AGE && this.move(d, dt, now, geo)) this.dots[kept++] = d;
    }
    this.dots.length = kept;
  }

  /** Forget everyone walking (a new airport, or back from a long absence). */
  reset(): void {
    this.dots.length = 0;
    this.pending = [];
    this.accDep = 0;
    this.accAway = 0;
    this.accBoard = [];
    this.busy.clear();
  }

  /** Spawns a dot per `unit` in `acc` (at most SPAWN_MAX) and returns the remainder. */
  private spawn(acc: number, unit: number, make: () => void): number {
    let n = Math.floor(acc / unit);
    const rest = acc - n * unit;
    n = Math.min(n, SPAWN_MAX);
    for (let i = 0; i < n; i++) make();
    return rest;
  }

  private add(kind: DotKind, tint: Tint, gate: number, at?: { readonly x: number; readonly y: number }): void {
    if (this.dots.length >= DOTS_MAX) return;
    const placed = at !== undefined;
    this.dots.push({ kind, tint, gate, jy: this.jitter() * 3, placed, x: at?.x ?? 0, y: at?.y ?? 0, leg: kind === 'arr' ? -3 : 0, start: 0, release: 0, alpha: 1, age: 0 });
  }

  /** Puts a new dot where its walk starts. */
  private place(d: Dot, geo: FlowGeometry): void {
    d.placed = true;
    if (d.kind === 'board') {
      // Off the bench at the head of the pier.
      d.x = Math.min(geo.lounge.right - 4, Math.max(geo.lounge.left + 4, geo.pier.x + d.jy * 8));
      d.y = geo.lounge.bottom - 2;
    } else {
      d.x = geo.door;
      d.y = geo.depY + d.jy;
    }
  }

  /** A small deterministic spread in [-1, 1]. */
  private jitter(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return (this.seed / 0x7fffffff) * 2 - 1;
  }

  /** One dot's frame; false when its walk is over. */
  private move(d: Dot, dt: number, now: number, geo: FlowGeometry): boolean {
    if (!d.placed) this.place(d, geo);
    const step = (SPEED[d.kind] * dt) / 1000;
    switch (d.kind) {
      case 'dep': {
        const booth = geo.dep[d.leg];
        if (booth === undefined) {
          // Past the last checkpoint: down onto the lounge bench.
          const last = geo.dep[geo.dep.length - 1]?.right ?? geo.door;
          const x = Math.min(geo.lounge.right - 4, Math.max(geo.lounge.left + 4, last + 10 + d.jy * 3));
          return !toward(d, x, (geo.lounge.top + geo.lounge.bottom) / 2, step);
        }
        const back = d.leg === 0 ? geo.door : (geo.dep[d.leg - 1] as Span).right + 2;
        return this.checkpoint(d, now, `d${d.leg}`, SERVICE_DEP, booth, back, +1, step, geo.depY);
      }
      case 'board': {
        // Down the pier, then into the gate.
        const at = geo.gates[d.gate];
        if (at === undefined) return false;
        if (d.leg === 0) {
          if (toward(d, geo.pier.x - 2, at.y + d.jy, step)) d.leg = 1;
          return true;
        }
        return !toward(d, at.x, at.y + d.jy, step);
      }
      case 'arr': {
        if (d.leg < 0) {
          // Off the plane onto the pier, up it, and across to the arrivals lane.
          const at = geo.gates[d.gate];
          const [x, y] = d.leg === -3 ? [geo.pier.x + 2, at?.y ?? d.y] : d.leg === -2 ? [geo.pier.x + 2, geo.pier.top] : [geo.arrStart, geo.arrY];
          if (toward(d, x, y + d.jy, step)) d.leg += 1;
          return true;
        }
        const booth = geo.arr[d.leg];
        if (booth === undefined) return !toward(d, geo.exit.right - 2, geo.arrY + d.jy, step);
        const back = d.leg === 0 ? geo.arrStart : (geo.arr[d.leg - 1] as Span).left - 2;
        return this.checkpoint(d, now, `a${d.leg}`, booth.id === 'baggage' ? SERVICE_BAGGAGE : SERVICE_ARR, booth, back, -1, step, geo.arrY);
      }
      case 'away': {
        if (d.leg === 0) {
          if (toward(d, geo.door + 16, geo.depY + d.jy, step)) d.leg = 1;
          return true;
        }
        toward(d, geo.door - 30, geo.depY + d.jy, step);
        d.alpha -= dt / 900;
        return d.alpha > 0;
      }
    }
  }

  /**
   * Walking to a checkpoint (`dir` +1 walks right, -1 left), queuing behind
   * whoever is there, hidden inside it while served, then out the far side.
   * A long queue squeezes up rather than reach back past `back`.
   */
  private checkpoint(d: Dot, now: number, key: string, service: number, booth: Span, back: number, dir: 1 | -1, step: number, laneY: number): boolean {
    const front = dir > 0 ? booth.left - 2 : booth.right + 2;
    const room = Math.max(0, Math.abs(front - back));
    const spot = (ahead: number): number => front - dir * Math.min(room, QUEUE_GAP * ahead);
    if (d.release > 0) {
      if (now >= d.release) {
        d.x = dir > 0 ? booth.right + 2 : booth.left - 2;
        d.leg += 1;
        d.start = 0;
        d.release = 0;
      } else if (now < d.start) {
        d.x = spot((d.start - now) / service);
      }
      return true;
    }
    const busy = this.busy.get(key) ?? 0;
    const queued = Math.max(0, (busy - now) / service);
    if (toward(d, spot(queued), laneY + d.jy, step)) {
      d.start = Math.max(now, busy);
      d.release = d.start + service;
      this.busy.set(key, d.release);
    }
    return true;
  }
}

/** Steps a dot toward a point; true once it is there. */
function toward(d: Dot, x: number, y: number, step: number): boolean {
  const dx = x - d.x;
  const dy = y - d.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= step || dist === 0) {
    d.x = x;
    d.y = y;
    return true;
  }
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
  return false;
}

/** Hidden while inside a checkpoint being served. */
export function visible(d: Dot, now: number): boolean {
  return !(d.release > 0 && now >= d.start);
}
