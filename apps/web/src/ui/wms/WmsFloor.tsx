import { useLayoutEffect, useRef, type PointerEvent, type ReactElement } from 'react';
import type { WmsStockView, WmsView } from '@warehouse/contracts';
import type { WarehouseStore } from '../store.ts';
import { CARTON, FLASH_MS, POP_MS, WmsFloorModel, ZONES, ZONE_NAMES, binCell, floorLayout, zoneOf, type FloorLayout, type Rect } from './floorModel.ts';

/** Colours (the WMS's dark terminal palette, wms.css). */
const C = {
  band: '#0c1730',
  floor: '#081120',
  rule: '#22344f',
  label: '#8a99b3',
  text: '#eef3fb',
  bay: '#14223a',
  ok: '#3f9c7c',
  low: '#f5b942',
  out: '#ff6b6b',
  trailer: '#2b4c7e',
  conveyor: '#33496d',
  walking: '#6cb6ff',
  picking: '#56d3a0',
  idle: '#5d6b84',
  receiver: '#ff9d6c',
  forklift: '#fff06a',
  pallet: '#e0b073',
  tote: '#4f7fd0',
  ink: '#07101e',
  pop: '#56d3a0',
};
/** Carton colours by priority: P1 Expedite gold, P2 High blue, P3 Standard cardboard. */
const PRIORITY = ['#e0b073', '#ffcc5c', '#6cb6ff', '#e0b073'] as const;
const FONT = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

/** How long a tapped bin's label stays up, ms. */
const FOCUS_MS = 2600;

/**
 * The WMS floor (decision record W7): the warehouse as the WMS runs it,
 * drawn on two canvases (P7): what stands still (bands, racks and their
 * stock, doors, zones and their counts) is redrawn once a WMS step; what
 * moves (pickers, receivers, forklifts, totes, cartons, the truck) every
 * frame from a WmsFloorModel. Tapping a picker or a carton opens its order,
 * a docked trailer its PO, a bin its SKU.
 */
