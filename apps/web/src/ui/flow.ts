import type { WarehouseEvent, WarehouseView } from '@warehouse/contracts';

/**
 * Goods moving across the warehouse floor (RULES 14), in the order a real
 * warehouse moves them: cartons come off the PO at the inbound dock, pass
 * quality check and a forklift puts each away into a reserve location; reach
 * trucks replenish the floor pick locations from reserve as they run low;
 * orders come in at the order desk and wait on the order board; a picker
 * takes the board's oldest order down an aisle, picks a carton from a floor
 * pick location (from reserve when the floor is bare) and carries it out to
 * the staging lanes; and a carton walks from its staging lane to the outbound
 * dock for each order a truck loads. Pure bookkeeping on numbers from the
 * View; the Floor component measures the page and draws (P7: a canvas, never
 * React).
 *
 * Everything shown is the real flow. The tickets on the board are the real
 * backlog (RULES 3): the head leaves as fast as the sim picks, so the board
 * fills when picking (or stock) falls behind. The full rack locations are the
 * real stock, less what is still on a forklift and plus what a picker has not
 * yet taken: a location fills when its forklift drops and empties when its
 * picker reaches it. How the stock splits between floor pick and reserve is
 * for show (the sim has one stock). The staged cartons are the real staged
 * count, and the cartons in each truck its real load. The order desk, quality
 * check and export stations are scenery. One dot stands for `perDot` orders
 * or units, chosen so a few dots a second move however big the warehouse
 * grows.
 */

export interface Span {
  readonly left: number;
  readonly right: number;
}

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

/** One carton location in the racks, and the aisle (its y) it is reached from. */
export interface Slot extends Point {
  readonly aisle: number;
}

