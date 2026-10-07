import type { WmsOrderStatus, WmsRole, WmsTaskKind, WmsView, WmsWorkerView } from '@warehouse/contracts';
import { formatCash } from '../format.ts';

/**
 * The WMS floor (decision records W7 and W8, RULES 10): the warehouse drawn
 * from what the WMS is doing, not from scenery. Every worker on screen is a
 * real WMS worker doing its task: pickers walk the route the sim times (out
 * of the aisle to the front cross aisle, across, and in) and pick at the bin
 * of their task, and when one confirms a line its tote rides the conveyor to
 * packing; receivers count lines in at the door of their truck, then drive
 * each received line to its bin on a pallet (a put-away task). Orders past
 * picking sit at the pack bench, the packed area, the staging lanes and the
 * truck as their status says, and leave on the truck when they ship.
 *
 * Pure bookkeeping on the View and a clock passed in, so it is tested in
 * Node; WmsFloor.tsx measures the box and draws it on a canvas (P7).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where an order past picking is, by its status. */
export type Zone = 'pack' | 'packed' | 'staging' | 'truck';

export const ZONES: readonly Zone[] = ['pack', 'packed', 'staging', 'truck'];
export const ZONE_NAMES: Readonly<Record<Zone, string>> = { pack: 'Pack', packed: 'Packed', staging: 'Staging', truck: 'Truck' };

export function zoneOf(status: WmsOrderStatus): Zone | null {
  switch (status) {
    case 'PICKED':
    case 'SHORT':
      return 'pack';
    case 'PACKED':
      return 'packed';
    case 'STAGED':
      return 'staging';
    case 'LOADED':
      return 'truck';
    default:
      return null;
  }
}

export interface FloorShape {
  readonly aisles: number;
  readonly bays: number;
  readonly doors: number;
}

/** Where everything is, in CSS pixels, for a box `width` x `height`. */
export interface FloorLayout {
  readonly width: number;
  readonly height: number;
  readonly shape: FloorShape;
  /** The inbound band: the yard on the left, a trailer spot per door, and the dock lane under them that forklifts drive. */
  readonly inbound: Rect;
  readonly yard: Rect;
  readonly doors: readonly Rect[];
  readonly dockLane: number;
  /** The racks: the front cross aisle (bay 0) at `x0`, each bay `bayW` apart, each aisle's rack strip and walkway. */
  readonly x0: number;
  readonly bayW: number;
  readonly rackTop: readonly number[];
  readonly rackH: number;
  readonly walk: readonly number[];
  /** The conveyor from the front cross aisle down to the pack bench. */
  readonly conveyor: number;
  /** The outbound band and its four zones, left to right. */
  readonly outbound: Rect;
  readonly zones: Readonly<Record<Zone, Rect>>;
}

const PAD = 8;
/** Carton squares in the zones, and the gap between them. */
export const CARTON = 8;
const CARTON_GAP = 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function floorLayout(width: number, height: number, shape: FloorShape): FloorLayout {
  const inH = Math.round(clamp(height * 0.2, 72, 100));
  const outH = Math.round(clamp(height * 0.27, 96, 132));
  const inbound: Rect = { left: 0, top: 0, right: width, bottom: inH };
  const outbound: Rect = { left: 0, top: height - outH, right: width, bottom: height };
  const yard: Rect = { left: PAD, top: 18, right: Math.round(width * 0.3), bottom: inH - 22 };
  const doorsLeft = yard.right + 10;
  const n = Math.max(1, shape.doors);
  const room = (width - PAD - doorsLeft) / n;
  const doors = Array.from({ length: n }, (_, i): Rect => {
    const mid = doorsLeft + room * (i + 0.5);
    const w = Math.min(96, room - 10);
    return { left: mid - w / 2, top: 18, right: mid + w / 2, bottom: inH - 24 };
  });
  const dockLane = inH - 11;
  const conveyor = PAD + 5;
  const x0 = PAD + 24;
  const bayW = (width - PAD - x0) / (shape.bays + 0.5);
  const block = (outbound.top - inbound.bottom) / Math.max(1, shape.aisles);
  const rackH = Math.round(clamp(block * 0.34, 8, 16));
  const rackTop = Array.from({ length: shape.aisles }, (_, a) => inbound.bottom + block * a + 5);
  const walk = rackTop.map((t) => t + rackH + (block - rackH - 5) / 2);
  const fractions: Readonly<Record<Zone, number>> = { pack: 0.27, packed: 0.17, staging: 0.29, truck: 0.27 };
  const zones = {} as Record<Zone, Rect>;
  // The zones start right of the conveyor, under a header row and a row of zone names.
  let left = conveyor + 9;
  const span = width - PAD - left;
  for (const z of ZONES) {
    const right = z === 'truck' ? width - PAD : left + span * fractions[z];
    zones[z] = { left, top: outbound.top + 30, right: right - 4, bottom: height - 6 };
    left = right;
  }
  return { width, height, shape, inbound, yard, doors, dockLane, x0, bayW, rackTop, rackH, walk, conveyor, outbound, zones };
}

