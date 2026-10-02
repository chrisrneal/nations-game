import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import type { CheckpointId, JourneyView } from '@airport/contracts';
import { FlowModel, seatSpots, visible, type FlowGeometry, type Load, type Span, type Tint } from './flow.ts';
import { formatDuration, formatRate, short } from './format.ts';
import { ripple } from './pop.ts';
import type { AirportStore } from './store.ts';

const TINT: Readonly<Record<Tint, string>> = { out: '#8fd0ff', in: '#d7b4ff', charter: '#ffcc5c', away: '#ff9d6c' };
const CROWD = '#8fd0ff';
/** A plane's seats: empty, taken, and all taken (it leaves full). */
const SEAT_EMPTY = 'rgb(255 255 255 / 14%)';
const SEAT_FULL = '#56d3a0';
/** Scanner lanes drawn for a Security lanes level: one more every other level, up to six. */
export function lanesFor(level: number): number {
  return Math.min(6, 1 + Math.floor(level / 2));
}

/**
 * The passenger flow (RULES 3, 14) above the gates, the middle of the screen:
 * arrivals walk out along the top lane; departures come in at the door, pass
 * check-in and snake through the security maze, whose line is the real one,
 * into the scanners, then past any international checkpoints into the lounge
 * and down the pier to the gates, where they fill the parked planes' seats.
 * Tapping the maze opens an extra lane (RULES 6). The checkpoints, lounge and
 * stands are DOM; the people and the seats are dots on one canvas over the
 * whole floor, drawn each animation frame from a FlowModel (P7: nothing here
 * re-renders React per tick).
 */
