import type { FriendType, SnackEnd, SnackId, SquareKind, WaveResult } from '@snacks/contracts';

/**
 * The wave replay worked out as a timeline (RULES 7, K9): where every snack
 * is at every moment, and when each friend catches, each lunchbox opens and
 * each kid reacts. It comes from the wave result alone, so the animation
 * shows exactly what the sim decided: a snack takes one beat from its
 * lunchbox to its picker and a beat for every square after (a Bouncer hop is
 * its beats), and a kid reacts when the first snack reaches them.
 *
 * Pure numbers, no DOM: replay.ts turns it into CSS animations (P7).
 * Positions are in squares (the centre of square x, y is x, y), times in ms.
 */

/** The board as it stood when Go was pressed: what the replay needs of the View. */
export interface BoardAtGo {
  readonly width: number;
  readonly height: number;
  readonly squares: readonly SquareKind[];
  readonly friends: readonly { readonly id: number; readonly type: FriendType; readonly cell: number }[];
  readonly kids: readonly { readonly id: number; readonly cell: number }[];
}

/** One moment of a flight: where the snack is over the ground, and how high. */
export interface FlightPoint {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  /** Height above the ground, in squares. */
  readonly lift: number;
}

export interface Flight {
  readonly snack: SnackId;
  readonly lunchbox: number;
  /** The friend who took it from the lunchbox and threw it first; -1 if nobody threw it. */
  readonly picker: number;
  readonly points: readonly FlightPoint[];
  /** When it reached where its route ended (a kid, a friend, the edge...). */
  readonly arrive: number;
  /** When it is gone. */
  readonly end: number;
  readonly ending: SnackEnd;
  /** It fades away at the end (every snack does: eaten, bounced off, lost). */
  readonly fade: boolean;
  /** It spins in the air (not in the calm version). */
  readonly spin: boolean;
}

export type Reaction = 'yum' | 'ache' | 'shake';

export type TimelineEvent =
  | { readonly kind: 'pickup'; readonly cell: number; readonly at: number }
  | { readonly kind: 'catch'; readonly cell: number; readonly at: number }
  | { readonly kind: 'react'; readonly kid: number; readonly cell: number; readonly mood: Reaction; readonly at: number }
  | { readonly kind: 'heal'; readonly kid: number; readonly cell: number; readonly nurse: number; readonly at: number; readonly ms: number }
  | { readonly kind: 'walk'; readonly kid: number; readonly cell: number; readonly mood: 'yum' | 'sad'; readonly to: readonly [number, number]; readonly at: number; readonly ms: number };

export interface Timeline {
  readonly flights: readonly Flight[];
  readonly events: readonly TimelineEvent[];
  /** When the last snack is gone. */
  readonly flightsEnd: number;
  readonly duration: number;
}

export interface TimelineOptions {
  readonly beatMs: number;
  /** prefers-reduced-motion: snacks glide without arcs or spins, kids don't dance. */
  readonly calm: boolean;
  /** The Nurse's reach (`nurseRange`), from the host. */
  readonly healRange: number;
}

/** Steps each throw is cut into, so the arc is smooth. */
const STEPS = 6;

/** How high a throw goes, in squares: lines skim, a Short hops, a Bouncer jumps high. */
function liftOf(by: FriendType, squares: number): number {
  if (by === 'bouncer') return 0.85;
  if (by === 'short') return 0.32;
  return Math.min(0.5, 0.12 + 0.05 * squares);
}

const REACT_END: Partial<Record<SnackEnd, Reaction>> = { fed: 'yum', ache: 'ache', bounced: 'shake' };

/** The point of a flight at time t: between the two points around it, in a straight line. */
export function pointAt(flight: Flight, t: number): FlightPoint {
  const pts = flight.points;
  if (t <= pts[0]!.t) return pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i]!;
    if (t <= b.t) {
      const a = pts[i - 1]!;
      const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { t, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, lift: a.lift + (b.lift - a.lift) * u };
    }
  }
  return pts[pts.length - 1]!;
}

/** One throw as points: along the ground from a to b, with a parabola of height `lift`. */
function arc(points: FlightPoint[], t0: number, ms: number, a: readonly [number, number], b: readonly [number, number], lift: number): void {
  for (let i = 1; i <= STEPS; i++) {
    const u = i / STEPS;
    points.push({ t: t0 + ms * u, x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, lift: lift * 4 * u * (1 - u) });
  }
}

const xy = (cell: number, width: number): [number, number] => [cell % width, Math.floor(cell / width)];