/** A spot on an aisle's walkway: bay 0 is the front cross aisle. */
export function place(l: FloorLayout, aisle: number, bay: number): Point {
  const a = clamp(aisle, 0, l.walk.length - 1);
  return { x: l.x0 + bay * l.bayW, y: l.walk[a] ?? 0 };
}

/** The rack cell for a bay, above its walkway. */
export function binCell(l: FloorLayout, aisle: number, bay: number): Rect {
  const a = clamp(aisle, 0, l.rackTop.length - 1);
  const x = l.x0 + bay * l.bayW;
  const top = l.rackTop[a] ?? 0;
  return { left: x - l.bayW / 2 + 1, top, right: x + l.bayW / 2 - 1, bottom: top + l.rackH };
}

/** The walk between two spots as the sim times it (RULES 16): along the aisle, or out to the front cross aisle, across and in. */
export function route(l: FloorLayout, from: { aisle: number; bay: number }, to: { aisle: number; bay: number }): Point[] {
  const a = place(l, from.aisle, from.bay);
  const b = place(l, to.aisle, to.bay);
  if (from.aisle === to.aisle) return [a, b];
  return [a, place(l, from.aisle, 0), place(l, to.aisle, 0), b];
}

/** Where a door's trailer backs in, and where its receivers stand on the dock lane. */
export function doorSpot(l: FloorLayout, door: number): Point {
  const r = l.doors[clamp(door - 1, 0, l.doors.length - 1)] as Rect;
  return { x: (r.left + r.right) / 2, y: l.dockLane };
}

/** Where idle receivers wait: the dock lane under the yard. */
export function receiverHome(l: FloorLayout, id: number): Point {
  return { x: l.yard.left + 10 + ((id - 1) % 6) * 11, y: l.dockLane };
}

/** A forklift's put-away run: along the dock lane to the front cross aisle, down it, and along the walkway to the bin. */
export function putawayRoute(l: FloorLayout, door: number, aisle: number, bay: number): Point[] {
  const d = doorSpot(l, door);
  const front = place(l, aisle, 0);
  return [d, { x: front.x, y: l.dockLane }, front, place(l, aisle, bay)];
}

/** A confirmed line's tote: along the walkway to the front, onto the conveyor and down to the pack bench. */
export function toteRoute(l: FloorLayout, aisle: number, bay: number): Point[] {
  const at = place(l, aisle, bay);
  const front = place(l, aisle, 0);
  const pack = l.zones.pack;
  return [at, front, { x: l.conveyor, y: front.y }, { x: l.conveyor, y: pack.top + 6 }, { x: pack.left + 6, y: pack.top + 6 }];
}

/** The `i`th carton space in a zone, filled left to right, top down; past the room they stack on the last. */
export function slot(r: Rect, i: number): Point {
  const cols = Math.max(1, Math.floor((r.right - r.left + CARTON_GAP) / (CARTON + CARTON_GAP)));
  const rows = Math.max(1, Math.floor((r.bottom - r.top + CARTON_GAP) / (CARTON + CARTON_GAP)));
  const k = Math.min(i, cols * rows - 1);
  return { x: r.left + (k % cols) * (CARTON + CARTON_GAP) + CARTON / 2, y: r.top + Math.floor(k / cols) * (CARTON + CARTON_GAP) + CARTON / 2 };
}

/** Length of a polyline, and the point `d` along it. */
export function length(path: readonly Point[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot((path[i] as Point).x - (path[i - 1] as Point).x, (path[i] as Point).y - (path[i - 1] as Point).y);
  return n;
}

export function along(path: readonly Point[], d: number): Point {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg && seg > 0) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return path[path.length - 1] ?? { x: 0, y: 0 };
}

/** Something moving along a path, due at the end at `arriveAt` (ms). */
export interface Mover {
  path: Point[];
  total: number;
  done: number;
  arriveAt: number;
  x: number;
  y: number;
}

function mover(path: Point[], now: number, ms: number): Mover {
  const start = path[0] ?? { x: 0, y: 0 };
  return { path, total: length(path), done: 0, arriveAt: now + ms, x: start.x, y: start.y };
}

