import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { JourneyView } from '@warehouse/contracts';
import { FlowModel, parcelSpots, visible, type FlowGeometry, type Load, type Span, type Tint } from './flow.ts';
import { formatDuration, formatRate, short } from './format.ts';
import { ripple } from './pop.ts';
import type { WarehouseStore } from './store.ts';

const TINT: Readonly<Record<Tint, string>> = { out: '#8fd0ff', in: '#d7b4ff', express: '#ffcc5c', away: '#ff9d6c' };
/** Packed orders: cardboard boxes, on the packing bench and in the trucks. */
const BOX = '#e0b073';
/** A truck's parcel spaces: empty, loaded, and all loaded (it leaves full). */
const PARCEL_EMPTY = 'rgb(255 255 255 / 14%)';
const PARCEL_FULL = '#56d3a0';
/** Picker stations drawn for a pickers level: one more every other level, up to six. */
export function lanesFor(level: number): number {
  return Math.min(6, 1 + Math.floor(level / 2));
}

/**
 * The warehouse floor (RULES 3, 3a, 14) above the docks, the middle of the
 * screen. Along the top, stock comes off the PO at the receiving dock, through
 * quality check and onto the shelves; tapping that lane sends extra hands.
 * Below, new orders come in at the order desk and snake through the picking
 * maze, whose line is the real backlog, to the pickers, then past any export
 * stations into packing and down the aisle to the docks, where they fill the
 * parked trucks. Tapping the maze sends extra pickers (RULES 6). The stations,
 * shelves and bays are DOM; the goods are dots on one canvas over the whole
 * floor, drawn each animation frame from a FlowModel (P7: nothing here
 * re-renders React per tick).
 */