/** The rack locations: floor pick at the front of each run (by the board), reserve behind (by the cross aisle). */
export interface RackSlots {
  readonly face: readonly Slot[];
  readonly reserve: readonly Slot[];
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
  /** The inbound dock: cartons leave the PO at `start` and pass the stations along `y`. */
  readonly inbound: { readonly y: number; readonly start: number; readonly booths: readonly Span[] };
  /** Where new orders come in, and the order desk they pass. */
  readonly door: Point;
  readonly checkin: Span & { readonly y: number };
  /** The order board: the backlog waits here as tickets, oldest first, top left. */
  readonly board: Rect;
  /**
   * The storage racks: `mouth` is where pickers enter the aisles (beside the
   * board), `cross` the cross aisle down their far end, `aisles` each aisle's
   * y, `face` the floor pick locations and `reserve` the reserve ones.
   */
  readonly racks: { readonly mouth: number; readonly cross: number; readonly aisles: readonly number[] } & RackSlots;
  /** Stations after picking (export paperwork, customs), in order, on the staging row. */
  readonly after: readonly Span[];
  readonly afterY: number;
  /** The staging area, and in it one lane per dock where its cartons wait. */
  readonly staging: Rect;
  readonly lanes: readonly Rect[];
  /** Each lane's carton spaces (`laneSpots`), worked out once per layout. */
  readonly laneSpots: readonly (readonly Point[])[];
  /** The aisle down the middle of the bays, from staging (`top`) down. */
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

/**
 * `dep`: a new order, then the picker carrying the carton picked for it;
 * `board`: a staged carton on its way to its truck; `arr`: stock on its way
 * to a reserve location (a forklift once past quality check); `rep`: a reach
 * truck replenishing a floor pick location from reserve; `away`: a cancelled
 * order.
 */
export type DotKind = 'dep' | 'board' | 'arr' | 'rep' | 'away';
/** `out`: an order ticket; `box`: a carton; `away`: a cancelled order. */
export type Tint = 'out' | 'box' | 'express' | 'away';

/** Where a new order is: at the order desk, on the board, being picked, carried to staging. */
export type DepPhase = 'desk' | 'board' | 'pick' | 'carry';

export interface Dot {
  readonly kind: DotKind;
  /** A ticket becomes a carton when it is picked. */
  tint: Tint;
  readonly dock: number;
  /** A little sideways spread so a crowd looks like goods on the move, not beads. */
  readonly jy: number;
  /** False until its first frame puts it where it starts. */
  placed: boolean;
  x: number;
  y: number;
  /** Which step of its walk it is on. */
  leg: number;
  /** Orders only: where it is. */
  phase: DepPhase;
  /** The rack location it picks from, puts away to or (a reach truck) lifts from, or (carried) its staging lane; -1 until chosen. */
  slot: number;
  /** A picker: whether `slot` is a floor pick location (else reserve). */
  face: boolean;
  /** A reach truck: the floor pick location it drops at. */
  to: number;
  /** Stock it carries, milli-units (0 once dropped). */
  amt: number;
  /** Which way it last moved across the screen: +1 right, -1 left. */
  dir: number;
  /** Queued at a station or reaching into a rack: from `start`, done at `release` (ms). */
  start: number;
  release: number;
  alpha: number;
  age: number;
}

/** Walking (and driving) speeds, px a second. */
const SPEED: Readonly<Record<DotKind, number>> = { dep: 52, board: 150, arr: 70, rep: 85, away: 40 };
/** Pickers walk the aisles briskly. */
const PICK_SPEED = 120;
/** Shuffling up the order board. */
const BOARD_SPEED = 80;
/** Time inside a station, ms. */
const SERVICE_DEP = 150;
const SERVICE_ARR = 110;
/** Time reaching into a rack, ms. */
const PICK_MS = 220;
/** Time a forklift's forks take to set down or lift a pallet, ms. */
const LIFT_MS = 260;
/** Floor pick locations: a reach truck sets off when they hold less than LOW of their room, and fills them back up to FULL. */
const REPLEN_LOW = 0.6;
const REPLEN_FULL = 0.85;
/** Most a reach truck lifts at once, a share of the floor pick room: a pallet. */
const PALLET = 0.12;
/** Reach trucks per aisle, and the gap between two setting off, ms. */
const TRUCKS_PER_AISLE = 2;
const TRUCK_GAP = 300;
/** How long a flash marks a location that just filled or emptied, ms. */
export const MARK_MS = 450;
/** Space between orders queuing at a station, px. */
const QUEUE_GAP = 5;
/** Ticket and carton spacing on the board, in the racks and in staging, px; a full board squeezes up to the smallest. */
export const PITCH = 5;
const PITCH_MIN = 2.5;
/** Most dots spawned on one update and alive at once: the frame budget on a slow phone. */
const SPAWN_MAX = 6;
export const DOTS_MAX = 260;
/** Most tickets on the board: past this a dot stands for more of the backlog. */
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
 * The parcels of a truck filling the box (a trailer seen from above, cab up):
 * rows across with an aisle down the middle, front row first and, within a
 * row, from the aisle out, so a filling truck fills from the front.
 */
export function parcelSpots(box: Rect): Point[] {
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

/**
 * Every carton location in the racks, row by row, each reached from the
 * nearest aisle: those left of `split` are floor pick locations, the rest
 * reserve.
 */
export function rackSlots(racks: readonly Rect[], aisles: readonly number[], split: number): RackSlots {
  const face: Slot[] = [];
  const reserve: Slot[] = [];
  for (const r of racks) {
    const cols = Math.floor((r.right - r.left) / PITCH);
    const rows = Math.max(1, Math.floor((r.bottom - r.top) / PITCH));
    const x0 = (r.left + r.right) / 2 - ((cols - 1) * PITCH) / 2;
    const y0 = (r.top + r.bottom) / 2 - ((rows - 1) * PITCH) / 2;
    for (let row = 0; row < rows; row++) {
      const y = y0 + row * PITCH;
      let aisle = aisles[0] ?? y;
      for (const a of aisles) if (Math.abs(a - y) < Math.abs(aisle - y)) aisle = a;
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * PITCH;
        (x < split ? face : reserve).push({ x, y, aisle });
      }
    }
  }
  return { face, reserve };
}

/** Where the `i`th of `n` tickets stands on the board: rows from the top left, squeezed up when they do not fit. */
export function boardSpot(board: Rect, i: number, n: number): Point {
  const w = Math.max(1, board.right - board.left);
  const h = Math.max(1, board.bottom - board.top);
  const fits = Math.floor(w / PITCH) * Math.floor(h / PITCH);
  const pitch = n <= fits ? PITCH : Math.max(PITCH_MIN, Math.sqrt((w * h) / n) * 0.97);
  const cols = Math.max(1, Math.floor(w / pitch));
  const row = Math.floor(i / cols);
  return { x: board.left + pitch / 2 + (i % cols) * pitch, y: Math.min(board.bottom - 1, board.top + pitch / 2 + row * pitch) };
}

/** A staging lane's carton spaces, from the dock end (the bottom) up. */
export function laneSpots(lane: Rect): Point[] {
  const cols = Math.max(1, Math.floor((lane.right - lane.left - 2) / PITCH));
  const rows = Math.max(1, Math.floor((lane.bottom - lane.top - 2) / PITCH));
  const x0 = (lane.left + lane.right) / 2 - ((cols - 1) * PITCH) / 2;
  const spots: Point[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) spots.push({ x: x0 + c * PITCH, y: lane.bottom - 1 - PITCH / 2 - r * PITCH });
  }
  return spots;
}