export function Concourse(props: { journey: JourneyView; securityLevel: number; tickMs: number; store: AirportStore; onTapSecurity: () => void; children: ReactNode }): ReactElement {
  const { journey, securityLevel, tickMs, store, onTapSecurity, children } = props;
  const floor = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rate = useRef<HTMLSpanElement>(null);
  const scale = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const lounge = useRef<HTMLDivElement>(null);
  const security = useRef<HTMLButtonElement>(null);
  const lineText = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const pops = useRef<HTMLSpanElement>(null);
  const model = useRef<FlowModel>(null);
  model.current ??= new FlowModel();
  const geo = useRef<FlowGeometry | null>(null);
  const after = journey.departures.filter((c) => c.id !== 'checkin' && c.id !== 'security');
  const lanes = lanesFor(securityLevel);
  const shape = `${after.map((c) => c.id).join()}|${journey.arrivals.map((c) => c.id).join()}|${lanes}`;

  // Numbers from every update, and the people they set walking.
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const flow = model.current as FlowModel;
        const t = update.view.terminal;
        const sec = update.view.security;
        flow.ingest(update.view, update.events, performance.now());
        if (count.current) count.current.textContent = `${short(t.waiting / 1000)}/${short(t.cap / 1000)}`;
        if (rate.current) rate.current.textContent = `+${formatRate((t.arrivalPerTick * 1000) / tickMs)}`;
        if (scale.current) scale.current.textContent = flow.perDot === 1 ? '' : `• = ${short(flow.perDot)}`;
        const held = sec.line > 0 && t.waiting >= t.cap;
        const people = Math.floor(sec.line / 1000);
        if (lineText.current) {
          lineText.current.textContent =
            people === 0 ? 'No line' : held ? `${short(people)} held: lounge full` : `${short(people)} in line · ${formatDuration(Math.max(1, Math.round((sec.waitTicks * tickMs) / 1000)))}`;
        }
        if (tag.current) tag.current.textContent = sec.rushed ? 'Extra lane' : people > 0 && !held ? 'Tap: +lane' : '';
        const el = security.current;
        if (el) {
          el.classList.toggle('rushed', sec.rushed);
          el.classList.toggle('queued', people > 0);
          el.classList.toggle('full', flow.turningAway);
          el.classList.toggle('slow', update.view.bottleneck.kind === 'security');
        }
        lounge.current?.classList.toggle('full', t.waiting >= t.cap);
      }),
    [store, tickMs],
  );

  // Where everything is: measured when the layout changes, read every frame.
  useLayoutEffect(() => {
    const root = floor.current;
    const cv = canvas.current;
    if (root === null || cv === null) return;
    const gates = root.querySelector<HTMLElement>('.gates');
    const measure = (): void => {
      const box = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(box.width * dpr);
      const h = Math.round(box.height * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      geo.current = measureFloor(root, box, gates);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    if (gates !== null) resize.observe(gates);
    gates?.addEventListener('scroll', measure, { passive: true });
    // Gates opening change the grid without resizing the floor.
    const grid = new MutationObserver(measure);
    if (gates !== null) grid.observe(gates, { childList: true });
    return () => {
      resize.disconnect();
      grid.disconnect();
      gates?.removeEventListener('scroll', measure);
    };
  }, [shape]);

  // The people: one canvas, redrawn each animation frame.
  useLayoutEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d') ?? null;
    if (cv === null || ctx === null) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = performance.now();
    let counted = 0;
    const draw = (now: number): void => {
      frame = requestAnimationFrame(draw);
      const flow = model.current as FlowModel;
      const g = geo.current;
      const dt = now - last;
      last = now;
      // Back from a hidden tab: whoever was walking has long arrived (the line is filled in again).
      if (dt > 1000) flow.reset();
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (g === null || still?.matches === true) return;
      flow.advance(Math.min(dt, 100), now, g);
      drawCrowd(ctx, g, flow.lounge);
      drawSeats(ctx, g, flow.loads);
      drawDots(ctx, flow, now);
      if (now - counted > 500) {
        counted = now;
        cv.dataset.dots = String(flow.dots.length);
        cv.dataset.queued = String(flow.queue.length);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const open = (): void => {
    security.current?.classList.add('rushed');
    onTapSecurity();
  };
  const arrivals = [...journey.arrivals].reverse();
  return (
    <div className="floor" ref={floor}>
      <section className="concourse" aria-label="Passenger flow" data-testid="concourse">
        <ol className="lane lane-arr" aria-label={`Arrivals: gates, ${journey.arrivals.map((c) => c.name).join(', ')}, exit`} data-testid="lane-arrivals">
          <li className="booth booth-exit">Exit</li>
          {arrivals.map((c) => (
            <li key={c.id} className="booth" data-booth={c.id} title={c.name}>
              {c.label}
            </li>
          ))}
        </ol>
        <button
          type="button"
          ref={security}
          className="security"
          data-testid="security"
          aria-label={`Departures: check-in, the security line${after.map((c) => `, ${c.name}`).join('')}, lounge. Tap to open an extra security lane.`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const box = event.currentTarget.getBoundingClientRect();
            ripple(pops.current, event.clientX - box.left, event.clientY - box.top);
            open();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }}
        >
          <span className="sec-head">
            <span className="sec-title">Security</span>
            <span ref={lineText} className="sec-line" data-testid="security-line" />
            <span ref={tag} className="sec-tag" />
          </span>
          <span className="sec-body" data-testid="lane-departures">
            <span className="sec-maze">
              <span className="booth booth-checkin" data-booth="checkin">
                Check-in
              </span>
              <i className="rope rope-1" />
              <i className="rope rope-2" />
            </span>
            <span className="sec-scan" data-booth="security" aria-hidden="true">
              {Array.from({ length: lanes }, (_, i) => (
                <i key={i} className="sec-lane" />
              ))}
              <i className="sec-lane sec-lane-extra" />
            </span>
          </span>
          <span ref={pops} className="pops" aria-hidden="true" />
        </button>
        <div ref={lounge} className="lounge" data-testid="terminal">
          <span className="lounge-info">
            <span className="lounge-name">Lounge</span>
            <span ref={count} className="lounge-count" />
            <span ref={rate} className="flow-rate" />
            <span ref={scale} className="flow-key" />
          </span>
          <span className="lounge-row">
            <span className="lounge-seats" />
            {[...after].reverse().map((c) => (
              <span key={c.id} className="booth booth-after" data-booth={c.id} title={c.name}>
                {c.label}
              </span>
            ))}
          </span>
        </div>
      </section>
      {children}
      <canvas ref={canvas} className="flow-dots" aria-hidden="true" data-testid="flow-dots" />
    </div>
  );
}

function span(el: Element, box: DOMRect): Span {
  const r = el.getBoundingClientRect();
  return { left: r.left - box.left, right: r.right - box.left };
}

/** Reads the checkpoints, maze, lounge and gate cards' positions relative to the floor. */
function measureFloor(root: HTMLElement, box: DOMRect, gates: HTMLElement | null): FlowGeometry | null {
  const maze = root.querySelector('.sec-maze');
  const checkin = root.querySelector('.booth-checkin');
  const scan = root.querySelector('.sec-scan');
  const arr = root.querySelector('.lane-arr');
  const hall = root.querySelector('.concourse');
  const seats = root.querySelector('.lounge-seats');
  const exit = root.querySelector('.booth-exit');
  if (maze === null || checkin === null || scan === null || arr === null || seats === null || exit === null || hall === null) return null;
  const mid = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 - box.top;
  };
  const m = maze.getBoundingClientRect();
  const c = checkin.getBoundingClientRect();
  const s = scan.getBoundingClientRect();
  const l = seats.getBoundingClientRect();
  const arrBox = arr.getBoundingClientRect();
  const view = gates?.getBoundingClientRect();
  const top = view === undefined ? 0 : view.top - box.top + 4;
  const bottom = view === undefined ? box.height : view.bottom - box.top;
  const cards = gates === null ? [] : [...gates.querySelectorAll('.gate:not(.gate-next)')];
  // The grid is symmetric, so the pier, its middle column, is its middle.
  const pier = view === undefined ? box.width / 2 : (view.left + view.right) / 2 - box.left;
  const inView = (y: number): number => Math.min(bottom + 8, Math.max(top, y));
  // Three rows, centred in thirds of the maze, between the ropes.
  const rows = [1, 3, 5].map((k) => m.top - box.top + (m.height * k) / 6);
  const lastRow = rows[rows.length - 1] as number;
  const after = [...root.querySelectorAll('.booth-after')].reverse().map((el) => span(el, box));
  return {
    arrY: mid(arr),
    door: { x: m.left - box.left - 4, y: rows[0] as number },
    checkin: { ...span(checkin, box), y: (c.top + c.bottom) / 2 - box.top },
    maze: { left: m.left - box.left + 4, right: m.right - box.left - 3, entry: c.right - box.left + 4, rows },
    scanner: { enter: { x: s.left - box.left + 2, y: lastRow }, exit: { x: s.right - box.left + 2, y: lastRow } },
    after,
    afterY: mid(seats),
    lounge: { left: l.left - box.left, top: l.top - box.top, right: l.right - box.left, bottom: l.bottom - box.top },
    arrStart: arrBox.right - box.left - 4,
    // In the concourse's padding, between the maze's border and its own.
    side: hall.getBoundingClientRect().right - box.left - 4,
    // Walking order is right to left: the reverse of the page.
    arr: [...arr.querySelectorAll('.booth:not(.booth-exit)')].reverse().map((el) => ({ ...span(el, box), id: el.getAttribute('data-booth') as CheckpointId })),
    exit: span(exit, box),
    pier: { x: pier, top: l.bottom - box.top + 6 },
    gates: cards.map((card) => {
      const r = card.getBoundingClientRect();
      const s = seatBox(card, r, box);
      const seats = seatSpots(s);
      return {
        x: (r.left + r.right) / 2 - box.left,
        // In the gap above the stand: the walkway along its row.
        door: inView(r.top - box.top - 3.5),
        y: inView(s.top - 6),
        // A stand scrolled half out of view shows only the seats still in it.
        seats: seats.filter((p) => p.y > top && p.y < bottom - 2),
      };
    }),
  };
}

/**
 * Where a stand's seats are, relative to the floor. Read from the layout
 * (offsets, which ignore transforms), not the screen: a plane that has just
 * arrived is still sliding into its stand when the floor is measured.
 */
function seatBox(card: Element, r: DOMRect, box: DOMRect): { left: number; top: number; right: number; bottom: number } {
  const seats = card.querySelector<HTMLElement>('.gate-seats');
  let left = 0;
  let top = 0;
  for (let el: HTMLElement | null = seats; el !== null && el !== card; el = el.offsetParent as HTMLElement | null) {
    left += el.offsetLeft;
    top += el.offsetTop;
  }
  const x = r.left - box.left + (card as HTMLElement).clientLeft + left;
  const y = r.top - box.top + (card as HTMLElement).clientTop + top;
  return { left: x, top: y, right: x + (seats?.offsetWidth ?? 0), bottom: y + (seats?.offsetHeight ?? 0) };
}

/** The lounge crowd: one dot per seat in use, filling from the left in three rows (the real waiting count). */
function drawCrowd(ctx: CanvasRenderingContext2D, g: FlowGeometry, share: number): void {
  const { left, right, top, bottom } = g.lounge;
  const rows = 3;
  const cols = Math.max(1, Math.floor((right - left - 4) / 5));
  const filled = Math.round(share * cols * rows);
  if (filled === 0) return;
  const mid = (top + bottom) / 2;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = share >= 1 ? TINT.away : CROWD;
  ctx.beginPath();
  for (let i = 0; i < filled; i++) {
    const row = i % rows;
    const x = left + 4 + Math.floor(i / rows) * 5 + (row === 1 ? 2.5 : 0);
    const y = mid + (row - 1) * 4.5;
    ctx.moveTo(x + 1.8, y);
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * The parked planes' seats: one square a seat while they fit (a bigger plane
 * looks bigger), the stand's whole cabin past that; every seat drawn faint,
 * the taken ones (the real load, front rows first) in colour, gold on a
 * charter, green once full. One path per colour per frame; squares are
 * cheaper than circles.
 */
function drawSeats(ctx: CanvasRenderingContext2D, g: FlowGeometry, loads: readonly Load[]): void {
  const paths: Record<string, Path2D> = {};
  const add = (colour: string, x: number, y: number): void => {
    (paths[colour] ??= new Path2D()).rect(x - 1.5, y - 1.5, 3, 3);
  };
  g.gates.forEach((spot, i) => {
    const load = loads[i];
    if (load === undefined || load.share === null) return;
    const n = Math.min(spot.seats.length, load.seats);
    const taken = load.share > 0 ? Math.max(1, Math.round(load.share * n)) : 0;
    const colour = load.share >= 1 ? SEAT_FULL : load.charter ? TINT.charter : CROWD;
    for (let k = 0; k < n; k++) {
      const p = spot.seats[k] as { x: number; y: number };
      add(k < taken ? colour : SEAT_EMPTY, p.x, p.y);
    }
  });
  for (const [colour, path] of Object.entries(paths)) {
    ctx.fillStyle = colour;
    ctx.fill(path);
  }
}

const ORDER: readonly Tint[] = ['out', 'in', 'charter', 'away'];

/** Everyone walking, batched by colour: one path per colour per frame. */
function drawDots(ctx: CanvasRenderingContext2D, flow: FlowModel, now: number): void {
  for (const tint of ORDER) {
    let any = false;
    ctx.beginPath();
    for (const d of flow.dots) {
      if (d.tint !== tint || !visible(d, now)) continue;
      if (d.alpha < 1) continue;
      any = true;
      ctx.moveTo(d.x + 2.3, d.y);
      ctx.arc(d.x, d.y, 2.3, 0, Math.PI * 2);
    }
    if (any) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = TINT[tint];
      ctx.fill();
    }
  }
  // Fading ones (turned away) one by one: there are only ever a few.
  ctx.fillStyle = TINT.away;
  for (const d of flow.dots) {
    if (d.alpha >= 1) continue;
    ctx.globalAlpha = Math.max(0, d.alpha);
    ctx.beginPath();
    ctx.arc(d.x, d.y, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
