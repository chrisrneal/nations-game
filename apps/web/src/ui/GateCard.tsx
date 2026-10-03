import { memo, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { formatCash, formatDuration } from './format.ts';
import { flash, flyOff, pop, ripple } from './pop.ts';
import type { AirportStore } from './store.ts';

/** Stands per row: two each side of the pier, the walkway down the middle. */
export const STANDS_PER_ROW = 4;

/** The grid column of a stand: the pier takes the middle column. */
export function standColumn(index: number): number {
  const c = index % STANDS_PER_ROW;
  return c < STANDS_PER_ROW / 2 ? c + 1 : c + 2;
}

/**
 * The gates, drawn like the security scanners: a panel of narrow stands, two
 * each side of a pier that the people walk down. Its header names the plane
 * the gates are getting now.
 */
export function Pier(props: { model: string; children: ReactNode }): ReactElement {
  return (
    <section className="pier" aria-label="Gates">
      <span className="pier-head">
        <span className="pier-title">Gates</span>
        <span className="pier-model">{props.model}</span>
        <span className="pier-tag">Tap: rush</span>
      </span>
      <main className="gates" data-testid="gates">
        {props.children}
      </main>
    </section>
  );
}

interface GateCardProps {
  readonly index: number;
  readonly plane: number;
  readonly turning: boolean;
  readonly charter: boolean;
  readonly seats: number;
  readonly model: string;
  readonly tickMs: number;
  readonly store: AirportStore;
  readonly onTap: (gate: number) => void;
}

/**
 * One gate's stand: the parked plane seen from above, nose up to the pier,
 * whose seats the canvas fills with the people aboard (Concourse); its load
 * and the seconds to departure as text, or the turnaround countdown while the
 * stand is empty. Tapping anywhere on it rushes the gate (RULES 6). React
 * renders it when the plane or phase changes; the text moves by direct DOM
 * writes on every tick (P7).
 */
export const GateCard = memo(function GateCard(props: GateCardProps): ReactElement {
  const { index, plane, turning, charter, model, tickMs, store, onTap } = props;
  const card = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const pops = useRef<HTMLSpanElement>(null);

  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const g = update.view.gates[index];
        if (g === undefined) return;
        for (const event of update.events) {
          if (event.type === 'departed' && event.payload.gate === index) {
            const { cents, full, charter } = event.payload;
            flyOff(pops.current, charter);
            if (full || charter) flash(pops.current, charter ? 'charter' : 'full');
            pop(pops.current, `+${formatCash(cents)}`, charter ? 'charter' : full ? 'full' : 'cash');
          }
        }
        // A plane just left or arrived: React is about to swap the stand; leave it alone.
        if (g.plane !== plane || g.turn > 0 !== turning) return;
        if (g.turn > 0) {
          if (label.current) label.current.textContent = `Back ${formatDuration((g.turn * tickMs) / 1000)}`;
          if (timer.current) timer.current.textContent = '';
        } else {
          if (label.current) label.current.textContent = `${Math.floor(g.boarded / 1000)}/${g.seats}`;
          if (timer.current) timer.current.textContent = g.timerMax === 0 ? '' : formatDuration((g.timer * tickMs) / 1000);
        }
        card.current?.classList.toggle('rushing', g.rushed);
      }),
    [store, index, plane, turning, tickMs],
  );

  const rush = (): void => {
    card.current?.classList.add('rushing');
    onTap(index);
  };

  return (
    <button
      type="button"
      ref={card}
      className={`gate${turning ? ' turning' : ''}${charter ? ' charter' : ''}`}
      style={{ gridColumn: standColumn(index) }}
      data-testid={`gate-${index}`}
      aria-label={`Gate ${index + 1}, ${turning ? 'turning around' : model}. Tap to rush.`}
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
      <span className="gate-head">
        <span className="gate-no">{index + 1}</span>
        {charter && !turning && <span className="badge">x2</span>}
        <span ref={timer} className="gate-time" />
      </span>
      <span className={`gate-plane${turning ? ' away' : ''}`} key={`p${plane}${turning ? 't' : 'b'}`}>
        <span className="gate-body">
          <span className="gate-seats" />
        </span>
      </span>
      <span ref={label} className="gate-count" />
      <span ref={pops} className="pops" aria-hidden="true" />
    </button>
  );
});

/** The next gate to buy, as a dashed stand where it will be: something to aim for. Opens the upgrade sheet. */
export function NextGateCard(props: { number: number; cost: number; affordable: boolean; onOpen: () => void }): ReactElement {
  return (
    <button
      type="button"
      className={`gate gate-next${props.affordable ? ' ready' : ''}`}
      style={{ gridColumn: standColumn(props.number - 1) }}
      onClick={props.onOpen}
      data-testid="next-gate"
      aria-label={`Gate ${props.number}, ${props.affordable ? 'open it now' : 'not built yet'}: ${formatCash(props.cost)}`}
    >
      <span className="gate-head">
        <span className="gate-no">{props.number}</span>
      </span>
      <span className="gate-next-label">{props.affordable ? 'Open it' : 'Not built'}</span>
      <span className="gate-next-cost">{formatCash(props.cost)}</span>
    </button>
  );
}

/** A stand not built yet past the next one: a faint outline filling the pier's first two rows, so the room the airport will grow into shows. */
export function EmptyStand(props: { number: number }): ReactElement {
  return (
    <span className="gate-empty" style={{ gridColumn: standColumn(props.number - 1) }} aria-hidden="true">
      {props.number}
    </span>
  );
}