/** How many of `filled` staged cartons stand in lane `i` of `lanes`: shared out evenly, the first lanes taking the odd ones. */
export function laneCount(filled: number, lanes: number, i: number): number {
  if (lanes <= 0) return 0;
  return Math.floor(filled / lanes) + (i < filled % lanes ? 1 : 0);
}

/** A rack location that just filled or emptied, outlined for a moment: by a put-away forklift, a picker or a reach truck. */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly kind: 'put' | 'pick' | 'rep';
  readonly at: number;
}

/** Where the next locations to fill or empty are: next to the forklift, truck or picker that just got there. */
interface Hint {
  readonly face: boolean;
  readonly fill: boolean;
  readonly x: number;
  readonly y: number;
  readonly until: number;
}

export class FlowModel {
  readonly dots: Dot[] = [];
  /** The order board in walking order, head first: each ticket from the moment it reaches the board. */
  readonly queue: Dot[] = [];
  perDot = 1;
  /** The staging lanes: share of their space in use, 0-1 (the real staged count). */
  staging = 0;
  /** Recently cancelled orders (a full backlog). */
  turningAway = false;
  /** Tickets the real backlog stands for now. */
  lineDots = 0;
  /** Each dock's parked truck: what its parcels show. */
  loads: Load[] = [];
  /** The racks: share of their space the real stock fills, 0-1. */
  shelves = 0;
  /** Which rack locations hold stock (1) or stand bare (0), in the geometry's order: floor pick, and reserve. */
  face = new Uint8Array(0);
  reserve = new Uint8Array(0);
  /** Locations that just filled or emptied, oldest first. */
  readonly marks: Mark[] = [];
  /** Reach trucks out replenishing the floor pick locations. */
  replens = 0;
  /** Counts up whenever what stands still (the rack locations, the staging lanes, the trucks' loads) changes: the canvas redraws those only then. */
  still = 0;
  private prev: WarehouseView | null = null;
  private accDep = 0;
  private accAway = 0;
  private accBoard: number[] = [];
  /** Tickets picking has taken off the board that have not yet left it. */
  private cleared = 0;
  private accIn = 0;
  private busy = new Map<string, number>();
  private seed = 1;
  private awayUntil = 0;
  private nextLane = 0;
  /** The real stock and the racks' room, milli-units. */
  private stock = 0;
  private shelfCap = 0;
  /** Stock on the floor pick locations, milli-units (the rest is in reserve); null until first worked out. */
  private onFace: number | null = null;
  /** Stock in reserve, milli-units, as of the last frame. */
  private inReserve = 0;
  private faceCount = 0;
  private reserveCount = 0;
  private hints: Hint[] = [];
  private nextTruck = 0;
  /** New orders on their way to the board, as of the last frame. */
  private atDesk = 0;