/** Moves along the path so it reaches the end exactly at `arriveAt`, however the frames fall. */
function move(m: Mover, now: number, dt: number): void {
  const left = m.total - m.done;
  if (left <= 0) return;
  const time = m.arriveAt - now;
  m.done = time <= 0 ? m.total : m.done + left * Math.min(1, dt / time);
  const p = along(m.path, m.done);
  m.x = p.x;
  m.y = p.y;
}

function arrived(m: Mover): boolean {
  return m.done >= m.total;
}

/** A worker on the floor (W8): where it stands or walks to, and what its task is. */
export interface WorkerDot extends Mover {
  readonly id: number;
  role: WmsRole;
  /** The active task's number and kind; 0 and null when it has none. */
  task: number;
  kind: WmsTaskKind | null;
  /** At the dock (bin -1), else at aisle and bay. */
  dock: boolean;
  aisle: number;
  bay: number;
  /** The door of its receive task; 0 otherwise. */
  door: number;
  /** A pick task's order priority; 0 otherwise. */
  priority: number;
  /** Share of its task done, 0-1. */
  pct: number;
}

export interface Tote extends Mover {
  readonly priority: number;
}

export interface Carton {
  readonly order: number;
  priority: number;
  zone: Zone;
  short: boolean;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t0: number;
  /** Shipped: it rides out on the truck (drawn moving with it); loaded orders not yet shipped wait at the dock. */
  leaving: boolean;
}

/** A bin that just filled (put away) or emptied (picked), for a flash. */
export interface Flash {
  readonly aisle: number;
  readonly bay: number;
  readonly at: number;
  readonly kind: 'put' | 'pick';
}

export interface Pop {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly at: number;
}

/** How long a carton glides to a new spot, ms. */
export const GLIDE_MS = 520;
/** Totes ride the conveyor this fast, px a second. */
const TOTE_SPEED = 170;
/** A worker retargeted without a walk (a new floor, a reassignment, along the dock) gets there this fast, ms. */
const SNAP_MS = 450;
/** The truck pulls out and the next backs in, ms each. */
export const TRUCK_OUT_MS = 900;
export const TRUCK_IN_MS = 700;
export const FLASH_MS = 600;
export const POP_MS = 1200;

/** Where a worker stands (W8): at its bin, at the door of the truck it counts, or (idle at the dock) on the dock lane; pickers wait at the pick-and-drop point. */
export function workerSpot(l: FloorLayout, pv: Pick<WmsWorkerView, 'id' | 'role' | 'at' | 'aisle' | 'bay' | 'door'>): Point {
  const off = spread(pv.id);
  if (pv.at < 0 && pv.role === 'receive') {
    if (pv.door > 0) {
      const d = doorSpot(l, pv.door);
      return { x: d.x + off.x * 2, y: d.y + off.y };
    }
    return receiverHome(l, pv.id);
  }
  const p = place(l, pv.aisle, pv.bay);
  return { x: p.x + off.x, y: p.y + off.y };
}

interface Spot {
  readonly dock: boolean;
  readonly aisle: number;
  readonly bay: number;
}

/**
 * A worker's way between two spots (W8): along the racks as the sim times it
 * (`route`), or between the dock and a bin: along the dock lane to the front
 * of the aisle, down the front cross aisle and along the aisle (a put-away),
 * or the same way back.
 */
export function workerRoute(l: FloorLayout, from: Spot, to: Spot, start: Point, end: Point): Point[] {
  if (from.dock && to.dock) return [start, end];
  if (!from.dock && !to.dock) {
    const path = route(l, from, to);
    return [start, ...path.slice(1, -1), end];
  }
  if (from.dock) {
    const front = place(l, to.aisle, 0);
    return [start, { x: front.x, y: l.dockLane }, front, end];
  }
  const front = place(l, from.aisle, 0);
  return [start, front, { x: front.x, y: l.dockLane }, end];
}

/** Small offsets so people at the same spot stand side by side. */
export function spread(id: number): Point {
  return { x: (((id - 1) % 3) - 1) * 4, y: ((Math.floor((id - 1) / 3) % 2) * 2 - 1) * 2 };
}

/**
 * Everything moving on the WMS floor. `ingest` takes each new View (once a
 * WMS step, a second) and sets where each thing is going and when it must
 * get there; `advance` moves them for a frame.
 */