export function Floor(props: {
  journey: JourneyView;
  pickingLevel: number;
  tickMs: number;
  store: WarehouseStore;
  onTapPick: () => void;
  onTapReceive: () => void;
  children: ReactNode;
}): ReactElement {
  const { journey, pickingLevel, tickMs, store, onTapPick, onTapReceive, children } = props;
  const floor = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rate = useRef<HTMLSpanElement>(null);
  const scale = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const staging = useRef<HTMLDivElement>(null);
  const picking = useRef<HTMLButtonElement>(null);
  const lineText = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const pops = useRef<HTMLSpanElement>(null);
  const inbound = useRef<HTMLButtonElement>(null);
  const poText = useRef<HTMLSpanElement>(null);
  const inTag = useRef<HTMLSpanElement>(null);
  const shelfFill = useRef<HTMLElement>(null);
  const shelfText = useRef<HTMLSpanElement>(null);
  const inPops = useRef<HTMLSpanElement>(null);
  const model = useRef<FlowModel>(null);
  model.current ??= new FlowModel();
  const geo = useRef<FlowGeometry | null>(null);
  const after = journey.outbound.filter((c) => c.id !== 'desk' && c.id !== 'picking');
  const checks = journey.inbound.filter((c) => c.id !== 'receiving');
  const lanes = lanesFor(pickingLevel);
  const shape = `${after.map((c) => c.id).join()}|${checks.map((c) => c.id).join()}|${lanes}`;

  // Numbers from every update, and the goods they set moving.
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const flow = model.current as FlowModel;
        const v = update.view;
        const t = v.staging;
        const pick = v.picking;
        const recv = v.receiving;
        flow.ingest(v, update.events, performance.now());
        if (count.current) count.current.textContent = `${short(t.staged / 1000)}/${short(t.cap / 1000)}`;
        if (rate.current) rate.current.textContent = `+${formatRate((t.orderPerTick * 1000) / tickMs)}`;
        if (scale.current) scale.current.textContent = flow.perDot === 1 ? '' : `• = ${short(flow.perDot)}`;
        const packed = pick.backlog > 0 && t.staged >= t.cap;
        const empty = pick.backlog > 0 && !packed && recv.stock < pick.ratePerTick;
        const orders = Math.floor(pick.backlog / 1000);
        if (lineText.current) {
          lineText.current.textContent =
            orders === 0
              ? 'No backlog'
              : packed
                ? `${short(orders)} held: packing full`
                : empty
                  ? `${short(orders)} held: shelves empty`
                  : `${short(orders)} waiting · ${formatDuration(Math.max(1, Math.round((pick.waitTicks * tickMs) / 1000)))}`;
        }
        if (tag.current) tag.current.textContent = pick.rushed ? 'Extra pickers' : orders > 0 && !packed && !empty ? 'Tap: +pickers' : '';
        const el = picking.current;
        if (el) {
          el.classList.toggle('rushed', pick.rushed);
          el.classList.toggle('queued', orders > 0);
          el.classList.toggle('full', flow.turningAway);
          el.classList.toggle('slow', v.bottleneck.kind === 'picking');
        }
        staging.current?.classList.toggle('full', t.staged >= t.cap);
        // The receiving lane: the PO at the dock and the shelves (RULES 3a).
        const share = recv.shelfCap === 0 ? 0 : Math.min(1, recv.stock / recv.shelfCap);
        const shelvesFull = recv.stock >= recv.shelfCap;
        if (poText.current) poText.current.textContent = `PO #${recv.po.id} · ${short(recv.po.received / 1000)}/${short(recv.po.units)}`;
        if (shelfFill.current) shelfFill.current.style.transform = `scaleX(${share})`;
        if (shelfText.current) shelfText.current.textContent = `${short(recv.stock / 1000)}/${short(recv.shelfCap / 1000)}`;
        if (inTag.current) inTag.current.textContent = recv.rushed ? 'Extra hands' : shelvesFull ? 'Shelves full' : 'Tap: +hands';
        const lane = inbound.current;
        if (lane) {
          lane.classList.toggle('rushed', recv.rushed);
          lane.classList.toggle('low', share < 0.15);
          lane.classList.toggle('slow', v.bottleneck.kind === 'stock');
        }
      }),
    [store, tickMs],
  );

  // Where everything is: measured when the layout changes, read every frame.
  useLayoutEffect(() => {
    const root = floor.current;
    const cv = canvas.current;
    if (root === null || cv === null) return;
    const docks = root.querySelector<HTMLElement>('.docks');
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
      geo.current = measureFloor(root, box, docks);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    if (docks !== null) resize.observe(docks);
    docks?.addEventListener('scroll', measure, { passive: true });
    // Docks opening change the grid without resizing the floor.
    const grid = new MutationObserver(measure);
    if (docks !== null) grid.observe(docks, { childList: true });
    return () => {
      resize.disconnect();
      grid.disconnect();
      docks?.removeEventListener('scroll', measure);
    };
  }, [shape]);

  // The goods: one canvas, redrawn each animation frame.
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
      // Back from a hidden tab: whatever was moving has long arrived (the backlog is filled in again).
      if (dt > 1000) flow.reset();
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (g === null || still?.matches === true) return;
      flow.advance(Math.min(dt, 100), now, g);
      drawPacked(ctx, g, flow.staging);
      drawLoads(ctx, g, flow.loads);
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

  const pickNow = (): void => {
    picking.current?.classList.add('rushed');
    onTapPick();
  };
  const receiveNow = (): void => {
    inbound.current?.classList.add('rushed');
    onTapReceive();
  };
  // A tap anywhere on a panel: a ripple where the thumb landed, then the command.
  const press = (target: RefObject<HTMLElement | null>, act: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const box = event.currentTarget.getBoundingClientRect();
      ripple(target.current, event.clientX - box.left, event.clientY - box.top);
      act();
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        act();
      }
    },
  });
  return (
    <div className="floor" ref={floor}>
      <section className="concourse" aria-label="Warehouse floor" data-testid="concourse">
        <button
          type="button"
          ref={inbound}
          className="inbound"
          data-testid="receiving"
          aria-label={`Receiving: the purchase order at the dock, ${checks.map((c) => c.name).join(', ')}, the shelves. Tap to send extra hands.`}
          {...press(inPops, receiveNow)}
        >
          <span className="sec-head">
            <span className="sec-title">Receiving</span>
            <span ref={poText} className="sec-line" data-testid="po" />
            <span ref={inTag} className="sec-tag" />
          </span>
          <span className="lane lane-in" data-testid="lane-inbound">
            <span className="booth booth-po" data-booth="receiving">
              PO
            </span>
            {checks.map((c) => (
              <span key={c.id} className="booth booth-in" data-booth={c.id} title={c.name}>
                {c.label}
              </span>
            ))}
            <span className="shelves" data-testid="shelves">
              <i ref={shelfFill} className="shelf-fill" />
              <span className="shelf-label">Shelves</span>
              <span ref={shelfText} className="shelf-count" data-testid="stock" />
            </span>
          </span>
          <span ref={inPops} className="pops" aria-hidden="true" />
        </button>
        <button
          type="button"
          ref={picking}
          className="picking"
          data-testid="picking"
          aria-label={`Orders: the order desk, the backlog, the pickers${after.map((c) => `, ${c.name}`).join('')}, packing. Tap to send extra pickers.`}
          {...press(pops, pickNow)}
        >
          <span className="sec-head">
            <span className="sec-title">Picking</span>
            <span ref={lineText} className="sec-line" data-testid="backlog" />
            <span ref={tag} className="sec-tag" />
          </span>
          <span className="sec-body" data-testid="lane-outbound">
            <span className="sec-maze">
              <span className="booth booth-checkin" data-booth="desk">
                Orders
              </span>
              <i className="rope rope-1" />
              <i className="rope rope-2" />
            </span>
            <span className="sec-scan" data-booth="picking" aria-hidden="true">
              {Array.from({ length: lanes }, (_, i) => (
                <i key={i} className="sec-lane" />
              ))}
              <i className="sec-lane sec-lane-extra" />
            </span>
          </span>
          <span ref={pops} className="pops" aria-hidden="true" />
        </button>
        <div ref={staging} className="staging" data-testid="packing">
          <span className="staging-info">
            <span className="staging-name">Packed</span>
            <span ref={count} className="staging-count" />
            <span ref={rate} className="flow-rate" />
            <span ref={scale} className="flow-key" />
          </span>
          <span className="staging-row">
            <span className="staging-parcels" />
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

/** Reads the stations, maze, shelves, packing bench and bays' positions relative to the floor. */
function measureFloor(root: HTMLElement, box: DOMRect, docks: HTMLElement | null): FlowGeometry | null {
  const maze = root.querySelector('.sec-maze');
  const checkin = root.querySelector('.booth-checkin');
  const scan = root.querySelector('.sec-scan');
  const lane = root.querySelector('.lane-in');
  const po = root.querySelector('.booth-po');
  const shelves = root.querySelector('.shelves');
  const bench = root.querySelector('.staging-parcels');
  if (maze === null || checkin === null || scan === null || lane === null || po === null || shelves === null || bench === null) return null;
  const mid = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 - box.top;
  };
  const m = maze.getBoundingClientRect();
  const c = checkin.getBoundingClientRect();
  const s = scan.getBoundingClientRect();
  const l = bench.getBoundingClientRect();
  const view = docks?.getBoundingClientRect();
  const top = view === undefined ? 0 : view.top - box.top + 4;
  const bottom = view === undefined ? box.height : view.bottom - box.top;
  const cards = docks === null ? [] : [...docks.querySelectorAll('.dock:not(.dock-next)')];
  // The grid is symmetric, so the aisle, its middle column, is its middle.
  const aisle = view === undefined ? box.width / 2 : (view.left + view.right) / 2 - box.left;
  const inView = (y: number): number => Math.min(bottom + 8, Math.max(top, y));
  // Three rows, centred in thirds of the maze, between the ropes.
  const rows = [1, 3, 5].map((k) => m.top - box.top + (m.height * k) / 6);
  const lastRow = rows[rows.length - 1] as number;
  return {
    inbound: {
      y: mid(lane),
      start: po.getBoundingClientRect().right - box.left + 3,
      booths: [...lane.querySelectorAll('.booth-in')].map((el) => span(el, box)),
      shelves: span(shelves, box),
    },
    door: { x: m.left - box.left - 4, y: rows[0] as number },
    checkin: { ...span(checkin, box), y: (c.top + c.bottom) / 2 - box.top },
    maze: { left: m.left - box.left + 4, right: m.right - box.left - 3, entry: c.right - box.left + 4, rows },
    pickers: { enter: { x: s.left - box.left + 2, y: lastRow }, exit: { x: s.right - box.left + 2, y: lastRow } },
    after: [...root.querySelectorAll('.booth-after')].reverse().map((el) => span(el, box)),
    afterY: mid(bench),
    staging: { left: l.left - box.left, top: l.top - box.top, right: l.right - box.left, bottom: l.bottom - box.top },
    pier: { x: aisle, top: l.bottom - box.top + 6 },
    docks: cards.map((card) => {
      const r = card.getBoundingClientRect();
      const b = parcelBox(card, r, box);
      const spots = parcelSpots(b);
      return {
        x: (r.left + r.right) / 2 - box.left,
        // In the gap above the bay: the walkway along its row.
        door: inView(r.top - box.top - 3.5),
        y: inView(b.top - 6),
        // A bay scrolled half out of view shows only the parcels still in it.
        parcels: spots.filter((p) => p.y > top && p.y < bottom - 2),
      };
    }),
  };
}

