import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import type { JourneyView } from '@warehouse/contracts';
import { FlowModel, MARK_MS, laneCount, laneSpots, parcelSpots, rackSlots, visible, type FlowGeometry, type Load, type Mark, type Rect, type Span, type Tint } from './flow.ts';
import { formatDuration, formatRate, short } from './format.ts';
import { ripple } from './pop.ts';
import type { WarehouseStore } from './store.ts';

/** Cartons: put away, in the racks, picked, staged and in the trucks. */
const BOX = '#e0b073';
const TINT: Readonly<Record<Tint, string>> = { out: '#8fd0ff', box: BOX, express: '#ffcc5c', away: '#ff9d6c' };
/** Pickers (as the picker figures under the board), forklifts and reach trucks (safety yellow), and a bare floor pick location. */
const PICKER = '#d9e8ff';
const FORKLIFT = '#fff06a';
const PICK_SPOT = 'rgb(143 208 255 / 13%)';
/** A multi-item order's tote, filling with its cartons. */
const TOTE = '#4f7fd0';
/** The flash on a location that just filled or emptied: put away, picked, replenished. */
const MARK: Readonly<Record<Mark['kind'], string>> = { put: '#d7b4ff', pick: '#8fd0ff', rep: FORKLIFT };
/** A truck's parcel spaces: empty, loaded, and all loaded (it leaves full). */
const PARCEL_EMPTY = 'rgb(255 255 255 / 14%)';
const PARCEL_FULL = '#56d3a0';
/** Picker stations drawn for a pickers level: one more every other level, up to six. */
export function lanesFor(level: number): number {
  return Math.min(6, 1 + Math.floor(level / 2));
}

/**
 * The warehouse floor (RULES 3, 3a, 14) above the docks, laid out the way
 * goods move through a warehouse. Along the top, the inbound dock: cartons
 * come off the PO, through quality check, and forklifts put them away in
 * reserve locations; tapping it sends extra hands. Below, picking: reach
 * trucks replenish the floor pick locations from reserve; new orders come in
 * at the order desk and wait on the order board (the real backlog); pickers
 * take the oldest down an aisle, pick a carton from a floor pick location and
 * carry it (a multi-item order in a tote, one location an item) back out past the board (left, clear of the forklifts' cross
 * aisle on the right), through any export stations, to the staging lanes, one lane per
 * dock, where it waits to be loaded onto a truck at the outbound docks.
 * Tapping picking sends extra pickers (RULES 6). The stations, racks and lanes are DOM; the goods are
 * drawn on one canvas over the whole floor each animation frame from a
 * FlowModel, over a second canvas holding what stands still (the racks'
 * cartons, the staging lanes, the trucks' loads), redrawn only when that
 * changes (P7: nothing here re-renders React per tick).
 */