export class WmsFloorModel {
  layout: FloorLayout | null = null;
  workers: WorkerDot[] = [];
  totes: Tote[] = [];
  cartons: Carton[] = [];
  flashes: Flash[] = [];
  pops: Pop[] = [];
  /** The truck at the outbound dock: 0 parked, else when it started pulling out (ms). */
  truckOut = 0;
  /** Bumped whenever what stands still changes (a new View or a new layout): the still canvas is redrawn then. */
  still = 0;
  private last: WmsView | null = null;
  private lastTick = 0;
  private lastTickMs = 250;
  private lastNow = 0;
  private reduced = false;

  setLayout(l: FloorLayout): void {
    this.layout = l;
    this.still += 1;
    // Everything snaps to the new layout at the next View.
    this.workers = [];
    this.totes = [];
    this.cartons = [];
    if (this.last !== null) this.ingest(this.last, this.lastTick, this.lastTickMs, this.lastNow, []);
  }

  /** Reduced motion: things jump to where they are going. */
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** The latest View. `shipped` is the pay of each WMS order that shipped since the last one ({ order, cents }). */
  ingest(w: WmsView, tick: number, tickMs: number, now: number, shipped: readonly { order: number; cents: number }[]): void {
    const l = this.layout;
    this.last = w;
    this.lastTick = tick;
    this.lastTickMs = tickMs;
    this.lastNow = now;
    this.still += 1;
    if (l === null) return;
    this.ingestWorkers(l, w, tickMs, now);
    this.ingestCartons(l, w, now, shipped);
  }

  private ingestWorkers(l: FloorLayout, w: WmsView, tickMs: number, now: number): void {
    const before = new Map(this.workers.map((p) => [p.id, p]));
    this.workers = w.workers.map((pv) => {
      const target = workerSpot(l, pv);
      const was = before.get(pv.id);
      const facts = {
        role: pv.role,
        task: pv.task?.no ?? 0,
        kind: pv.task?.kind ?? null,
        dock: pv.at < 0,
        aisle: pv.aisle,
        bay: pv.bay,
        door: pv.door,
        priority: pv.task?.priority ?? 0,
        pct: pv.pct / 100,
      };
      if (was === undefined) return { ...mover([target], now, 0), id: pv.id, ...facts };
      // The task it was on is done: a picked line's tote goes to the conveyor; a put-away lands in its bin.
      if (was.task > 0 && was.task !== facts.task) {
        const done = pv.done.find((t) => t.no === was.task);
        if (done !== undefined && was.kind === 'PICK' && done.done > 0) {
          const path = toteRoute(l, was.aisle, was.bay);
          this.totes.push({ ...mover(path, now, (length(path) / TOTE_SPEED) * 1000), priority: was.priority });
          this.flashes.push({ aisle: was.aisle, bay: was.bay, at: now, kind: 'pick' });
        } else if (done !== undefined && was.kind === 'PUTAWAY') this.flashes.push({ aisle: was.aisle, bay: was.bay, at: now, kind: 'put' });
      }
      const end = was.path[was.path.length - 1] ?? target;
      if (end.x !== target.x || end.y !== target.y) {
        const path = workerRoute(l, { dock: was.dock, aisle: was.aisle, bay: was.bay }, { dock: facts.dock, aisle: facts.aisle, bay: facts.bay }, { x: was.x, y: was.y }, target);
        const ms = this.reduced ? 0 : pv.walk > 0 ? pv.walk * tickMs : SNAP_MS;
        Object.assign(was, mover(path, now, ms));
      } else if (!arrived(was)) {
        // The sim's clock wins: still walking, due when it says; arrived, there now.
        was.arriveAt = pv.walk > 0 ? now + pv.walk * tickMs : Math.min(was.arriveAt, now + 120);
      }
      Object.assign(was, facts);
      return was;
    });
  }

