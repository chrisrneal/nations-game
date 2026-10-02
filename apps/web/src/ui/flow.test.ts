import type { AirportEvent, AirportView, GateView, Stats } from '@airport/contracts';
import { describe, expect, it } from 'vitest';
import { DOTS_MAX, FlowModel, MAZE_MAX, Path, choosePerDot, mazePath, visible, type FlowGeometry } from './flow.ts';

const STATS: Stats = { earned: 0, flights: 0, fullFlights: 0, pax: 0, missed: 0, charters: 0, taps: 0 };

function gate(index: number, over: Partial<GateView> = {}): GateView {
  return { index, plane: index + 1, seats: 10, boarded: 0, timer: 60, timerMax: 60, turn: 0, turnMax: 0, rush: 0, charter: false, model: 'Puddle Jumper', rate: 500, rushed: false, ...over };
}

/** The parts of a View the flow reads; the rest is never touched. */
function view(tick: number, over: { waiting?: number; arrivalPerTick?: number; missed?: number; gates?: GateView[]; city?: number; line?: number } = {}): AirportView {
  return {
    tick,
    tickMs: 250,
    terminal: { waiting: over.waiting ?? 10_000, cap: 40_000, arrivalPerTick: over.arrivalPerTick ?? 400 },
    security: { line: over.line ?? 0, cap: 72_000, ratePerTick: 600, baseRatePerTick: 600, rushed: false, waitTicks: 0, slowBp: 10_000 },
    gates: over.gates ?? [gate(0)],
    city: { index: over.city ?? 0, name: 'Millbrook', twist: '' },
    run: { ...STATS, missed: over.missed ?? 0 },
  } as unknown as AirportView;
}

const GEO: FlowGeometry = {
  arrY: 30,
  door: { x: 10, y: 55 },
  checkin: { left: 14, right: 60, y: 55 },
  maze: { left: 14, right: 280, entry: 64, rows: [55, 70, 85] },
  scanner: { enter: { x: 284, y: 85 }, exit: { x: 310, y: 85 } },
  after: [{ left: 290, right: 330 }],
  afterY: 110,
  lounge: { left: 20, top: 104, right: 285, bottom: 116 },
  arrStart: 330,
  side: 336,
  arr: [{ left: 150, right: 200, id: 'baggage' }],
  exit: { left: 10, right: 30 },
  pier: { x: 175, top: 122 },
  gates: [
    { x: 160, y: 160 },
    { x: 190, y: 160 },
  ],
};

/** Feeds `n` one-tick updates, starting from `from`. */
function feed(model: FlowModel, from: number, n: number, make: (tick: number) => AirportView, events: (tick: number) => AirportEvent[] = () => []): number {
  for (let t = from; t < from + n; t++) model.ingest(make(t), events(t), t * 250);
  return from + n;
}

describe('people per dot', () => {
  it('shows one dot a person at the start, and fewer dots per person as the airport grows', () => {
    expect(choosePerDot(1.6, 1)).toBe(1);
    expect(choosePerDot(30, 1)).toBe(10);
    expect(choosePerDot(640, 1)).toBe(200);
  });

  it('keeps its scale through small swings (Sunvale waves)', () => {
    expect(choosePerDot(4.8, 1)).toBe(1);
    expect(choosePerDot(15, 5)).toBe(5);
    expect(choosePerDot(3, 5)).toBe(1);
  });
});

