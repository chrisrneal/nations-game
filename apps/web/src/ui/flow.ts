import type { AirportEvent, AirportView, CheckpointId } from '@airport/contracts';

/**
 * The people walking through the airport (RULES 14): dots that come in at the
 * door, pass check-in, queue in the security maze, go through the scanners,
 * wait in the lounge and walk to their gate, and dots that step off an
 * arriving plane and walk out through the arrivals checkpoints. Pure
 * bookkeeping on numbers from the View; the Concourse component measures the
 * page and draws (P7: a canvas, never React).
 *
 * The dots follow the real flows. People join the security line at the
 * arrival rate less those a full line turns away; the line in the maze is the
 * real line (RULES 3), and security lets the head of it through as fast as the
 * sim clears it, so the maze fills when security falls behind and empties when
 * a lane is added. The lounge crowd is the real waiting count; one walks to a
 * gate for each passenger it boards. Check-in, passport control, preclearance
 * and the arrivals checkpoints are scenery. One dot stands for `perDot`
 * people, chosen so a few dots a second walk in however big the airport grows.
 */

export interface Span {
  readonly left: number;
  readonly right: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where things are on the canvas, in CSS pixels. Measured by the component when the layout changes. */
export interface FlowGeometry {
  readonly arrY: number;
  /** Where departing passengers come in, and the check-in desk they pass. */
  readonly door: Point;
  readonly checkin: Span & { readonly y: number };
  /**
   * The security maze: rows top to bottom. People enter the first row at
   * `entry` (just past check-in), snake along every row, then into the
   * scanners at the end of the last.
   */
  readonly maze: { readonly left: number; readonly right: number; readonly entry: number; readonly rows: readonly number[] };
  /** The scanners: where the head of the line goes in, and where people step out. */
  readonly scanner: { readonly enter: Point; readonly exit: Point };
  /** Checkpoints after security (passport control, preclearance), in walking order, on the lounge row. */
  readonly after: readonly Span[];
  readonly afterY: number;
  /** The lounge's seats, above the gates. */
  readonly lounge: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** Where arriving passengers join the arrivals lane (its right end). */
  readonly arrStart: number;
  /** The corridor down the concourse's right edge, outside the security maze, that arriving passengers walk up. */
  readonly side: number;
  /** Arrival checkpoints in walking order (right to left). */
  readonly arr: readonly (Span & { readonly id: CheckpointId })[];
  readonly exit: Span;
  /** The walkway down between the two columns of gates, from the lounge (`top`) down. */
  readonly pier: { readonly x: number; readonly top: number };
  /** Where each gate's passengers board and step off: the card's side on the pier, kept inside the visible gates. */
  readonly gates: readonly Point[];
}

export type DotKind = 'dep' | 'board' | 'arr' | 'away';
export type Tint = 'out' | 'in' | 'charter' | 'away';

/** Where a departing passenger is on the way to the lounge. */
export type DepPhase = 'checkin' | 'maze' | 'scan' | 'after';

export interface Dot {
  readonly kind: DotKind;
  readonly tint: Tint;
  readonly gate: number;
  /** A little sideways spread so a crowd looks like people, not beads. */
  readonly jy: number;
  /** False until its first frame puts it where it starts. */
  placed: boolean;
  x: number;
  y: number;
  /** Which checkpoint it is walking to (or, past the last, the end of its walk). */
  leg: number;
  /** Departures only: where it is. */
  phase: DepPhase;
  /** In the maze: px walked along it from the entrance. */
  pos: number;
  /** Queued at a checkpoint: served from `start`, out again at `release` (ms). */
  start: number;
  release: number;
  alpha: number;
  age: number;
}

/** Walking speeds, px a second. */
const SPEED: Readonly<Record<DotKind, number>> = { dep: 52, board: 150, arr: 64, away: 40 };
/** Walking the maze: brisk, so an empty maze is crossed in a few seconds. */
const MAZE_SPEED = 80;
/** Time inside a checkpoint, ms. Baggage claim is the slow one. */
const SERVICE_DEP = 150;
const SERVICE_ARR = 110;
const SERVICE_BAGGAGE = 220;
/** Time inside a scanner, ms. */
const SCAN_MS = 220;
/** Space between people in a queue, px; a long line squeezes up to the smallest. */
const QUEUE_GAP = 5;
const QUEUE_GAP_MIN = 2.2;
/** Ms between people stepping off a landed plane. */
const DEPLANE_STAGGER = 150;
/** Most people a landed plane shows. */
const DEPLANE_MAX = 10;
/** Most dots spawned on one update and alive at once: the frame budget on a slow phone. */
const SPAWN_MAX = 6;
export const DOTS_MAX = 260;
/** Most dots standing in the maze: past this a dot stands for more of the line. */
export const MAZE_MAX = 150;
/** Updates further apart than this were caught up quietly: no one walks for them. */
const LIVE_TICKS = 8;
/** A dot lost by a layout change gives up after this long. */
const MAX_AGE = 40_000;

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

/** The maze as a walking path: along each row, turning down at alternate ends. */
export function mazePath(maze: FlowGeometry['maze']): Point[] {
  const points: Point[] = [];
  maze.rows.forEach((y, i) => {
    const [from, to] = i % 2 === 0 ? [i === 0 ? maze.entry : maze.left, maze.right] : [maze.right, maze.left];
    points.push({ x: from, y }, { x: to, y });
  });
  return points;
}

/** A path's length and a way to find the point `pos` px along it. */
export class Path {
  readonly length: number;
  private readonly cum: number[];
  constructor(private readonly points: readonly Point[]) {
    this.cum = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Point;
      const b = points[i] as Point;
      this.cum.push((this.cum[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;
  }

  at(pos: number): Point {
    const p = Math.max(0, Math.min(this.length, pos));
    for (let i = 1; i < this.points.length; i++) {
      const end = this.cum[i] as number;
      if (p <= end || i === this.points.length - 1) {
        const start = this.cum[i - 1] as number;
        const a = this.points[i - 1] as Point;
        const b = this.points[i] as Point;
        const t = end === start ? 0 : (p - start) / (end - start);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return this.points[0] ?? { x: 0, y: 0 };
  }
}

interface Pending {
  readonly at: number;
  readonly gate: number;
  readonly charter: boolean;
}

export class FlowModel {
  readonly dots: Dot[] = [];
  /** The security line in walking order, head first: each dot from the moment it reaches the maze. */
  readonly queue: Dot[] = [];
  perDot = 1;
  /** The lounge: share of its seats in use, 0-1 (the real waiting count). */
  lounge = 0;
  /** Recently turned people away (a full line). */
  turningAway = false;
  /** Dots the real line stands for now. */
  lineDots = 0;
  private prev: AirportView | null = null;
  private accDep = 0;
  private accAway = 0;
  private accBoard: number[] = [];
  /** Dots security has let through that have not yet stepped into a scanner. */
  private cleared = 0;
  private pending: Pending[] = [];
  private busy = new Map<string, number>();
  private seed = 1;
  private awayUntil = 0;
  private path: Path | null = null;
  private pathKey = '';

  /** Takes one update from the host. `now` is the animation clock in ms. */
  ingest(view: AirportView, events: readonly AirportEvent[], now: number): void {
    const prev = this.prev;
    this.prev = view;
    this.lounge = view.terminal.cap === 0 ? 0 : Math.min(1, view.terminal.waiting / view.terminal.cap);
    const perSec = (view.terminal.arrivalPerTick * 1000) / view.tickMs / 1000;
    this.perDot = choosePerDot(Math.max(perSec, 0.001), this.perDot);
    this.lineDots = Math.min(MAZE_MAX, Math.round(view.security.line / (this.perDot * 1000)));
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
    const joined = Math.max(0, view.terminal.arrivalPerTick * ticks - away);
    this.accDep += joined;
    this.accAway += away;
    this.accDep = this.spawn(this.accDep, unit, () => this.add('dep', 'out', -1));
    this.accAway = this.spawn(this.accAway, unit, () => this.add('away', 'away', -1));
    // Security let through whatever left the line (RULES 3).
    this.cleared += Math.max(0, prev.security.line + joined - view.security.line) / unit;

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
    const path = this.mazeFor(geo);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as Pending;
      if (p.at > now) continue;
      this.pending.splice(i, 1);
      const at = geo.gates[p.gate];
      if (at !== undefined) this.add('arr', p.charter ? 'charter' : 'in', p.gate, at);
    }
    this.fillMaze(path);
    this.walkMaze(dt, now, path, geo);
    let kept = 0;
    for (const d of this.dots) {
      // Standing in a long line is not being lost.
      if (d.phase !== 'maze') d.age += dt;
      if (d.age < MAX_AGE && this.move(d, dt, now, geo)) this.dots[kept++] = d;
    }
    this.dots.length = kept;
    if (this.queue.some((d) => !this.dots.includes(d))) {
      const alive = this.queue.filter((d) => this.dots.includes(d));
      this.queue.length = 0;
      this.queue.push(...alive);
    }
  }

  /** Forget everyone walking (a new airport, or back from a long absence). The real line is filled in again on the next frame. */
  reset(): void {
    this.dots.length = 0;
    this.queue.length = 0;
    this.pending = [];
    this.accDep = 0;
    this.accAway = 0;
    this.accBoard = [];
    this.cleared = 0;
    this.busy.clear();
  }

  /** Space between people in the maze: they squeeze up when the line is longer than the maze. */
  gap(path: Path): number {
    return Math.max(QUEUE_GAP_MIN, Math.min(QUEUE_GAP, path.length / Math.max(1, this.queue.length)));
  }

  private mazeFor(geo: FlowGeometry): Path {
    const points = mazePath(geo.maze);
    const key = points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    if (this.path === null || key !== this.pathKey) {
      this.path = new Path(points);
      this.pathKey = key;
    }
    return this.path;
  }

  /**
   * Keeps the maze as long as the real line: people already standing for a
   * line the dots have not caught up with (a reload, a quiet catch-up, more
   * arriving in a tick than a frame spawns) appear at the back; a maze longer
   * than the line lets its head through.
   */
  private fillMaze(path: Path): void {
    const walking = this.dots.filter((d) => d.kind === 'dep' && d.phase === 'checkin').length;
    const missing = this.lineDots - this.queue.length - walking;
    if (missing > 2) {
      for (let i = 0; i < missing && this.dots.length < DOTS_MAX; i++) {
        this.add('dep', 'out', -1);
        const d = this.dots[this.dots.length - 1] as Dot;
        d.phase = 'maze';
        d.placed = true;
        d.pos = Math.max(0, path.length - this.queue.length * this.gap(path));
        const at = path.at(d.pos);
        d.x = at.x;
        d.y = at.y + d.jy;
        this.queue.push(d);
      }
    }
    const extra = this.queue.length - this.lineDots;
    if (extra > 2 && this.cleared < 1) this.cleared += 1;
    this.cleared = Math.min(this.cleared, this.queue.length);
  }

  /** The line shuffles forward; the head steps into a scanner whenever security clears someone. */
  private walkMaze(dt: number, now: number, path: Path, geo: FlowGeometry): void {
    const gap = this.gap(path);
    const step = (MAZE_SPEED * dt) / 1000;
    this.queue.forEach((d, i) => {
      const target = Math.max(0, path.length - i * gap);
      if (d.pos < target) d.pos = Math.min(target, d.pos + step);
      const at = path.at(d.pos);
      d.x = at.x;
      d.y = at.y + d.jy * 0.6;
    });
    // As many as security cleared step in at the head, as each reaches it.
    while (this.cleared > 1 - 1e-6) {
      const head = this.queue[0];
      if (head === undefined || head.pos < path.length - gap * 1.5) break;
      this.queue.shift();
      this.cleared -= 1;
      head.phase = 'scan';
      head.x = geo.scanner.enter.x;
      head.y = geo.scanner.enter.y;
      head.start = now;
      head.release = now + SCAN_MS;
    }
  }

  /** Spawns a dot per `unit` in `acc` (at most SPAWN_MAX) and returns the remainder. */
  private spawn(acc: number, unit: number, make: () => void): number {
    let n = Math.floor(acc / unit);
    const rest = acc - n * unit;
    n = Math.min(n, SPAWN_MAX);
    for (let i = 0; i < n; i++) make();
    return rest;
  }

  private add(kind: DotKind, tint: Tint, gate: number, at?: Point): void {
    if (this.dots.length >= DOTS_MAX) return;
    const placed = at !== undefined;
    this.dots.push({ kind, tint, gate, jy: this.jitter() * 3, placed, x: at?.x ?? 0, y: at?.y ?? 0, leg: kind === 'arr' ? -4 : 0, phase: 'checkin', pos: 0, start: 0, release: 0, alpha: 1, age: 0 });
  }

  /** Puts a new dot where its walk starts. */
  private place(d: Dot, geo: FlowGeometry): void {
    d.placed = true;
    if (d.kind === 'board') {
      // Off the bench at the head of the pier.
      d.x = Math.min(geo.lounge.right - 4, Math.max(geo.lounge.left + 4, geo.pier.x + d.jy * 8));
      d.y = geo.lounge.bottom - 2;
    } else {
      d.x = geo.door.x;
      d.y = geo.door.y + d.jy;
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
      case 'dep':
        return this.depart(d, step, now, geo);
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
          // Off the plane onto the pier, up it, along under the lounge, up the side corridor (round the maze) to the arrivals lane.
          const at = geo.gates[d.gate];
          const [x, y] =
            d.leg === -4 ? [geo.pier.x + 2, at?.y ?? d.y] : d.leg === -3 ? [geo.pier.x + 2, geo.pier.top] : d.leg === -2 ? [geo.side, geo.pier.top] : [geo.side, geo.arrY];
          if (toward(d, x, y + d.jy, step)) d.leg += 1;
          return true;
        }
        const booth = geo.arr[d.leg];
        if (booth === undefined) return !toward(d, geo.exit.right - 2, geo.arrY + d.jy, step);
        const back = d.leg === 0 ? geo.side : (geo.arr[d.leg - 1] as Span).left - 2;
        return this.checkpoint(d, now, `a${d.leg}`, booth.id === 'baggage' ? SERVICE_BAGGAGE : SERVICE_ARR, booth, back, -1, step, geo.arrY);
      }
      case 'away': {
        if (d.leg === 0) {
          if (toward(d, geo.door.x + 16, geo.door.y + d.jy, step)) d.leg = 1;
          return true;
        }
        toward(d, geo.door.x - 30, geo.door.y + d.jy, step);
        d.alpha -= dt / 900;
        return d.alpha > 0;
      }
    }
  }

  /** A departing passenger: check-in, the maze (moved by `walkMaze`), a scanner, the checkpoints after it, the lounge. */
  private depart(d: Dot, step: number, now: number, geo: FlowGeometry): boolean {
    switch (d.phase) {
      case 'checkin': {
        if (d.leg === 0) return this.checkpoint(d, now, 'checkin', SERVICE_DEP, geo.checkin, geo.door.x, +1, step, geo.checkin.y);
        // Into the maze at its entrance.
        const enter = geo.maze.rows[0] ?? geo.checkin.y;
        if (toward(d, geo.maze.entry, enter + d.jy * 0.6, step * 1.4)) {
          d.phase = 'maze';
          d.pos = 0;
          this.queue.push(d);
        }
        return true;
      }
      case 'maze':
        return true;
      case 'scan':
        if (now >= d.release) {
          d.phase = 'after';
          d.leg = 0;
          d.start = 0;
          d.release = 0;
          d.x = geo.scanner.exit.x;
          d.y = geo.scanner.exit.y + d.jy;
        }
        return true;
      case 'after': {
        const booth = geo.after[d.leg];
        if (booth === undefined) {
          // Into the lounge: a seat near the crowd's edge, then sat down (the crowd is drawn from the real count).
          const x = Math.min(geo.lounge.right - 6, Math.max(geo.lounge.left + 6, geo.lounge.left + 6 + this.lounge * (geo.lounge.right - geo.lounge.left - 12) + d.jy * 4));
          return !toward(d, x, (geo.lounge.top + geo.lounge.bottom) / 2 + d.jy, step * 1.4);
        }
        const back = d.leg === 0 ? geo.scanner.exit.x : (geo.after[d.leg - 1] as Span).left - 2;
        return this.checkpoint(d, now, `p${d.leg}`, SERVICE_DEP, booth, back, -1, step, geo.afterY);
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

/** Hidden while inside a checkpoint or a scanner being served. */
export function visible(d: Dot, now: number): boolean {
  if (d.phase === 'scan' && d.kind === 'dep') return false;
  return !(d.release > 0 && now >= d.start);
}