export function WmsFloor(props: { store: WarehouseStore; onOrder: (no: number) => void; onPo: (no: number) => void }): ReactElement {
  const { store, onOrder, onPo } = props;
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const model = useRef<WmsFloorModel>(null);
  model.current ??= new WmsFloorModel();
  const latest = useRef<{ wms: WmsView; tick: number } | null>(null);
  const focus = useRef<{ aisle: number; bay: number; at: number } | null>(null);

  // Each new View: where everything is going. Shipments between Views are kept for the pay pops.
  useLayoutEffect(() => {
    let rev = Number.NaN;
    let shipped: { order: number; cents: number }[] = [];
    return store.onFrame((update) => {
      for (const e of update.events) if (e.type === 'wmsShipped') shipped.push({ order: e.payload.order, cents: e.payload.cents });
      const v = update.view;
      if (v.wms.rev === rev) return;
      rev = v.wms.rev;
      latest.current = { wms: v.wms, tick: v.tick };
      const m = model.current as WmsFloorModel;
      if (m.layout === null && box.current !== null) {
        const r = box.current.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) m.setLayout(floorLayout(r.width, r.height, v.wms.layout));
      }
      m.ingest(v.wms, v.tick, v.tickMs, performance.now(), shipped);
      shipped = [];
      if (live.current !== null) {
        live.current.dataset.pickers = String(m.pickers.length);
        live.current.dataset.walking = String(m.pickers.filter((p) => p.done < p.total).length);
        live.current.dataset.cartons = String(m.cartons.length);
      }
    });
  }, [store]);

  // The box: a new size is a new layout.
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [live.current, still.current]) {
        if (c === null) continue;
        const w = Math.round(r.width * dpr);
        const h = Math.round(r.height * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
          c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      const shape = latest.current?.wms.layout ?? { aisles: 4, bays: 20, doors: 2 };
      model.current?.setLayout(floorLayout(r.width, r.height, shape));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Frames.
  useLayoutEffect(() => {
    const cv = live.current;
    const sv = still.current;
    const ctx = cv?.getContext('2d') ?? null;
    const stx = sv?.getContext('2d') ?? null;
    if (cv === null || sv === null || ctx === null || stx === null) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = performance.now();
    let drawn = -1;
    const draw = (now: number): void => {
      frame = requestAnimationFrame(draw);
      const m = model.current as WmsFloorModel;
      m.setReduced(reduced?.matches === true);
      const dt = Math.min(100, now - last);
      last = now;
      const l = m.layout;
      const w = latest.current;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (l === null || w === null) return;
      m.advance(now, dt);
      if (m.still !== drawn) {
        drawn = m.still;
        stx.clearRect(0, 0, sv.width, sv.height);
        drawStill(stx, l, w.wms);
      }
      drawLive(ctx, l, m, now);
      const f = focus.current;
      if (f !== null) {
        if (now - f.at > FOCUS_MS) focus.current = null;
        else drawFocus(ctx, l, w.wms.stock.find((s) => s.aisle === f.aisle && s.bay === f.bay));
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const tap = (event: PointerEvent<HTMLCanvasElement>): void => {
    const w = latest.current;
    if (w === null || event.button !== 0) return;
    const r = event.currentTarget.getBoundingClientRect();
    const hit = model.current?.hit(event.clientX - r.left, event.clientY - r.top, w.wms) ?? null;
    if (hit === null) return;
    if ('order' in hit) onOrder(hit.order);
    else if ('po' in hit) onPo(hit.po);
    else focus.current = { ...hit, at: performance.now() };
  };

  return (
    <div ref={box} className="wms-floor" data-testid="wms-floor">
      <canvas ref={still} className="wms-floor-canvas" aria-hidden="true" />
      <canvas
        ref={live}
        className="wms-floor-canvas wms-floor-live"
        role="img"
        aria-label="The warehouse floor as the WMS runs it: trucks at the dock doors, receivers, forklifts putting stock away, pickers walking to their bins, totes on the conveyor, and orders at packing, staging and on the truck. Tap a picker or a carton to open its order."
        onPointerDown={tap}
        data-testid="wms-floor-canvas"
      />
    </div>
  );
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour = C.label, size = 9, align: CanvasTextAlign = 'left'): void {
  ctx.fillStyle = colour;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function stroke(ctx: CanvasRenderingContext2D, r: Rect, colour: string, dash: number[] = []): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.strokeRect(r.left + 0.5, r.top + 0.5, r.right - r.left - 1, r.bottom - r.top - 1);
  ctx.setLineDash([]);
}

function stockColour(s: WmsStockView): string {
  return s.status === 'OK' ? C.ok : s.status === 'LOW' ? C.low : C.out;
}

/** Everything that changes only when the WMS steps: the bands, the yard and doors, the racks and their stock, the zones and their counts. */
function drawStill(ctx: CanvasRenderingContext2D, l: FloorLayout, w: WmsView): void {
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.fillStyle = C.band;
  ctx.fillRect(0, l.inbound.top, l.width, l.inbound.bottom - l.inbound.top);
  ctx.fillRect(0, l.outbound.top, l.width, l.outbound.bottom - l.outbound.top);
  // Inbound: in transit, the yard, the doors and their trailers.
  const transit = w.pos.filter((p) => p.status === 'IN TRANSIT').length;
  const yard = w.pos.filter((p) => p.status === 'ARRIVED');
  label(ctx, 'INBOUND', 8, 9);
  label(ctx, `${transit} on the road`, l.width - 8, 9, C.label, 9, 'right');
  stroke(ctx, l.yard, C.rule, [3, 3]);
  label(ctx, yard.length === 0 ? 'YARD' : `YARD ${yard.length}`, l.yard.left + 4, l.yard.top + 7, yard.length > 0 ? C.low : C.label, 8);
  yard.slice(0, 4).forEach((po, i) => {
    const x = l.yard.left + 4 + (i % 2) * ((l.yard.right - l.yard.left - 8) / 2);
    const y = l.yard.top + 14 + Math.floor(i / 2) * 13;
    const wdt = (l.yard.right - l.yard.left - 12) / 2;
    ctx.fillStyle = C.trailer;
    ctx.fillRect(x, y, wdt, 10);
    label(ctx, String(po.no).slice(-3), x + wdt / 2, y + 5, C.text, 7, 'center');
  });
  l.doors.forEach((r, i) => {
    const po = w.pos.find((p) => p.status === 'RECEIVING' && p.door === i + 1);
    stroke(ctx, r, C.rule, [3, 3]);
    label(ctx, `D${i + 1}`, r.left + 3, r.top - 6, C.label, 8);
    if (po !== undefined) {
      ctx.fillStyle = C.trailer;
      ctx.fillRect(r.left + 3, r.top + 3, r.right - r.left - 6, r.bottom - r.top - 6);
      label(ctx, po.code, (r.left + r.right) / 2, r.top + 10, C.text, 8, 'center');
      const bar = { left: r.left + 7, right: r.right - 7, y: r.bottom - 9 };
      ctx.fillStyle = C.ink;
      ctx.fillRect(bar.left, bar.y, bar.right - bar.left, 3);
      ctx.fillStyle = po.exception ? C.low : C.picking;
      ctx.fillRect(bar.left, bar.y, ((bar.right - bar.left) * po.pct) / 100, 3);
    }
  });
  ctx.strokeStyle = C.rule;
  ctx.beginPath();
  ctx.moveTo(l.yard.left, l.dockLane + 6.5);
  ctx.lineTo(l.width - 8, l.dockLane + 6.5);
  ctx.stroke();
  // The racks: every bay faint, the stocked bins filled to their stock (bottom up), coloured by status.
  const deepest = Math.max(200, ...w.stock.map((s) => s.onHand));
  for (let a = 0; a < l.walk.length; a++) {
    label(ctx, String.fromCharCode(65 + a), l.x0 - 9, ((l.rackTop[a] ?? 0) + (l.walk[a] ?? 0)) / 2 + 1, C.label, 9, 'center');
    ctx.fillStyle = C.bay;
    for (let b = 1; b <= l.shape.bays; b++) {
      const cell = binCell(l, a, b);
      ctx.fillRect(cell.left, cell.top, cell.right - cell.left, cell.bottom - cell.top);
    }
    ctx.strokeStyle = C.rule;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(l.x0, (l.walk[a] ?? 0) + 0.5);
    ctx.lineTo(l.width - 8, (l.walk[a] ?? 0) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of w.stock) {
    const cell = binCell(l, s.aisle, s.bay);
    const h = (cell.bottom - cell.top) * Math.min(1, s.onHand / deepest);
    ctx.fillStyle = stockColour(s);
    ctx.fillRect(cell.left, cell.bottom - Math.max(s.onHand > 0 ? 1.5 : 0, h), cell.right - cell.left, Math.max(s.onHand > 0 ? 1.5 : 0, h));
    if (s.status !== 'OK') stroke(ctx, { left: cell.left - 1, top: cell.top - 1, right: cell.right + 1, bottom: cell.bottom + 1 }, stockColour(s));
  }
  // The front cross aisle and the conveyor down to the pack bench.
  const first = l.walk[0] ?? 0;
  const lastWalk = l.walk[l.walk.length - 1] ?? 0;
  ctx.strokeStyle = C.rule;
  ctx.beginPath();
  ctx.moveTo(l.x0 + 0.5, first);
  ctx.lineTo(l.x0 + 0.5, lastWalk);
  ctx.stroke();
  ctx.strokeStyle = C.conveyor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(l.conveyor, first);
  ctx.lineTo(l.conveyor, l.zones.pack.top + 6);
  ctx.lineTo(l.zones.pack.left + 6, l.zones.pack.top + 6);
  ctx.stroke();
  ctx.lineWidth = 1;
  // Outbound: the four zones and how many orders are in each.
  const counts: Record<string, number> = {};
  for (const o of w.orders) {
    const z = zoneOf(o.status);
    if (z !== null) counts[z] = (counts[z] ?? 0) + 1;
  }
  const waiting = w.orders.filter((o) => o.status === 'NEW' || o.status === 'RELEASED' || o.status === 'ALLOCATED' || o.status === 'BACKORDER').length;
  label(ctx, 'OUTBOUND', l.conveyor + 9, l.outbound.top + 9);
  label(ctx, `${waiting} waiting to pick · ${w.orders.filter((o) => o.status === 'PICKING').length} picking`, l.width - 8, l.outbound.top + 9, C.label, 8, 'right');
  for (const z of ZONES) {
    const r = l.zones[z];
    stroke(ctx, r, C.rule, z === 'truck' ? [] : [3, 3]);
    label(ctx, `${ZONE_NAMES[z].toUpperCase()} ${counts[z] ?? 0}`, r.left + 1, r.top - 7, (counts[z] ?? 0) > 0 ? C.text : C.label, 8);
  }
}

/** A person: a filled disc with their number, a ring for their order's priority, an arc for how far through the line they are. */
function person(ctx: CanvasRenderingContext2D, x: number, y: number, id: number, fill: string, ring: string | null, pct: number | null): void {
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ring !== null) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (pct !== null && pct > 0) {
    ctx.beginPath();
    ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  label(ctx, String(id), x, y + 0.5, C.ink, 8, 'center');
}

/** Everything that moves, every frame. */
function drawLive(ctx: CanvasRenderingContext2D, l: FloorLayout, m: WmsFloorModel, now: number): void {
  // Flashes on bins that just filled or emptied.
  for (const f of m.flashes) {
    const cell = binCell(l, f.aisle, f.bay);
    ctx.globalAlpha = Math.max(0, 1 - (now - f.at) / FLASH_MS);
    stroke(ctx, { left: cell.left - 3, top: cell.top - 3, right: cell.right + 3, bottom: cell.bottom + 3 }, f.kind === 'put' ? C.forklift : C.walking);
  }
  ctx.globalAlpha = 1;
  // The truck at the outbound dock, pulling out and backing in.
  const dock = l.zones.truck;
  const shift = m.truckShift(now) * (l.width - dock.left + 12);
  const trailer = { left: dock.left + 2 + shift, top: dock.top + 2, right: dock.right - 12 + shift, bottom: dock.bottom - 2 };
  ctx.fillStyle = '#16243d';
  ctx.fillRect(trailer.left, trailer.top, trailer.right - trailer.left, trailer.bottom - trailer.top);
  ctx.fillStyle = C.trailer;
  ctx.fillRect(trailer.right + 1, trailer.top + 6, 9, trailer.bottom - trailer.top - 12);
  // Cartons: the orders past picking; shipped ones ride with the truck.
  for (const c of m.cartons) {
    const x = c.x + (c.leaving ? shift : 0);
    ctx.fillStyle = PRIORITY[c.priority] ?? PRIORITY[3];
    ctx.fillRect(x - CARTON / 2, c.y - CARTON / 2, CARTON, CARTON);
    if (c.short) {
      ctx.strokeStyle = C.out;
      ctx.strokeRect(x - CARTON / 2 - 0.5, c.y - CARTON / 2 - 0.5, CARTON + 1, CARTON + 1);
    }
  }
  for (const t of m.totes) {
    ctx.fillStyle = C.tote;
    ctx.fillRect(t.x - 3.5, t.y - 3, 7, 6);
    ctx.fillStyle = PRIORITY[t.priority] ?? PRIORITY[3];
    ctx.fillRect(t.x - 2, t.y - 1.5, 4, 3);
  }
  for (const f of m.forklifts) {
    ctx.fillStyle = C.forklift;
    ctx.fillRect(f.x - 4.5, f.y - 3, 7, 6);
    ctx.fillStyle = C.pallet;
    ctx.fillRect(f.x + 2.5, f.y - 2.5, 4, 5);
  }
  for (const r of m.receivers) {
    const working = r.po > 0;
    person(ctx, r.x, r.y, r.id, working ? C.receiver : C.idle, null, working ? r.pct : null);
  }
  for (const p of m.pickers) {
    const walking = p.done < p.total;
    const busy = p.order > 0;
    const ring = busy && p.priority > 0 && p.priority < 3 ? (PRIORITY[p.priority] ?? null) : null;
    person(ctx, p.x, p.y, p.id, !busy ? C.idle : walking ? C.walking : C.picking, ring, busy && !walking ? p.pct : null);
  }
  for (const p of m.pops) {
    const k = (now - p.at) / POP_MS;
    ctx.globalAlpha = Math.max(0, 1 - k);
    label(ctx, p.text, p.x, p.y - 14 * k, C.pop, 10, 'center');
  }
  ctx.globalAlpha = 1;
}

/** A tapped bin's label: SKU, what it is and its stock. */
function drawFocus(ctx: CanvasRenderingContext2D, l: FloorLayout, s: WmsStockView | undefined): void {
  if (s === undefined) return;
  const cell = binCell(l, s.aisle, s.bay);
  const lines = [`${s.sku} · ${s.bin}`, s.desc, `${s.onHand} on hand · ${s.available} free · ${s.status}`];
  ctx.font = `700 9px ${FONT}`;
  const width = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 12;
  const x = Math.min(l.width - width - 4, Math.max(4, (cell.left + cell.right) / 2 - width / 2));
  const y = cell.top - 44 < 0 ? cell.bottom + 6 : cell.top - 44;
  ctx.fillStyle = 'rgb(7 13 24 / 92%)';
  ctx.fillRect(x, y, width, 40);
  stroke(ctx, { left: x, top: y, right: x + width, bottom: y + 40 }, stockColour(s));
  lines.forEach((t, i) => label(ctx, t, x + 6, y + 8 + i * 12, i === 0 ? C.text : C.label, 9));
}