  /** Takes one update from the host. `now` is the animation clock in ms. */
  ingest(view: WarehouseView, events: readonly WarehouseEvent[], now: number): void {
    const prev = this.prev;
    this.prev = view;
    this.still += 1;
    this.staging = view.staging.cap === 0 ? 0 : Math.min(1, view.staging.staged / view.staging.cap);
    this.stock = view.receiving.stock;
    this.shelfCap = view.receiving.shelfCap;
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
    // Picking took whatever left the backlog (RULES 3).
    this.cleared += Math.max(0, prev.picking.backlog + joined - view.picking.backlog) / unit;

    // Stock put away since the last update: the rest of a finished PO, then the new one (RULES 3a).
    const was = prev.receiving.po;
    const po = view.receiving.po;
    const received = po.id === was.id ? Math.max(0, po.received - was.received) : Math.max(0, was.units * 1000 - was.received) + po.received;
    this.accIn = this.spawn(this.accIn + received, unit, () => this.add('arr', 'box', -1));

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
      this.accBoard[i] = this.spawn((this.accBoard[i] ?? 0) + loaded, unit, () => this.add('board', 'box', i));
    });
  }

  /** Moves everyone `dt` ms on, then settles the racks and sends out reach trucks. Call once a frame with the latest geometry. */
  advance(dt: number, now: number, geo: FlowGeometry): void {
    this.fit(geo);
    this.fillBoard(geo);
    this.walkBoard(dt, geo);
    // What the racks are owed or missing, counted on the way: stock still on a forklift, picks not yet taken, pallets in the air.
    let putting = 0;
    let owed = this.cleared * this.perDot * 1000;
    let waiting = 0;
    let lifted = 0;
    let trucks = 0;
    let desk = 0;
    let kept = 0;
    let lostTicket = false;
    for (const d of this.dots) {
      // Waiting on the board is not being lost.
      if (d.phase !== 'board') d.age += dt;
      if (d.age < MAX_AGE && this.move(d, dt, now, geo)) {
        this.dots[kept++] = d;
        if (d.kind === 'arr') putting += d.amt;
        else if (d.kind === 'dep') {
          if (d.phase === 'pick' && d.leg < 3) owed += d.amt;
          else if (d.phase === 'desk') desk += 1;
        } else if (d.kind === 'rep') {
          trucks += 1;
          if (d.leg < 2) waiting += d.amt;
          else lifted += d.amt;
        }
      } else if (d.kind === 'dep' && d.phase === 'board') lostTicket = true;
    }
    this.dots.length = kept;
    this.atDesk = desk;
    this.replens = trucks;
    if (lostTicket) {
      const alive = new Set(this.dots);
      const left = this.queue.filter((d) => alive.has(d));
      this.queue.length = 0;
      this.queue.push(...left);
    }
    while (this.marks.length > 0 && now - (this.marks[0] as Mark).at > MARK_MS) this.marks.shift();
    if (this.hints.length > 0) this.hints = this.hints.filter((h) => h.until > now);
    this.settle(geo, putting, owed, lifted);
    this.replenish(now, geo, trucks, waiting, waiting + lifted);
  }

  /** Forget everyone walking (a new warehouse, or back from a long absence). The real backlog and stock are filled in again on the next frame. */
  reset(): void {
    this.dots.length = 0;
    this.queue.length = 0;
    this.marks.length = 0;
    this.hints = [];
    this.accIn = 0;
    this.accDep = 0;
    this.accAway = 0;
    this.accBoard = [];
    this.cleared = 0;
    this.onFace = null;
    this.replens = 0;
    this.still += 1;
    this.busy.clear();
  }

  /** Sizes the locations to the racks drawn: a new layout starts bare and is filled in from the stock. */
  private fit(geo: FlowGeometry): void {
    if (this.face.length !== geo.racks.face.length) {
      this.face = new Uint8Array(geo.racks.face.length);
      this.faceCount = 0;
    }
    if (this.reserve.length !== geo.racks.reserve.length) {
      this.reserve = new Uint8Array(geo.racks.reserve.length);
      this.reserveCount = 0;
    }
  }

  /**
   * Fills and empties locations until the racks hold the real stock, less
   * what forklifts and reach trucks are carrying and plus what pickers are on
   * their way to take: each change next to whoever just made it, so a
   * location fills when its forklift drops and empties when its picker
   * reaches it. The floor pick share keeps within what each part can hold.
   */
  private settle(geo: FlowGeometry, putting: number, owed: number, lifted: number): void {
    const nf = this.face.length;
    const n = nf + this.reserve.length;
    const cap = this.shelfCap;
    let wantFace = 0;
    let wantReserve = 0;
    if (cap > 0 && n > 0) {
      const avail = Math.max(0, Math.min(cap, this.stock - putting + owed - lifted));
      const faceRoom = (cap * nf) / n;
      const f = Math.max(0, avail - (cap - faceRoom), Math.min(this.onFace ?? faceRoom * REPLEN_FULL, avail, faceRoom));
      this.onFace = f;
      this.inReserve = avail - f;
      // Rounded once in all, so the locations always add up to the stock.
      wantFace = Math.min(nf, Math.round((f / cap) * n));
      wantReserve = Math.max(0, Math.min(this.reserve.length, Math.round((avail / cap) * n) - wantFace));
    }
    this.faceCount = this.adjust(this.face, this.faceCount, wantFace, geo.racks.face, true);
    this.reserveCount = this.adjust(this.reserve, this.reserveCount, wantReserve, geo.racks.reserve, false);
  }

  private adjust(cells: Uint8Array, count: number, want: number, slots: readonly Slot[], face: boolean): number {
    if (count !== want) this.still += 1;
    while (count < want) {
      const i = this.choose(cells, slots, face, 0);
      if (i < 0) break;
      cells[i] = 1;
      count += 1;
    }
    while (count > want) {
      const i = this.choose(cells, slots, face, 1);
      if (i < 0) break;
      cells[i] = 0;
      count -= 1;
    }
    return count;
  }

  /** A location holding `has`: the nearest to the latest hint for it, else one at random. */
  private choose(cells: Uint8Array, slots: readonly Slot[], face: boolean, has: 0 | 1): number {
    for (let k = this.hints.length - 1; k >= 0; k--) {
      const h = this.hints[k] as Hint;
      if (h.face !== face || h.fill !== (has === 0)) continue;
      let best = -1;
      let dist = Infinity;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] !== has) continue;
        const s = slots[i] as Slot;
        const dd = (s.x - h.x) * (s.x - h.x) + (s.y - h.y) * (s.y - h.y) * 4;
        if (dd < dist) {
          dist = dd;
          best = i;
        }
      }
      return best;
    }
    return this.any(cells, has);
  }

  /** A location holding `has`, at random; -1 if there is none. */
  private any(cells: Uint8Array, has: 0 | 1, aisle?: number, slots?: readonly Slot[]): number {
    const n = cells.length;
    const start = Math.floor(((this.jitter() + 1) / 2) * n);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (cells[i] === has && (aisle === undefined || slots?.[i]?.aisle === aisle)) return i;
    }
    return -1;
  }

  private hint(face: boolean, fill: boolean, at: Point, now: number): void {
    this.hints.push({ face, fill, x: at.x, y: at.y, until: now + 300 });
  }

  private mark(at: Point, kind: Mark['kind'], now: number): void {
    if (this.marks.length < 64) this.marks.push({ x: at.x, y: at.y, kind, at: now });
  }

  /**
   * Sends a reach truck when the floor pick locations run low (counting what
   * is already on its way): it lifts a pallet off a full reserve location
   * and sets it down in a bare floor pick location along the same aisle.
   */
  private replenish(now: number, geo: FlowGeometry, trucks: number, waiting: number, coming: number): void {
    const nf = this.face.length;
    const n = nf + this.reserve.length;
    const cap = this.shelfCap;
    if (cap <= 0 || nf === 0 || n === nf || this.onFace === null) return;
    const faceRoom = (cap * nf) / n;
    if (this.onFace + coming >= faceRoom * REPLEN_LOW) return;
    if (now < this.nextTruck || trucks >= TRUCKS_PER_AISLE * Math.max(1, geo.racks.aisles.length) || this.dots.length >= DOTS_MAX) return;
    const amt = Math.min(this.inReserve - waiting, faceRoom * REPLEN_FULL - this.onFace - coming, faceRoom * PALLET);
    if (amt < cap / n) return;
    const from = this.any(this.reserve, 1);
    const src = geo.racks.reserve[from];
    if (src === undefined) return;
    let to = this.any(this.face, 0, src.aisle, geo.racks.face);
    if (to < 0) to = this.any(this.face, 1, src.aisle, geo.racks.face);
    if (to < 0) return;
    this.nextTruck = now + TRUCK_GAP;
    this.dots.push({ ...this.fresh('rep', 'box', -1), amt, slot: from, to, placed: true, x: geo.racks.cross, y: src.aisle, dir: -1 });
  }

  /**
   * Keeps the board as long as the real backlog: orders already waiting that
   * the tickets have not caught up with (a reload, a quiet catch-up, more
   * arriving in a tick than a frame spawns) appear at the back; a board
   * longer than the backlog lets its head go.
   */
  private fillBoard(geo: FlowGeometry): void {
    const missing = this.lineDots - this.queue.length - this.atDesk;
    if (missing > 2) {
      for (let i = 0; i < missing && this.dots.length < DOTS_MAX; i++) {
        this.add('dep', 'out', -1);
        const d = this.dots[this.dots.length - 1] as Dot;
        d.phase = 'board';
        d.placed = true;
        const at = boardSpot(geo.board, this.queue.length, this.lineDots);
        d.x = at.x;
        d.y = at.y;
        this.queue.push(d);
      }
    }
    const extra = this.queue.length - this.lineDots;
    if (extra > 2 && this.cleared < 1) this.cleared += 1;
    this.cleared = Math.min(this.cleared, this.queue.length);
  }

  /** The tickets shuffle up the board; a picker takes the head whenever the sim picks one. */
  private walkBoard(dt: number, geo: FlowGeometry): void {
    const n = Math.max(this.queue.length, this.lineDots);
    const step = (BOARD_SPEED * dt) / 1000;
    this.queue.forEach((d, i) => {
      const at = boardSpot(geo.board, i, n);
      toward(d, at.x, at.y, step);
    });
    // As many as picking cleared go, as each reaches the head of the board.
    while (this.cleared > 1 - 1e-6) {
      const head = this.queue[0];
      if (head === undefined) break;
      const at = boardSpot(geo.board, 0, n);
      if (Math.hypot(head.x - at.x, head.y - at.y) > PITCH * 1.5) break;
      this.queue.shift();
      this.cleared -= 1;
      head.phase = 'pick';
      head.leg = 0;
      // A full floor pick location; reserve when the floor is bare.
      head.slot = this.any(this.face, 1);
      head.face = head.slot >= 0;
      if (!head.face) head.slot = this.any(this.reserve, 1);
      head.start = 0;
      head.release = 0;
    }
  }

  /** Where a stock carton goes: a bare reserve location; a bare floor pick one when reserve is full. */
  private putSlot(d: Dot): void {
    d.slot = this.any(this.reserve, 0);
    d.face = d.slot < 0;
    if (d.face) d.slot = this.any(this.face, 0);
  }

  /** Spawns a dot per `unit` in `acc` (at most SPAWN_MAX) and returns the remainder. */
  private spawn(acc: number, unit: number, make: () => void): number {
    let n = Math.floor(acc / unit);
    const rest = acc - n * unit;
    n = Math.min(n, SPAWN_MAX);
    for (let i = 0; i < n; i++) make();
    return rest;
  }

  private fresh(kind: DotKind, tint: Tint, dock: number): Dot {
    return { kind, tint, dock, jy: this.jitter() * 3, placed: false, x: 0, y: 0, leg: 0, phase: 'desk', slot: -1, face: false, to: -1, amt: this.perDot * 1000, dir: 1, start: 0, release: 0, alpha: 1, age: 0 };
  }

  private add(kind: DotKind, tint: Tint, dock: number): void {
    if (this.dots.length >= DOTS_MAX) return;
    this.dots.push(this.fresh(kind, tint, dock));
  }

  /** Puts a new dot where its walk starts. */
  private place(d: Dot, geo: FlowGeometry): void {
    d.placed = true;
    if (d.kind === 'board') {
      // Off the front of its dock's staging lane.
      const lane = geo.lanes[d.dock] ?? geo.lanes[d.dock % Math.max(1, geo.lanes.length)];
      d.x = lane === undefined ? geo.pier.x : (lane.left + lane.right) / 2 + d.jy;
      d.y = (lane?.bottom ?? geo.staging.bottom) - 2;
    } else if (d.kind === 'arr') {
      // Off the PO at the inbound dock.
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
        return this.depart(d, dt, step, now, geo);
      case 'board': {
        // Out of the lane to the head of the aisle, down it, along the walkway to the bay's door, then aboard.
        const at = geo.docks[d.dock];
        if (at === undefined) return false;
        const j = d.jy * 0.4;
        const x = geo.pier.x - 1.5;
        if (d.leg === 0) {
          if (toward(d, d.x, geo.pier.top, step)) d.leg = 1;
          return true;
        }
        if (d.leg === 1) {
          if (toward(d, x, geo.pier.top, step)) d.leg = 2;
          return true;
        }
        if (d.leg === 2) {
          if (toward(d, x, at.door + j, step)) d.leg = 3;
          return true;
        }
        if (d.leg === 3) {
          if (toward(d, at.x, at.door + j, step)) d.leg = 4;
          return true;
        }
        return !toward(d, at.x, at.y, step);
      }
      case 'arr':
        return this.putAway(d, step, now, geo);
      case 'rep':
        return this.replen(d, step, now, geo);
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

  /**
   * Stock: through the stations on the inbound dock, then a forklift takes
   * it down the cross aisle and along an aisle to its location, sets it down
   * (the location fills) and backs out to the cross aisle.
   */
  private putAway(d: Dot, step: number, now: number, geo: FlowGeometry): boolean {
    const lane = geo.inbound;
    const n = lane.booths.length;
    if (d.leg < n) {
      const booth = lane.booths[d.leg] as Span;
      const back = d.leg === 0 ? lane.start : (lane.booths[d.leg - 1] as Span).right + 2;
      return this.checkpoint(d, now, `i${d.leg}`, SERVICE_ARR, booth, back, +1, step, lane.y);
    }
    if (d.slot < 0) this.putSlot(d);
    const slot = (d.face ? geo.racks.face : geo.racks.reserve)[d.slot];
    const cross = geo.racks.cross;
    if (slot === undefined) return !toward(d, cross, lane.y, step);
    switch (d.leg - n) {
      case 0:
        if (toward(d, cross, lane.y + d.jy * 0.6, step)) d.leg += 1;
        return true;
      case 1:
        if (toward(d, cross, slot.aisle, step)) d.leg += 1;
        return true;
      case 2:
        if (toward(d, slot.x, slot.aisle, step)) {
          d.leg += 1;
          d.start = -1;
          d.release = now + LIFT_MS;
        }
        return true;
      case 3:
        if (now >= d.release) {
          d.leg += 1;
          if (d.face) this.onFace = (this.onFace ?? 0) + d.amt;
          d.amt = 0;
          this.hint(d.face, true, slot, now);
          this.mark(slot, 'put', now);
        }
        return true;
      default:
        return !toward(d, cross, slot.aisle, step);
    }
  }

  /** A reach truck: from the cross aisle to its reserve location, lift, along to the floor pick location, set down, back. */
  private replen(d: Dot, step: number, now: number, geo: FlowGeometry): boolean {
    const src = geo.racks.reserve[d.slot];
    const dst = geo.racks.face[d.to];
    if (src === undefined || dst === undefined) return false;
    switch (d.leg) {
      case 0:
        if (toward(d, src.x, src.aisle, step)) {
          d.leg = 1;
          d.start = -1;
          d.release = now + LIFT_MS;
        }
        return true;
      case 1:
        if (now >= d.release) {
          d.leg = 2;
          this.hint(false, false, src, now);
          this.mark(src, 'rep', now);
        }
        return true;
      case 2:
        if (toward(d, dst.x, dst.aisle, step)) {
          d.leg = 3;
          d.release = now + LIFT_MS;
        }
        return true;
      case 3:
        if (now >= d.release) {
          d.leg = 4;
          this.onFace = (this.onFace ?? 0) + d.amt;
          d.amt = 0;
          this.hint(true, true, dst, now);
          this.mark(dst, 'rep', now);
        }
        return true;
      default:
        return !toward(d, geo.racks.cross, dst.aisle, step);
    }
  }

  /** A new order: the order desk, the board (moved by `walkBoard`), a picker's trip into the racks, the stations after, a staging lane. */
  private depart(d: Dot, dt: number, step: number, now: number, geo: FlowGeometry): boolean {
    switch (d.phase) {
      case 'desk': {
        if (d.leg === 0) return this.checkpoint(d, now, 'desk', SERVICE_DEP, geo.checkin, geo.door.x, +1, step, geo.checkin.y);
        // Onto the back of the board.
        const at = boardSpot(geo.board, this.queue.length, Math.max(this.queue.length + 1, this.lineDots));
        if (toward(d, at.x, at.y, step * 1.4)) {
          d.phase = 'board';
          this.queue.push(d);
        }
        return true;
      }
      case 'board':
        return true;
      case 'pick':
        return this.pick(d, (PICK_SPEED * dt) / 1000, now, geo);
      case 'carry': {
        const booth = geo.after[d.leg];
        if (booth === undefined) {
          // Into a staging lane, on top of its stack (the stacks are drawn from the real count).
          if (d.slot < 0) d.slot = geo.lanes.length === 0 ? 0 : this.nextLane++ % geo.lanes.length;
          const lane = geo.lanes[d.slot] ?? geo.staging;
          const top = lane.bottom - (lane.bottom - lane.top) * this.staging;
          const y = Math.max(lane.top + 2, Math.min(lane.bottom - 2, top));
          return !toward(d, (lane.left + lane.right) / 2 + d.jy, y, step * 1.4);
        }
        const back = d.leg === 0 ? geo.racks.cross : (geo.after[d.leg - 1] as Span).left - 2;
        return this.checkpoint(d, now, `p${d.leg}`, SERVICE_DEP, booth, back, -1, step, geo.afterY);
      }
    }
  }

  /**
   * A picker's trip: into the aisle beside the board, along to the location,
   * reaching in for the carton (the ticket becomes a carton, the location
   * empties), out along the aisle to the cross aisle and down it to the
   * staging row.
   */
  private pick(d: Dot, step: number, now: number, geo: FlowGeometry): boolean {
    const r = geo.racks;
    const slot = (d.face ? r.face : r.reserve)[d.slot];
    const aisle = slot?.aisle ?? r.aisles[0] ?? geo.afterY;
    const done = (): void => {
      d.phase = 'carry';
      d.leg = 0;
      d.slot = -1;
      d.start = 0;
      d.release = 0;
      d.tint = 'box';
    };
    switch (d.leg) {
      case 0:
        if (toward(d, r.mouth, aisle, step)) d.leg = slot === undefined ? 4 : 1;
        return true;
      case 1:
        if (toward(d, (slot as Slot).x, aisle, step)) d.leg = 2;
        return true;
      case 2:
        if (toward(d, (slot as Slot).x, (slot as Slot).y, step * 0.5)) {
          d.leg = 3;
          d.start = now;
          d.release = now + PICK_MS;
          d.tint = 'box';
          if (d.face) this.onFace = Math.max(0, (this.onFace ?? 0) - d.amt);
          this.hint(d.face, false, slot as Slot, now);
          this.mark(slot as Slot, 'pick', now);
        }
        return true;
      case 3:
        if (now >= d.release && toward(d, d.x, aisle, step * 0.5)) {
          d.leg = 4;
          d.start = 0;
          d.release = 0;
        }
        return true;
      case 4:
        if (toward(d, r.cross, aisle, step)) d.leg = 5;
        return true;
      default:
        if (toward(d, r.cross, geo.afterY + d.jy, step)) done();
        return true;
    }
  }

  /**
   * Walking to a station (`dir` +1 walks right, -1 left), queuing behind
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
  if (Math.abs(dx) > 0.05) d.dir = dx > 0 ? 1 : -1;
  if (dist <= step || dist === 0) {
    d.x = x;
    d.y = y;
    return true;
  }
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
  return false;
}

/** Hidden while inside a station; a picker reaching into a rack and a forklift lifting (`start` -1) stay in view. */
export function visible(d: Dot, now: number): boolean {
  if (d.phase === 'pick') return true;
  return !(d.release > 0 && d.start >= 0 && now >= d.start);
}