describe('the passenger flow (RULES 14)', () => {
  it('sends one dot through the door per person joining the security line', () => {
    const model = new FlowModel();
    // 1.6 people a second for 10 seconds.
    feed(model, 0, 41, (t) => view(t));
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(16);
  });

  it('turns people away at the door when the line is full', () => {
    const model = new FlowModel();
    feed(model, 0, 41, (t) => view(t, { waiting: 40_000, line: 72_000, missed: t * 400 }));
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
    expect(model.dots.filter((d) => d.kind === 'away')).toHaveLength(16);
    expect(model.turningAway).toBe(true);
    expect(model.lounge).toBe(1);
  });

  it('walks a dot from the lounge to its gate for each passenger boarding', () => {
    const model = new FlowModel();
    feed(model, 0, 21, (t) => view(t, { arrivalPerTick: 0, gates: [gate(0), gate(1, { boarded: t * 500 })] }));
    const boarding = model.dots.filter((d) => d.kind === 'board');
    expect(boarding).toHaveLength(10);
    expect(boarding.every((d) => d.gate === 1)).toBe(true);
  });

  it('counts the passengers on a plane that left between two updates', () => {
    const model = new FlowModel();
    model.ingest(view(0, { arrivalPerTick: 0, gates: [gate(0, { boarded: 8000 })] }), [], 0);
    const left: AirportEvent = { tick: 0, type: 'departed', payload: { gate: 0, plane: 1, pax: 10, seats: 10, cents: 1250, full: true, charter: false } };
    model.ingest(view(1, { arrivalPerTick: 0, gates: [gate(0, { boarded: 0, turn: 18, turnMax: 18 })] }), [left], 250);
    expect(model.dots.filter((d) => d.kind === 'board')).toHaveLength(2);
  });

  it('lets the people off a landed plane, one after another, and walks them out through the exit', () => {
    const model = new FlowModel();
    model.ingest(view(0, { arrivalPerTick: 0 }), [], 0);
    const landed: AirportEvent = { tick: 1, type: 'arrived', payload: { gate: 0, plane: 7, seats: 10, charter: true } };
    model.ingest(view(1, { arrivalPerTick: 0 }), [landed], 250);
    model.advance(16, 250, GEO);
    expect(model.dots).toHaveLength(1);
    expect(model.dots[0]).toMatchObject({ kind: 'arr', tint: 'charter' });
    expect(Math.hypot((model.dots[0]?.x ?? 0) - 160, (model.dots[0]?.y ?? 0) - 160)).toBeLessThan(5);
    let now = 250;
    for (let i = 0; i < 120; i++) model.advance(16, (now += 16), GEO);
    expect(model.dots.length).toBe(10);
    // They walk round the security maze, never through it.
    const inMaze = (x: number, y: number): boolean => x > GEO.maze.left && x < GEO.scanner.exit.x && y > 50 && y < 90;
    let crossed = false;
    for (let i = 0; i < 1500 && model.dots.length > 0; i++) {
      model.advance(16, (now += 16), GEO);
      crossed ||= model.dots.some((d) => inMaze(d.x, d.y));
    }
    expect(crossed).toBe(false);
    expect(model.dots).toHaveLength(0);
  });

  it('walks the maze as a snake: along each row, turning at alternate ends, into the scanners', () => {
    const path = new Path(mazePath(GEO.maze));
    expect(path.length).toBe(216 + 15 + 266 + 15 + 266);
    expect(path.at(0)).toEqual({ x: 64, y: 55 });
    expect(path.at(216 + 15 + 266)).toEqual({ x: 14, y: 70 });
    expect(path.at(path.length)).toEqual({ x: 280, y: 85 });
  });

  it('the line in the maze is the real line: people stand in it while security holds them', () => {
    const model = new FlowModel();
    // 1.6 a second join; security lets nobody through (a full lounge): the line grows by 0.4 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { line: 0 }));
    tick = feed(model, tick, 80, (t) => view(t, { line: t * 400 }));
    let now = tick * 250;
    for (let i = 0; i < 1200; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(32);
    expect(model.queue.length).toBeGreaterThanOrEqual(30);
    expect(model.queue.length).toBeLessThanOrEqual(34);
    // They stand head to tail, the head at the scanners, in the order they came.
    const path = new Path(mazePath(GEO.maze));
    expect(model.queue[0]?.pos).toBeCloseTo(path.length, 0);
    for (let i = 1; i < model.queue.length; i++) expect(model.queue[i]?.pos ?? 0).toBeLessThan(model.queue[i - 1]?.pos ?? 0);
  });

  it('security lets the head through as fast as the sim clears the line, and they walk on to the lounge', () => {
    const model = new FlowModel();
    // A line of 20 already standing; nobody arrives, security clears 0.6 a tick.
    let tick = feed(model, 0, 1, (t) => view(t, { arrivalPerTick: 0, line: 20_000 }));
    let now = tick * 250;
    for (let i = 0; i < 60; i++) model.advance(16, (now += 16), GEO);
    expect(model.queue.length).toBe(20);
    let scanned = 0;
    // 34 ticks clear it all.
    for (let k = 0; k < 40; k++) {
      tick = feed(model, tick, 1, (t) => view(t, { arrivalPerTick: 0, line: Math.max(0, 20_000 - t * 600) }));
      for (let i = 0; i < 16; i++) {
        model.advance(16, (now += 16), GEO);
        scanned = Math.max(scanned, model.dots.filter((d) => d.phase === 'scan' && !visible(d, now)).length);
      }
    }
    expect(scanned).toBeGreaterThan(0);
    expect(model.queue.length).toBeLessThanOrEqual(2);
    for (let i = 0; i < 600; i++) model.advance(16, (now += 16), GEO);
    expect(model.dots.filter((d) => d.kind === 'dep')).toHaveLength(0);
  });

  it('a line longer than the maze holds squeezes up, and dots stand for more of it', () => {
    const model = new FlowModel();
    feed(model, 0, 1, (t) => view(t, { arrivalPerTick: 0, line: 900_000 }));
    let now = 250;
    for (let i = 0; i < 10; i++) model.advance(16, (now += 16), GEO);
    expect(model.lineDots).toBe(MAZE_MAX);
    expect(model.queue.length).toBe(MAZE_MAX);
    const path = new Path(mazePath(GEO.maze));
    expect(model.gap(path) * MAZE_MAX).toBeLessThanOrEqual(path.length + 1);
  });

  it('check-in and the checkpoints after security queue people for show and hide each one inside while served', () => {
    const model = new FlowModel();
    feed(model, 0, 41, (t) => view(t, { arrivalPerTick: 4000 }));
    let now = 41 * 250;
    let hidden = 0;
    for (let i = 0; i < 200; i++) {
      model.advance(16, (now += 16), GEO);
      hidden = Math.max(hidden, model.dots.filter((d) => !visible(d, now)).length);
    }
    expect(hidden).toBeGreaterThan(0);
    // Everyone stays on the floor: never behind the door, never right of the checkpoints.
    expect(model.dots.every((d) => d.x >= GEO.door.x - 1 && d.x <= 332)).toBe(true);
  });

  it('shows nothing for a quiet catch-up, and starts afresh in a new city', () => {
    const model = new FlowModel();
    model.ingest(view(0), [], 0);
    model.ingest(view(4000, { missed: 1_000_000 }), [], 1000);
    expect(model.dots).toHaveLength(0);
    feed(model, 4001, 40, (t) => view(t));
    expect(model.dots.length).toBeGreaterThan(0);
    model.ingest(view(4041, { city: 1 }), [], 20_000);
    expect(model.dots).toHaveLength(0);
  });

  it('never keeps more dots than a slow phone can draw', () => {
    const model = new FlowModel();
    const eight = Array.from({ length: 8 }, (_, i) => i);
    feed(
      model,
      0,
      400,
      (t) => view(t, { arrivalPerTick: 2400, gates: eight.map((i) => gate(i, { boarded: (t * 3000) % 10_000 })) }),
      (t) => eight.map((i) => ({ tick: t, type: 'arrived', payload: { gate: i, plane: t * 8 + i, seats: 10, charter: false } })),
    );
    for (let i = 0; i < 100; i++) model.advance(16, 100_000 + i * 16, GEO);
    expect(model.dots.length).toBeLessThanOrEqual(DOTS_MAX);
  });
});