/**
 * Where a bay's parcel spaces are, relative to the floor. Read from the
 * layout (offsets, which ignore transforms), not the screen: a truck that has
 * just backed in is still sliding into its bay when the floor is measured.
 */
function parcelBox(card: Element, r: DOMRect, box: DOMRect): { left: number; top: number; right: number; bottom: number } {
  const area = card.querySelector<HTMLElement>('.dock-parcels');
  let left = 0;
  let top = 0;
  for (let el: HTMLElement | null = area; el !== null && el !== card; el = el.offsetParent as HTMLElement | null) {
    left += el.offsetLeft;
    top += el.offsetTop;
  }
  const x = r.left - box.left + (card as HTMLElement).clientLeft + left;
  const y = r.top - box.top + (card as HTMLElement).clientTop + top;
  return { left: x, top: y, right: x + (area?.offsetWidth ?? 0), bottom: y + (area?.offsetHeight ?? 0) };
}

/** The packing bench: one box per space in use, stacked from the left in three rows, more on a taller bench (the real staged count). */
function drawPacked(ctx: CanvasRenderingContext2D, g: FlowGeometry, share: number): void {
  const { left, right, top, bottom } = g.staging;
  const rows = Math.max(3, Math.min(5, Math.floor((bottom - top - 2) / 4.5)));
  const cols = Math.max(1, Math.floor((right - left - 4) / 5));
  const filled = Math.round(share * cols * rows);
  if (filled === 0) return;
  const mid = (top + bottom) / 2;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = share >= 1 ? TINT.away : BOX;
  ctx.beginPath();
  for (let i = 0; i < filled; i++) {
    const row = i % rows;
    const x = left + 4 + Math.floor(i / rows) * 5;
    const y = mid + (row - (rows - 1) / 2) * 4.5;
    ctx.rect(x - 1.7, y - 1.7, 3.4, 3.4);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * The parked trucks' loads: one square a parcel while they fit (a bigger truck
 * looks bigger), the bay's whole trailer past that; every space drawn faint,
 * the loaded ones (the real load, front first) as boxes, gold on an express,
 * green once full. One path per colour per frame.
 */
function drawLoads(ctx: CanvasRenderingContext2D, g: FlowGeometry, loads: readonly Load[]): void {
  const paths: Record<string, Path2D> = {};
  const add = (colour: string, x: number, y: number): void => {
    (paths[colour] ??= new Path2D()).rect(x - 1.5, y - 1.5, 3, 3);
  };
  g.docks.forEach((spot, i) => {
    const load = loads[i];
    if (load === undefined || load.share === null) return;
    const n = Math.min(spot.parcels.length, load.parcels);
    const taken = load.share > 0 ? Math.max(1, Math.round(load.share * n)) : 0;
    const colour = load.share >= 1 ? PARCEL_FULL : load.express ? TINT.express : BOX;
    for (let k = 0; k < n; k++) {
      const p = spot.parcels[k] as { x: number; y: number };
      add(k < taken ? colour : PARCEL_EMPTY, p.x, p.y);
    }
  });
  for (const [colour, path] of Object.entries(paths)) {
    ctx.fillStyle = colour;
    ctx.fill(path);
  }
}

const ORDER: readonly Tint[] = ['out', 'in', 'express', 'away'];

/** Everything on the move, batched by colour: one path per colour per frame. */
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
  // Fading ones (cancelled) one by one: there are only ever a few.
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
