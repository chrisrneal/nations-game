import type { WarehouseEvent, WarehouseView } from '@warehouse/contracts';

/**
 * Goods moving across the warehouse floor (RULES 14): order dots that come in
 * at the order desk, queue in the picking maze, go through the pickers, wait
 * in packing and walk to their dock, and stock dots that come off the PO at
 * the receiving dock and walk through quality check onto the shelves. Pure
 * bookkeeping on numbers from the View; the Floor component measures the page
 * and draws (P7: a canvas, never React).
 *
 * The dots follow the real flows. Orders join the backlog at the order rate
 * less those cancelled because the backlog is full; the line in the maze is
 * the real backlog (RULES 3), and the pickers let the head of it through as
 * fast as the sim picks, so the maze fills when picking (or stock) falls
 * behind and empties when pickers are hired. The packing crowd is the real
 * staged count; one walks to a dock for each order it loads, down the aisle
 * and in at the bay's door, and the boxes in each truck are its real load.
 * Stock dots leave the receiving dock as fast as the PO is put away (RULES
 * 3a). The order desk, quality check and export stations are scenery. One dot
 * stands for `perDot` orders or units, chosen so a few dots a second move
 * however big the warehouse grows.
 */

export interface Span {
  readonly left: number;
  readonly right: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A dock's bay: a parked truck seen from above, cab up to the walkway. */
export interface DockSpot {
  /** The middle of the bay: the truck's centre line. */
  readonly x: number;
  /** The walkway past the bay's door, between it and the row above. */
  readonly door: number;
  /** Where orders are loaded: the back of the cab. */
  readonly y: number;
  /** Every parcel space in the truck, front first: the canvas fills them from the load. */
  readonly parcels: readonly Point[];
}

/** Where things are on the canvas, in CSS pixels. Measured by the component when the layout changes. */
export interface FlowGeometry {
  /** The inbound lane: stock leaves the receiving dock at `start`, passes the stations, and is put away on the shelves. */
  readonly inbound: { readonly y: number; readonly start: number; readonly booths: readonly Span[]; readonly shelves: Span };
  /** Where new orders come in, and the order desk they pass. */
  readonly door: Point;
  readonly checkin: Span & { readonly y: number };
  /**
   * The picking maze: rows top to bottom. Orders enter the first row at
   * `entry` (just past the desk), snake along every row, then into the
   * pickers at the end of the last.
   */
  readonly maze: { readonly left: number; readonly right: number; readonly entry: number; readonly rows: readonly number[] };
  /** The pickers: where the head of the backlog goes in, and where picked orders come out. */
  readonly pickers: { readonly enter: Point; readonly exit: Point };
  /** Stations after picking (export paperwork, customs), in order, on the packing row. */
  readonly after: readonly Span[];
  readonly afterY: number;
  /** The packing bench, above the docks. */
  readonly staging: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** The aisle down the middle of the bays, from packing (`top`) down. */
  readonly pier: { readonly x: number; readonly top: number };
  /** Each dock's bay, kept inside the visible docks. */
  readonly docks: readonly DockSpot[];
}

/** A parked truck's load: share of its parcels taken (0-1), or null while the dock waits for a truck. */
export interface Load {
  readonly share: number | null;
  readonly parcels: number;
  readonly express: boolean;
}

/** `dep`: a new order on its way to packing; `board`: a packed order walking to its truck; `arr`: stock on its way to the shelves; `away`: a cancelled order. */
export type DotKind = 'dep' | 'board' | 'arr' | 'away';
export type Tint = 'out' | 'in' | 'express' | 'away';

/** Where a new order is on the way to packing. */
export type DepPhase = 'checkin' | 'maze' | 'scan' | 'after';

export interface Dot {
  readonly kind: DotKind;
  readonly tint: Tint;
  readonly dock: number;
  /** A little sideways spread so a crowd looks like goods on the move, not beads. */
  readonly jy: number;
  /** False until its first frame puts it where it starts. */
  placed: boolean;
  x: number;
  y: number;
  /** Which station it is walking to (or, past the last, the end of its walk). */
  leg: number;
  /** Orders only: where it is. */
  phase: DepPhase;
  /** In the maze: px walked along it from the entrance. */
  pos: number;
  /** Queued at a station: served from `start`, out again at `release` (ms). */
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
/** Time at a picker, ms. */
const SCAN_MS = 220;
/** Space between orders in a queue, px; a long line squeezes up to the smallest. */
const QUEUE_GAP = 5;
const QUEUE_GAP_MIN = 2.2;
/** Most dots spawned on one update and alive at once: the frame budget on a slow phone. */
const SPAWN_MAX = 6;
export const DOTS_MAX = 260;
/** Most dots standing in the maze: past this a dot stands for more of the line. */
export const MAZE_MAX = 150;
/** Space between parcels in a parked truck, px, and the aisle down its middle. */
const PARCEL_GAP = 5;
const AISLE = 4;
/** Updates further apart than this were caught up quietly: no one walks for them. */
const LIVE_TICKS = 8;
/** A dot lost by a layout change gives up after this long. */
const MAX_AGE = 40_000;

/** Orders per dot: 1, 2, 5, 10, 20, 50, ... */
export function perDotSteps(): number[] {
  const steps: number[] = [];
  for (let base = 1; base <= 1e12; base *= 10) steps.push(base, base * 2, base * 5);
  return steps;
}
const STEPS = perDotSteps();

/**
 * Orders per dot for a flow of `perSec` a second, keeping `current`
 * unless the dot rate leaves 1-6 a second (so Sunvale's waves do not flicker it).
 */
export function choosePerDot(perSec: number, current: number): number {
  const rate = perSec / current;
  if (rate <= 6 && (rate >= 1 || current === 1)) return current;
  return STEPS.find((k) => perSec / k <= 4) ?? (STEPS[STEPS.length - 1] as number);
}

/**
 * The parcels of a truck filling the box (a fuselage seen from above, nose up):
 * rows across with an aisle down the middle, front row first and, within a
 * row, from the aisle out, so a filling truck fills from the front.
 */
export function parcelSpots(box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }): Point[] {
  const mid = (box.left + box.right) / 2;
  const side = Math.max(1, Math.floor((box.right - box.left - AISLE) / 2 / PARCEL_GAP));
  const rows = Math.max(1, Math.floor((box.bottom - box.top) / PARCEL_GAP));
  const spots: Point[] = [];
  for (let r = 0; r < rows; r++) {
    const y = box.top + PARCEL_GAP / 2 + r * PARCEL_GAP;
    for (let k = 0; k < side; k++) {
      const off = AISLE / 2 + PARCEL_GAP / 2 + k * PARCEL_GAP;
      spots.push({ x: mid - off, y }, { x: mid + off, y });
    }
  }
  return spots;
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

export class FlowModel {
  readonly dots: Dot[] = [];
  /** The picking line in walking order, head first: each dot from the moment it reaches the maze. */
  readonly queue: Dot[] = [];
  perDot = 1;
  /** The staging: share of its parcels in use, 0-1 (the real staged count). */
  staging = 0;
  /** Recently cancelled orders (a full backlog). */
  turningAway = false;
  /** Dots the real line stands for now. */
  lineDots = 0;
  /** Each dock's parked truck (RULES 2): what its parcels show. */
  loads: Load[] = [];
  private prev: WarehouseView | null = null;
  private accDep = 0;
  private accAway = 0;
  private accBoard: number[] = [];
  /** Dots picking has let through that have not yet reached a picker. */
  private cleared = 0;
  private accIn = 0;
  /** The shelves: share of their space in use, 0-1 (the real stock). */
  shelves = 0;
  private busy = new Map<string, number>();
  private seed = 1;
  private awayUntil = 0;
  private path: Path | null = null;
  private pathKey = '';

  /** Takes one update from the host. `now` is the animation clock in ms. */
  ingest(view: WarehouseView, events: readonly WarehouseEvent[], now: number): void {
    const prev = this.prev;
    this.prev = view;
    this.staging = view.staging.cap === 0 ? 0 : Math.min(1, view.staging.staged / view.staging.cap);
    this.shelves = view.receiving.shelfCap === 0 ? 0 : Math.min(1, view.receiving.stock / view.receiving.shelfCap);
    this.loads = view.docks.map((g) => ({ share: g.turn > 0 ? null : Math.min(1, g.loaded / Math.max(1, g.parcels * 1000)), parcels: g.parcels, express: g.express }));
    const perSec = (view.staging.orderPerTick * 1000) / view.tickMs / 1000;
    this.perDot = choosePerDot(Math.max(perSec, 0.001), this.perDot);
    this.lineDots = Math.min(MAZE_MAX, Math.round(view.picking.backlog / (this.perDot * 1000)));
    const ticks = prev === null ? 0 : view.tick - prev.tick;
    if (prev === null || view.site.index !== prev.site.index || events.some((e) => e.type === 'sold')) {
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
    const joined = Math.max(0, view.staging.orderPerTick * ticks - away);
    this.accDep += joined;
    this.accAway += away;
    this.accDep = this.spawn(this.accDep, unit, () => this.add('dep', 'out', -1));
    this.accAway = this.spawn(this.accAway, unit, () => this.add('away', 'away', -1));
    // Picking let through whatever left the line (RULES 3).
    this.cleared += Math.max(0, prev.picking.backlog + joined - view.picking.backlog) / unit;

    // Stock put away since the last update: the rest of a finished PO, then the new one (RULES 3a).
    const was = prev.receiving.po;
    const po = view.receiving.po;
    const received = po.id === was.id ? Math.max(0, po.received - was.received) : Math.max(0, was.units * 1000 - was.received) + po.received;
    this.accIn = this.spawn(this.accIn + received, unit, () => this.add('arr', 'in', -1));

    const departed = new Map<number, number>();
    for (const e of events) {
      if (e.type === 'departed') departed.set(e.payload.dock, e.payload.orders * 1000);
    }
    view.docks.forEach((g, i) => {
      const before = prev.docks[i];
      if (before === undefined) return;
      const left = departed.get(i);
      let loaded: number;
      if (left !== undefined) loaded = Math.max(0, left - before.loaded);
      else loaded = before.truck === g.truck ? Math.max(0, g.loaded - before.loaded) : g.loaded;
      this.accBoard[i] = this.spawn((this.accBoard[i] ?? 0) + loaded, unit, () => this.add('board', 'out', i));
    });
  }

  /** Moves everyone `dt` ms on. Call once a frame with the latest geometry. */
  advance(dt: number, now: number, geo: FlowGeometry): void {
    const path = this.mazeFor(geo);
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

  /** Forget everyone walking (a new warehouse, or back from a long absence). The real line is filled in again on the next frame. */
  reset(): void {
    this.dots.length = 0;
    this.queue.length = 0;
    this.accIn = 0;
    this.accDep = 0;
    this.accAway = 0;
    this.accBoard = [];
    this.cleared = 0;
    this.busy.clear();
  }

  /** Space between orders in the maze: they squeeze up when the backlog is longer than the maze. */
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
   * Keeps the maze as long as the real backlog: orders already waiting for a
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

  /** The line shuffles forward; the head goes to a picker whenever the sim picks one. */
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
    // As many as picking cleared step in at the head, as each reaches it.
    while (this.cleared > 1 - 1e-6) {
      const head = this.queue[0];
      if (head === undefined || head.pos < path.length - gap * 1.5) break;
      this.queue.shift();
      this.cleared -= 1;
      head.phase = 'scan';
      head.x = geo.pickers.enter.x;
      head.y = geo.pickers.enter.y;
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

  private add(kind: DotKind, tint: Tint, dock: number, at?: Point): void {
    if (this.dots.length >= DOTS_MAX) return;
    const placed = at !== undefined;
    this.dots.push({ kind, tint, dock, jy: this.jitter() * 3, placed, x: at?.x ?? 0, y: at?.y ?? 0, leg: 0, phase: 'checkin', pos: 0, start: 0, release: 0, alpha: 1, age: 0 });
  }

  /** Puts a new dot where its walk starts. */
  private place(d: Dot, geo: FlowGeometry): void {
    d.placed = true;
    if (d.kind === 'board') {
      // Off the bench at the head of the aisle.
      d.x = Math.min(geo.staging.right - 4, Math.max(geo.staging.left + 4, geo.pier.x + d.jy * 8));
      d.y = geo.staging.bottom - 2;
    } else if (d.kind === 'arr') {
      // Off the PO at the receiving dock.
      d.x = geo.inbound.start;
      d.y = geo.inbound.y + d.jy * 0.6;
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
        // Down the pier, along the walkway to the stand's door, then aboard.
        const at = geo.docks[d.dock];
        if (at === undefined) return false;
        const j = d.jy * 0.4;
        if (d.leg === 0) {
          if (toward(d, geo.pier.x - 1.5, at.door + j, step)) d.leg = 1;
          return true;
        }
        if (d.leg === 1) {
          if (toward(d, at.x, at.door + j, step)) d.leg = 2;
          return true;
        }
        return !toward(d, at.x, at.y, step);
      }
      case 'arr': {
        // Through the stations on the lane, then onto the shelves where they are filled to (the real stock).
        const lane = geo.inbound;
        const booth = lane.booths[d.leg];
        if (booth === undefined) {
          const { left, right } = lane.shelves;
          const x = Math.min(right - 3, Math.max(left + 3, left + 3 + this.shelves * (right - left - 6)));
          return !toward(d, x, lane.y + d.jy * 0.6, step);
        }
        const back = d.leg === 0 ? lane.start : (lane.booths[d.leg - 1] as Span).right + 2;
        return this.checkpoint(d, now, `i${d.leg}`, SERVICE_ARR, booth, back, +1, step, lane.y);
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

  /** A new order: the order desk, the maze (moved by `walkMaze`), the pickers, the stations after them, packing. */
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
          d.x = geo.pickers.exit.x;
          d.y = geo.pickers.exit.y + d.jy;
        }
        return true;
      case 'after': {
        const booth = geo.after[d.leg];
        if (booth === undefined) {
          // Onto the packing bench near the pile's edge (the pile is drawn from the real count).
          const x = Math.min(geo.staging.right - 6, Math.max(geo.staging.left + 6, geo.staging.left + 6 + this.staging * (geo.staging.right - geo.staging.left - 12) + d.jy * 4));
          return !toward(d, x, (geo.staging.top + geo.staging.bottom) / 2 + d.jy, step * 1.4);
        }
        const back = d.leg === 0 ? geo.pickers.exit.x : (geo.after[d.leg - 1] as Span).left - 2;
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

/** Hidden while inside a station or at a picker. */
export function visible(d: Dot, now: number): boolean {
  if (d.phase === 'scan' && d.kind === 'dep') return false;
  return !(d.release > 0 && now >= d.start);
}