export function waveTimeline(board: BoardAtGo, wave: WaveResult, options: TimelineOptions): Timeline {
  const { beatMs, calm } = options;
  const { width, height } = board;
  const flights: Flight[] = [];
  const events: TimelineEvent[] = [];
  const firstAt = new Map<number, { at: number; mood: Reaction }>();
  const boxes = new Set<number>();

  for (const trace of wave.snacks) {
    const box = xy(trace.lunchbox, width);
    const points: FlightPoint[] = [{ t: 0, x: box[0], y: box[1], lift: 0 }];
    if (!boxes.has(trace.lunchbox)) {
      boxes.add(trace.lunchbox);
      events.push({ kind: 'pickup', cell: trace.lunchbox, at: 0 });
    }
    let t = 0;
    const first = trace.hops[0];
    if (first !== undefined) {
      arc(points, t, beatMs, box, [first.fromX, first.fromY], calm ? 0 : 0.2);
      t += beatMs;
    }
    trace.hops.forEach((hop, i) => {
      const ms = hop.beats * beatMs;
      const squares = Math.max(Math.abs(hop.toX - hop.fromX), Math.abs(hop.toY - hop.fromY));
      arc(points, t, ms, [hop.fromX, hop.fromY], [hop.toX, hop.toY], calm ? 0 : liftOf(hop.by, squares));
      t += ms;
      // Every throw but the last ends in a friend's hands: a catch, then the next throw.
      if (i < trace.hops.length - 1) events.push({ kind: 'catch', cell: hop.toY * width + hop.toX, at: t });
    });
    const arrive = t;
    const last = points[points.length - 1]!;
    const lastHop = trace.hops[trace.hops.length - 1];
    const dir: [number, number] = lastHop === undefined ? [0, 0] : [Math.sign(lastHop.toX - lastHop.fromX), Math.sign(lastHop.toY - lastHop.fromY)];
    let endMs = 160;
    if (trace.end === 'bounced' || trace.end === 'wasted') {
      // Bounces back off the kid, up and away.
      endMs = Math.round(beatMs * 1.6);
      arc(points, t, endMs, [last.x, last.y], [last.x - dir[0] * 0.8, last.y - dir[1] * 0.8], calm ? 0 : 0.6);
    } else if (trace.end === 'edge') {
      endMs = beatMs;
      arc(points, t, endMs, [last.x, last.y], [last.x + dir[0] * 0.9, last.y + dir[1] * 0.9], 0);
    } else if (trace.end === 'blocked') {
      endMs = beatMs;
      arc(points, t, endMs, [last.x, last.y], [last.x - dir[0] * 0.3, last.y - dir[1] * 0.3], calm ? 0 : 0.15);
    } else {
      points.push({ t: t + endMs, x: last.x, y: last.y, lift: 0 });
    }
    flights.push({ snack: trace.snack, lunchbox: trace.lunchbox, picker: first === undefined ? -1 : first.fromY * width + first.fromX, points, arrive, end: t + endMs, ending: trace.end, fade: true, spin: !calm });

    const mood = REACT_END[trace.end];
    if (mood !== undefined && trace.kid >= 0) {
      const seen = firstAt.get(trace.kid);
      if (seen === undefined || arrive < seen.at) firstAt.set(trace.kid, { at: arrive, mood });
    }
  }

  const cellOfKid = (id: number): number => board.kids.find((k) => k.id === id)?.cell ?? -1;
  for (const [kid, { at, mood }] of [...firstAt].sort((a, b) => a[0] - b[0])) events.push({ kind: 'react', kid, cell: cellOfKid(kid), mood, at });

  const flightsEnd = flights.reduce((m, f) => Math.max(m, f.end), 0);
  const settle = flightsEnd + (calm ? 120 : 220);
  const walkMs = calm ? 700 : 1200;
  const tables = board.squares.flatMap((sq, c) => (sq === 'table' ? [c] : []));
  const nurses = board.friends.filter((f) => f.type === 'nurse' && f.cell >= 0);
  for (const outcome of wave.kids) {
    const cell = cellOfKid(outcome.kid);
    if (cell < 0) continue;
    const [x, y] = xy(cell, width);
    const home: [number, number] = [x, height];
    if (outcome.end === 'happy') {
      events.push({ kind: 'walk', kid: outcome.kid, cell, mood: 'yum', to: home, at: settle + (calm ? 0 : 300), ms: calm ? 700 : 900 });
    } else if (outcome.end === 'healed') {
      const nurse = nurses
        .map((n) => ({ cell: n.cell, d: Math.max(Math.abs((n.cell % width) - x), Math.abs(Math.floor(n.cell / width) - y)) }))
        .filter((n) => n.d <= options.healRange)
        .sort((a, b) => a.d - b.d || a.cell - b.cell)[0];
      events.push({ kind: 'heal', kid: outcome.kid, cell, nurse: nurse?.cell ?? -1, at: settle, ms: calm ? 500 : 1000 });
    } else if (outcome.end === 'hungry') {
      // A tummy ache goes to the parents' table (the nearest); no snack at all goes home down the path.
      const table = outcome.ache
        ? tables
            .map((c) => ({ c, d: Math.abs((c % width) - x) + Math.abs(Math.floor(c / width) - y) }))
            .sort((a, b) => a.d - b.d || a.c - b.c)[0]
        : undefined;
      events.push({ kind: 'walk', kid: outcome.kid, cell, mood: 'sad', to: table === undefined ? home : xy(table.c, width), at: settle, ms: walkMs });
    }
  }

  const duration = Math.max(flightsEnd, ...events.map((e) => e.at + ('ms' in e ? e.ms : 0))) + 150;
  return { flights, events, flightsEnd, duration };
}