  private ingestCartons(l: FloorLayout, w: WmsView, now: number, shipped: readonly { order: number; cents: number }[]): void {
    const byOrder = new Map(this.cartons.map((c) => [c.order, c]));
    const next: Carton[] = [];
    for (const o of w.orders) {
      const c = byOrder.get(o.no);
      const zone = zoneOf(o.status);
      if (zone !== null) {
        if (c === undefined) {
          const from = zone === 'pack' ? { x: l.zones.pack.left + 6, y: l.zones.pack.top + 6 } : slot(l.zones[zone], 99);
          next.push({ order: o.no, priority: o.priority, zone, short: o.shortUnits > 0, x: from.x, y: from.y, fromX: from.x, fromY: from.y, toX: from.x, toY: from.y, t0: now, leaving: false });
        } else {
          c.zone = zone;
          c.priority = o.priority;
          c.short = o.shortUnits > 0;
          next.push(c);
        }
      } else if (c !== undefined && !c.leaving && (o.status === 'SHIPPED' || o.status === 'ON HOLD')) {
        // Shipped: out with the truck. On hold: it waits where it is.
        if (o.status === 'SHIPPED') c.leaving = true;
        next.push(c);
      } else if (c !== undefined && c.leaving) next.push(c);
    }
    this.cartons = next;
    // Each zone's cartons in order number, each gliding to its space.
    for (const z of ZONES) {
      const here = this.cartons.filter((c) => c.zone === z && !c.leaving).sort((a, b) => a.order - b.order);
      here.forEach((c, i) => {
        const to = slot(l.zones[z], i);
        if (to.x === c.toX && to.y === c.toY) return;
        c.fromX = c.x;
        c.fromY = c.y;
        c.toX = to.x;
        c.toY = to.y;
        c.t0 = this.reduced ? now - GLIDE_MS : now;
      });
    }
    const dock = l.zones.truck;
    for (const s of shipped) {
      if (s.cents > 0) this.pops.push({ x: (dock.left + dock.right) / 2, y: dock.top + 6, text: `+${formatCash(s.cents)}`, at: now });
    }
  }

  /** Where the truck is drawn: 0 parked, up to 1 gone off the right edge; then it backs in from the right. */
  truckShift(now: number): number {
    if (this.truckOut === 0) return 0;
    const t = now - this.truckOut;
    if (t < TRUCK_OUT_MS) return t / TRUCK_OUT_MS;
    if (t < TRUCK_OUT_MS + TRUCK_IN_MS) return 1 - (t - TRUCK_OUT_MS) / TRUCK_IN_MS;
    return 0;
  }

  /** One frame: everything moves `dt` ms on towards where it is due. */
  advance(now: number, dt: number): void {
    // The truck leaves once every order loaded on it has shipped (each ships on its own, a few seconds apart).
    if (this.truckOut === 0 && this.cartons.some((c) => c.leaving) && !this.cartons.some((c) => c.zone === 'truck' && !c.leaving)) this.truckOut = now;
    for (const p of this.workers) move(p, now, dt);
    for (const t of this.totes) move(t, now, dt);
    this.totes = this.totes.filter((t) => !arrived(t));
    for (const c of this.cartons) {
      const k = Math.min(1, Math.max(0, (now - c.t0) / GLIDE_MS));
      const e = 1 - (1 - k) * (1 - k);
      c.x = c.fromX + (c.toX - c.fromX) * e;
      c.y = c.fromY + (c.toY - c.fromY) * e;
    }
    // The truck has gone with its shipped cartons; the next one is empty.
    if (this.truckOut > 0 && now - this.truckOut >= TRUCK_OUT_MS) {
      this.cartons = this.cartons.filter((c) => !c.leaving);
      if (now - this.truckOut >= TRUCK_OUT_MS + TRUCK_IN_MS) this.truckOut = 0;
    }
    this.flashes = this.flashes.filter((f) => now - f.at < FLASH_MS);
    this.pops = this.pops.filter((p) => now - p.at < POP_MS);
  }

  /** What is under a tap at (x, y): a worker (the nearest), a carton's order, a docked trailer's PO, or a bin. */
  hit(x: number, y: number, w: WmsView): { worker: number } | { order: number } | { po: number } | { aisle: number; bay: number } | null {
    const l = this.layout;
    if (l === null) return null;
    const near = (px: number, py: number, r: number): boolean => Math.hypot(px - x, py - y) <= r;
    let nearest: WorkerDot | null = null;
    for (const p of this.workers) if (near(p.x, p.y, 16) && (nearest === null || Math.hypot(p.x - x, p.y - y) < Math.hypot(nearest.x - x, nearest.y - y))) nearest = p;
    if (nearest !== null) return { worker: nearest.id };
    for (const c of this.cartons) if (!c.leaving && near(c.x, c.y, 10)) return { order: c.order };
    for (const po of w.pos) {
      if (po.status !== 'RECEIVING' || po.door === 0) continue;
      const r = l.doors[po.door - 1];
      if (r !== undefined && x >= r.left && x <= r.right && y >= r.top - 4 && y <= r.bottom + 4) return { po: po.no };
    }
    for (const s of w.stock) {
      const cell = binCell(l, s.aisle, s.bay);
      if (x >= cell.left - 3 && x <= cell.right + 3 && y >= cell.top - 4 && y <= cell.bottom + 4) return { aisle: s.aisle, bay: s.bay };
    }
    return null;
  }
}
