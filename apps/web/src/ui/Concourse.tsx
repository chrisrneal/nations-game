import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import type { CheckpointId, JourneyView } from '@airport/contracts';
import { FlowModel, visible, type FlowGeometry, type Span, type Tint } from './flow.ts';
import { formatRate, short } from './format.ts';
import type { AirportStore } from './store.ts';

const TINT: Readonly<Record<Tint, string>> = { out: '#8fd0ff', in: '#d7b4ff', charter: '#ffcc5c', away: '#ff9d6c' };
const CROWD = '#8fd0ff';

/**
 * The passenger flow (RULES 14) above the gates: departures from the door
 * through each checkpoint to the lounge, then to the gates; arrivals from the
 * gates out through the arrivals checkpoints. The checkpoints and lounge are
 * DOM; the people are dots on one canvas over the whole floor, drawn each
 * animation frame from a FlowModel (P7: nothing here re-renders React per tick).
 */
export function Concourse(props: { journey: JourneyView; tickMs: number; store: AirportStore; children: ReactNode }): ReactElement {
  const { journey, tickMs, store, children } = props;
  const floor = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rate = useRef<HTMLSpanElement>(null);
  const scale = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const lounge = useRef<HTMLDivElement>(null);
  const model = useRef<FlowModel>(null);
  model.current ??= new FlowModel();
  const geo = useRef<FlowGeometry | null>(null);
  const shape = `${journey.departures.map((c) => c.id).join()}|${journey.arrivals.map((c) => c.id).join()}`;

  // Numbers from every update, and the people they set walking.
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const flow = model.current as FlowModel;
        const t = update.view.terminal;
        flow.ingest(update.view, update.events, performance.now());
        if (count.current) count.current.textContent = `${short(t.waiting / 1000)}/${short(t.cap / 1000)}`;
        if (rate.current) rate.current.textContent = `+${formatRate((t.arrivalPerTick * 1000) / tickMs)}`;
        if (scale.current) scale.current.textContent = flow.perDot === 1 ? '' : `• = ${short(flow.perDot)}`;
        lounge.current?.classList.toggle('full', flow.turningAway);
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
      // Back from a hidden tab: whoever was walking has long arrived.
      if (dt > 1000) flow.reset();
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (g === null || still?.matches === true) return;
      flow.advance(Math.min(dt, 100), now, g);
      drawCrowd(ctx, g, flow.lounge);
      drawDots(ctx, flow, now);
      if (now - counted > 500) {
        counted = now;
        cv.dataset.dots = String(flow.dots.length);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

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
        <ol className="lane lane-dep" aria-label={`Departures: ${journey.departures.map((c) => c.name).join(', ')}, lounge, gates`} data-testid="lane-departures">
          {journey.departures.map((c) => (
            <li key={c.id} className="booth" data-booth={c.id} title={c.name}>
              {c.label}
            </li>
          ))}
        </ol>
        <div ref={lounge} className="lounge" data-testid="terminal">
          <span className="lounge-name">Lounge</span>
          <span ref={count} className="lounge-count" />
          <span ref={rate} className="flow-rate" />
          <span className="lounge-seats" />
          <span ref={scale} className="flow-key" />
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

/** Reads the checkpoints, lounge and gate cards' positions relative to the floor. */
function measureFloor(root: HTMLElement, box: DOMRect, gates: HTMLElement | null): FlowGeometry | null {
  const dep = root.querySelector('.lane-dep');
  const arr = root.querySelector('.lane-arr');
  const seats = root.querySelector('.lounge-seats');
  const exit = root.querySelector('.booth-exit');
  if (dep === null || arr === null || seats === null || exit === null) return null;
  const mid = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 - box.top;
  };
  const l = seats.getBoundingClientRect();
  const depBox = dep.getBoundingClientRect();
  const arrBox = arr.getBoundingClientRect();
  const view = gates?.getBoundingClientRect();
  const top = view === undefined ? 0 : view.top - box.top + 4;
  const bottom = view === undefined ? box.height : view.bottom - box.top;
  const cards = gates === null ? [] : [...gates.querySelectorAll('.gate:not(.gate-next)')];
  // The grid's padding is even, so the gap between its two columns is its middle.
  const pier = view === undefined ? box.width / 2 : (view.left + view.right) / 2 - box.left;
  return {
    depY: mid(dep),
    arrY: mid(arr),
    door: depBox.left - box.left + 4,
    dep: [...dep.querySelectorAll('.booth')].map((el) => span(el, box)),
    lounge: { left: l.left - box.left, top: l.top - box.top, right: l.right - box.left, bottom: l.bottom - box.top },
    arrStart: arrBox.right - box.left - 4,
    // Walking order is right to left: the reverse of the page.
    arr: [...arr.querySelectorAll('.booth:not(.booth-exit)')].reverse().map((el) => ({ ...span(el, box), id: el.getAttribute('data-booth') as CheckpointId })),
    exit: span(exit, box),
    pier: { x: pier, top: l.bottom - box.top + 6 },
    gates: cards.map((card) => {
      const r = card.getBoundingClientRect();
      const x = r.right - box.left < pier ? r.right - box.left - 10 : r.left - box.left + 10;
      return { x, y: Math.min(bottom + 8, Math.max(top, r.top - box.top + 34)) };
    }),
  };
}

/** The lounge crowd: one dot per seat in use, filling from the left (the real waiting count). */
function drawCrowd(ctx: CanvasRenderingContext2D, g: FlowGeometry, share: number): void {
  const { left, right, top, bottom } = g.lounge;
  const cols = Math.max(1, Math.floor((right - left - 4) / 6));
  const rows = 2;
  const filled = Math.round(share * cols * rows);
  if (filled === 0) return;
  const mid = (top + bottom) / 2;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = share >= 1 ? TINT.away : CROWD;
  ctx.beginPath();
  for (let i = 0; i < filled; i++) {
    const x = left + 4 + Math.floor(i / rows) * 6 + (i % rows) * 3;
    const y = mid + (i % rows === 0 ? -3 : 3);
    ctx.moveTo(x + 2, y);
    ctx.arc(x, y, 2, 0, Math.PI * 2);
  }
  ctx.fill();
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
