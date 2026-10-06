import { memo, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { formatCash, formatDuration } from './format.ts';
import { flash, flyOff, pop, ripple } from './pop.ts';
import type { WarehouseStore } from './store.ts';

/** Stands per row: two each side of the pier, the walkway down the middle. */
export const STANDS_PER_ROW = 4;

/** The grid column of a stand: the pier takes the middle column. */
export function standColumn(index: number): number {
  const c = index % STANDS_PER_ROW;
  return c < STANDS_PER_ROW / 2 ? c + 1 : c + 2;
}

/**
 * The docks, drawn like the picking scanners: a panel of narrow stands, two
 * each side of a pier that the people walk down. Its header names the truck
 * the docks are getting now.
 */
export function Pier(props: { model: string; children: ReactNode }): ReactElement {
  return (
    <section className="pier" aria-label="Docks">
      <span className="pier-head">
        <span className="pier-title">Docks</span>
        <span className="pier-model">{props.model}</span>
        <span className="pier-tag">Tap: rush</span>
      </span>
      <main className="docks" data-testid="docks">
        {props.children}
      </main>
    </section>
  );
}

interface DockCardProps {
  readonly index: number;
  readonly truck: number;
  readonly turning: boolean;
  readonly express: boolean;
  readonly parcels: number;
  readonly model: string;
  readonly tickMs: number;
  readonly store: WarehouseStore;
  readonly onTap: (dock: number) => void;
}

/**
 * One dock's stand: the parked truck seen from above, nose up to the pier,
 * whose parcels the canvas fills with the people aboard (Floor); its load
 * and the seconds to departure as text, or the turnaround countdown while the
 * stand is empty. Tapping anywhere on it rushes the dock (RULES 6). React
 * renders it when the truck or phase changes; the text moves by direct DOM
 * writes on every tick (P7).
 */
export const DockCard = memo(function DockCard(props: DockCardProps): ReactElement {
  const { index, truck, turning, express, model, tickMs, store, onTap } = props;
  const card = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const pops = useRef<HTMLSpanElement>(null);

  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const g = update.view.docks[index];
        if (g === undefined) return;
        for (const event of update.events) {
          if (event.type === 'departed' && event.payload.dock === index) {
            const { cents, full, express } = event.payload;
            flyOff(pops.current, express);
            if (full || express) flash(pops.current, express ? 'express' : 'full');
            pop(pops.current, `+${formatCash(cents)}`, express ? 'express' : full ? 'full' : 'cash');
          }
        }
        // A truck just left or arrived: React is about to swap the stand; leave it alone.
        if (g.truck !== truck || g.turn > 0 !== turning) return;
        if (g.turn > 0) {
          if (label.current) label.current.textContent = `Back ${formatDuration((g.turn * tickMs) / 1000)}`;
          if (timer.current) timer.current.textContent = '';
        } else {
          if (label.current) label.current.textContent = `${Math.floor(g.loaded / 1000)}/${g.parcels}`;
          if (timer.current) timer.current.textContent = g.timerMax === 0 ? '' : formatDuration((g.timer * tickMs) / 1000);
        }
        card.current?.classList.toggle('rushing', g.rushed);
      }),
    [store, index, truck, turning, tickMs],
  );

  const rush = (): void => {
    card.current?.classList.add('rushing');
    onTap(index);
  };

  return (
    <button
      type="button"
      ref={card}
      className={`dock${turning ? ' turning' : ''}${express ? ' express' : ''}`}
      style={{ gridColumn: standColumn(index) }}
      data-testid={`dock-${index}`}
      aria-label={`Dock ${index + 1}, ${turning ? 'turning around' : model}. Tap to rush.`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        ripple(pops.current, event.clientX - box.left, event.clientY - box.top);
        rush();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          rush();
        }
      }}
    >
      <span className="dock-head">
        <span className="dock-no">{index + 1}</span>
        {express && !turning && <span className="badge">x2</span>}
        <span ref={timer} className="dock-time" />
      </span>
      <span className={`dock-truck${turning ? ' away' : ''}`} key={`p${truck}${turning ? 't' : 'b'}`}>
        <span className="dock-body">
          <span className="dock-parcels" />
        </span>
      </span>
      <span ref={label} className="dock-count" />
      <span ref={pops} className="pops" aria-hidden="true" />
    </button>
  );
});

/** The next dock to buy, as a dashed stand where it will be: something to aim for. Opens the upgrade sheet. */
export function NextDockCard(props: { number: number; cost: number; affordable: boolean; onOpen: () => void }): ReactElement {
  return (
    <button
      type="button"
      className={`dock dock-next${props.affordable ? ' ready' : ''}`}
      style={{ gridColumn: standColumn(props.number - 1) }}
      onClick={props.onOpen}
      data-testid="next-dock"
      aria-label={`Dock ${props.number}, ${props.affordable ? 'open it now' : 'not built yet'}: ${formatCash(props.cost)}`}
    >
      <span className="dock-head">
        <span className="dock-no">{props.number}</span>
      </span>
      <span className="dock-next-label">{props.affordable ? 'Open it' : 'Not built'}</span>
      <span className="dock-next-cost">{formatCash(props.cost)}</span>
    </button>
  );
}

/** A stand not built yet past the next one: a faint outline filling the pier's first two rows, so the room the warehouse will grow into shows. */
export function EmptyStand(props: { number: number }): ReactElement {
  return (
    <span className="dock-empty" style={{ gridColumn: standColumn(props.number - 1) }} aria-hidden="true">
      {props.number}
    </span>
  );
}