export function Floor(props: {
  journey: JourneyView;
  pickingLevel: number;
  docks: number;
  tickMs: number;
  store: WarehouseStore;
  onTapPick: () => void;
  onTapReceive: () => void;
  children: ReactNode;
}): ReactElement {
  const { journey, pickingLevel, docks, tickMs, store, onTapPick, onTapReceive, children } = props;
  const floor = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stillCanvas = useRef<HTMLCanvasElement>(null);
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
  const racks = useRef<HTMLSpanElement>(null);
  const shelfText = useRef<HTMLSpanElement>(null);
  const inPops = useRef<HTMLSpanElement>(null);
  const model = useRef<FlowModel>(null);
  model.current ??= new FlowModel();
  const geo = useRef<FlowGeometry | null>(null);
  const after = journey.outbound.filter((c) => c.id !== 'desk' && c.id !== 'picking');
  const checks = journey.inbound.filter((c) => c.id !== 'receiving');
  const lanes = lanesFor(pickingLevel);
  const shape = `${after.map((c) => c.id).join()}|${checks.map((c) => c.id).join()}|${lanes}|${docks}`;

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
        // Stock for less than a tick's picking, in orders of today's size (RULES 3b).
        const empty = pick.backlog > 0 && !packed && (recv.stock * 1000) / pick.itemsMilli < pick.ratePerTick;
        const orders = Math.floor(pick.backlog / 1000);
        if (lineText.current) {
          lineText.current.textContent =
            orders === 0
              ? 'No backlog'
              : packed
                ? `${short(orders)} held: staging full`
                : empty
                  ? `${short(orders)} held: racks empty`
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
        // The inbound dock and the racks (RULES 3a).
        const share = recv.shelfCap === 0 ? 0 : Math.min(1, recv.stock / recv.shelfCap);
        const shelvesFull = recv.stock >= recv.shelfCap;
        if (poText.current) poText.current.textContent = `PO #${recv.po.id} · ${short(recv.po.received / 1000)}/${short(recv.po.units)}`;
        racks.current?.classList.toggle('low', share < 0.15);
        if (shelfText.current) shelfText.current.textContent = `${short(recv.stock / 1000)}/${short(recv.shelfCap / 1000)}`;
        if (inTag.current) inTag.current.textContent = recv.rushed ? 'Extra hands' : shelvesFull ? 'Racks full' : 'Tap: +hands';
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
    const sv = stillCanvas.current;
    if (root === null || cv === null || sv === null) return;
    const docks = root.querySelector<HTMLElement>('.docks');
    const measure = (): void => {
      const box = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(box.width * dpr);
      const h = Math.round(box.height * dpr);
      for (const c of [cv, sv]) {
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
          c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
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

  // The goods: one canvas, redrawn each animation frame; what stands still on another, redrawn when it changes.
  useLayoutEffect(() => {
    const cv = canvas.current;
    const sv = stillCanvas.current;
    const ctx = cv?.getContext('2d') ?? null;
    const stx = sv?.getContext('2d') ?? null;
    if (cv === null || ctx === null || sv === null || stx === null) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = performance.now();
    let counted = 0;
    let drawn = -1;
    let drawnGeo: FlowGeometry | null = null;
    let drawnSize = '';
    const draw = (now: number): void => {
      frame = requestAnimationFrame(draw);
      const flow = model.current as FlowModel;
      const g = geo.current;
      const dt = now - last;
      last = now;
      // Back from a hidden tab: whatever was moving has long arrived (the backlog is filled in again).
      if (dt > 1000) flow.reset();
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (g === null || still?.matches === true) {
        stx.clearRect(0, 0, sv.width, sv.height);
        drawn = -1;
        return;
      }
      flow.advance(Math.min(dt, 100), now, g);
      // A resized canvas is blank, so a new size counts as a change too.
      const size = `${sv.width}x${sv.height}`;
      if (flow.still !== drawn || g !== drawnGeo || size !== drawnSize) {
        drawn = flow.still;
        drawnGeo = g;
        drawnSize = size;
        stx.clearRect(0, 0, sv.width, sv.height);
        drawRacks(stx, g, flow);
        drawStaging(stx, g, flow.staging);
        drawLoads(stx, g, flow.loads);
      }
      drawMarks(ctx, flow, now);
      drawDots(ctx, flow, now, g.inbound.booths.length);
      if (now - counted > 500) {
        counted = now;
        cv.dataset.dots = String(flow.dots.length);
        cv.dataset.queued = String(flow.queue.length);
        cv.dataset.replens = String(flow.replens);
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
  const tapAt = (event: PointerEvent<HTMLButtonElement>, target: HTMLElement | null, act: () => void): void => {
    if (event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    ripple(target, event.clientX - box.left, event.clientY - box.top);
    act();
  };
  const keyAt = (event: KeyboardEvent<HTMLButtonElement>, act: () => void): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      act();
    }
  };
  return (
    <div className="floor" ref={floor}>
      <section className="concourse" aria-label="Warehouse floor" data-testid="concourse">
        <button
          type="button"
          ref={inbound}
          className="inbound"
          data-testid="receiving"
          aria-label={`Inbound dock: the purchase order being unloaded, ${checks.map((c) => c.name).join(', ')}, then put away in the racks. Tap to send extra hands.`}
          onPointerDown={(event) => tapAt(event, inPops.current, receiveNow)}
          onKeyDown={(event) => keyAt(event, receiveNow)}
        >
          <span className="sec-head">
            <span className="sec-title">Inbound</span>
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
            <span className="lane-to">Put away ↓</span>
          </span>
          <span ref={inPops} className="pops" aria-hidden="true" />
        </button>
        <button
          type="button"
          ref={picking}
          className="picking"
          data-testid="picking"
          aria-label={`Storage and picking: reach trucks replenish the floor pick locations from reserve; orders wait on the order board, pickers pick each from the floor${after.map((c) => `, ${c.name}`).join('')}, to staging. Tap to send extra pickers.`}
          onPointerDown={(event) => tapAt(event, pops.current, pickNow)}
          onKeyDown={(event) => keyAt(event, pickNow)}
        >
          <span className="sec-head">
            <span className="sec-title">Picking</span>
            <span ref={lineText} className="sec-line" data-testid="backlog" />
            <span ref={tag} className="sec-tag" />
          </span>
          <span className="sec-body" data-testid="lane-outbound">
            <span className="orders">
              <span className="booth booth-checkin" data-booth="desk">
                Orders
              </span>
              <span className="board" />
              <span className="pickers" data-booth="picking" aria-hidden="true">
                {Array.from({ length: lanes }, (_, i) => (
                  <i key={i} className="picker" />
                ))}
                <i className="picker picker-extra" />
              </span>
            </span>
            <span ref={racks} className="racks" data-testid="racks">
              <span className="racks-head">
                <span className="zone-pick">Floor pick</span>
                <span>Reserve</span>
                <span ref={shelfText} className="rack-count" data-testid="stock" />
              </span>
              <i className="pick-zone" />
              <i className="rack" />
              <i className="aisle" />
              <i className="rack" />
              <i className="aisle" />
              <i className="rack" />
            </span>
          </span>
          <span ref={pops} className="pops" aria-hidden="true" />
        </button>
        <div ref={staging} className="staging" data-testid="packing">
          <span className="staging-info">
            <span className="staging-name">Staging</span>
            <span ref={count} className="staging-count" />
            <span ref={rate} className="flow-rate" />
            <span ref={scale} className="flow-key" />
          </span>
          <span className="staging-row">
            {after.map((c) => (
              <span key={c.id} className="booth booth-after" data-booth={c.id} title={c.name}>
                {c.label}
              </span>
            ))}
            <span className="staging-lanes">
              {Array.from({ length: Math.max(1, docks) }, (_, i) => (
                <i key={i} className="stage-lane">
                  <b>{i + 1}</b>
                </i>
              ))}
            </span>
          </span>
        </div>
      </section>
      {children}
      <canvas ref={stillCanvas} className="flow-dots" aria-hidden="true" />
      <canvas ref={canvas} className="flow-dots" aria-hidden="true" data-testid="flow-dots" />
    </div>
  );
}

function span(el: Element, box: DOMRect): Span {
  const r = el.getBoundingClientRect();
  return { left: r.left - box.left, right: r.right - box.left };
}

function rect(el: Element, box: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
}

/** Reads the stations, order board, racks, staging lanes and bays' positions relative to the floor. */
function measureFloor(root: HTMLElement, box: DOMRect, docks: HTMLElement | null): FlowGeometry | null {
  const checkin = root.querySelector('.booth-checkin');
  const board = root.querySelector('.board');
  const racks = root.querySelector('.racks');
  const lane = root.querySelector('.lane-in');
  const po = root.querySelector('.booth-po');
  const row = root.querySelector('.staging-lanes');
  const zone = root.querySelector('.pick-zone');
  const picking = root.querySelector('.picking');
  const staging = root.querySelector('.staging');
  if (picking === null || staging === null || checkin === null || board === null || racks === null || lane === null || po === null || row === null || zone === null) return null;
  const mid = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 - box.top;
  };
  const c = rect(checkin, box);
  const k = rect(racks, box);
  const s = rect(row, box);
  const aisles = [...racks.querySelectorAll('.aisle')].map((el) => mid(el));
  const lanes = [...row.querySelectorAll('.stage-lane')].map((el) => rect(el, box));
  const view = docks?.getBoundingClientRect();
  const top = view === undefined ? 0 : view.top - box.top + 4;
  const bottom = view === undefined ? box.height : view.bottom - box.top;
  const cards = docks === null ? [] : [...docks.querySelectorAll('.dock:not(.dock-next)')];
  // The grid is symmetric, so the aisle, its middle column, is its middle.
  const aisle = view === undefined ? box.width / 2 : (view.left + view.right) / 2 - box.left;
  const inView = (y: number): number => Math.min(bottom + 8, Math.max(top, y));
  return {
    inbound: {
      y: mid(lane),
      start: po.getBoundingClientRect().right - box.left + 3,
      booths: [...lane.querySelectorAll('.booth-in')].map((el) => span(el, box)),
    },
    door: { x: c.left - 4, y: (c.top + c.bottom) / 2 },
    checkin: { left: c.left, right: c.right, y: (c.top + c.bottom) / 2 },
    board: rect(board, box),
    racks: {
      mouth: k.left - 3,
      // The cross aisle runs down the racks' far end, in the room their padding leaves.
      cross: k.right - 4,
      aisles,
      ...rackSlots([...racks.querySelectorAll('.rack')].map((el) => rect(el, box)), aisles, rect(zone, box).right),
    },
    after: [...root.querySelectorAll('.booth-after')].map((el) => span(el, box)),
    afterY: (s.top + s.bottom) / 2,
    // In the gap between the picking and staging panels.
    walk: (picking.getBoundingClientRect().bottom + staging.getBoundingClientRect().top) / 2 - box.top,
    staging: s,
    lanes,
    laneSpots: lanes.map(laneSpots),
    pier: { x: aisle, top: s.bottom + 6 },
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

/**
 * The storage racks: a carton in each location the model fills from the real
 * stock (the empty reserve ones are the bare rack, CSS), and the bare floor
 * pick locations faintly marked.
 */
function drawRacks(ctx: CanvasRenderingContext2D, g: FlowGeometry, flow: FlowModel): void {
  const full = new Path2D();
  const bare = new Path2D();
  g.racks.face.forEach((p, i) => (flow.face[i] === 1 ? full : bare).rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6));
  g.racks.reserve.forEach((p, i) => {
    if (flow.reserve[i] === 1) full.rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
  });
  ctx.fillStyle = PICK_SPOT;
  ctx.fill(bare);
  ctx.fillStyle = BOX;
  ctx.fill(full);
}

/** A fading outline round each rack location that just filled or emptied. */
function drawMarks(ctx: CanvasRenderingContext2D, flow: FlowModel, now: number): void {
  if (flow.marks.length === 0) return;
  ctx.lineWidth = 1;
  for (const m of flow.marks) {
    ctx.globalAlpha = Math.max(0, 1 - (now - m.at) / MARK_MS);
    ctx.strokeStyle = MARK[m.kind];
    ctx.strokeRect(m.x - 3.5, m.y - 3.5, 7, 7);
  }
  ctx.globalAlpha = 1;
}

/** The staging lanes: the real staged count shared out between the docks' lanes, stacked from the dock end. */
function drawStaging(ctx: CanvasRenderingContext2D, g: FlowGeometry, share: number): void {
  const lanes = g.laneSpots;
  const room = lanes.reduce((n, l) => n + l.length, 0);
  const filled = Math.round(share * room);
  if (filled === 0) return;
  ctx.fillStyle = share >= 1 ? TINT.away : BOX;
  ctx.beginPath();
  lanes.forEach((spots, i) => {
    const n = Math.min(spots.length, laneCount(filled, lanes.length, i));
    for (let k = 0; k < n; k++) {
      const p = spots[k] as { x: number; y: number };
      ctx.rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
    }
  });
  ctx.fill();
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

/**
 * Everything on the move, batched by colour, one path each per frame: order
 * tickets as dots, cartons as squares, pickers as figures behind what they
 * carry (a multi-item order's tote filling as it is picked), forklifts and reach trucks as yellow bodies behind their forks
 * (`booths`: the inbound dock's stations, before which stock is on the dock,
 * not a forklift).
 */
function drawDots(ctx: CanvasRenderingContext2D, flow: FlowModel, now: number, booths: number): void {
  const tickets = new Path2D();
  const boxes = new Path2D();
  const people = new Path2D();
  const trucks = new Path2D();
  const totes = new Path2D();
  for (const d of flow.dots) {
    if (d.alpha < 1 || !visible(d, now)) continue;
    const back = d.x - d.dir * 4;
    if (d.kind === 'arr' || d.kind === 'rep') {
      const lift = d.kind === 'rep' || d.leg >= booths;
      if (lift) trucks.rect(back - 2.6, d.y - 2.1, 5.2, 4.2);
      // A reach truck carries its pallet only between lifting it and setting it down.
      if (d.amt > 0 && (d.kind === 'arr' || d.leg >= 2)) boxes.rect(d.x - 2.2, d.y - 2.2, 4.4, 4.4);
      continue;
    }
    if (d.kind === 'dep' && (d.phase === 'pick' || d.phase === 'carry')) {
      people.moveTo(back + 2.1, d.y);
      people.arc(back, d.y, 2.1, 0, Math.PI * 2);
      if (d.items > 1) {
        // A multi-item order: a tote, filled as far as its items are picked.
        totes.rect(d.x - 3.6, d.y - 2.7, 7.2, 5.4);
        const taken = d.items - d.left;
        if (taken > 0) boxes.rect(d.x - 2.2, d.y - 1.3, (4.4 * taken) / d.items, 2.6);
        continue;
      }
      // Walking to the rack with the order in hand: the picker is enough.
      if (d.tint !== 'box') continue;
    }
    if (d.tint === 'box') boxes.rect(d.x - 2.2, d.y - 2.2, 4.4, 4.4);
    else {
      tickets.moveTo(d.x + 2.3, d.y);
      tickets.arc(d.x, d.y, 2.3, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = TINT.out;
  ctx.fill(tickets);
  ctx.fillStyle = PICKER;
  ctx.fill(people);
  ctx.fillStyle = FORKLIFT;
  ctx.fill(trucks);
  ctx.fillStyle = TOTE;
  ctx.fill(totes);
  ctx.fillStyle = BOX;
  ctx.fill(boxes);
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
