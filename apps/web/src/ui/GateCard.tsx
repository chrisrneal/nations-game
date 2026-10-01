import { memo, useLayoutEffect, useRef, type ReactElement } from 'react';
import { formatCash, formatDuration } from './format.ts';
import { PlaneIcon } from './PlaneIcon.tsx';
import { flash, flyOff, pop, ripple } from './pop.ts';
import type { AirportStore } from './store.ts';

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
 * One gate: the plane, its fill bar and timer, or the turnaround bar. Tapping
 * anywhere on the card rushes it (RULES 6). React renders it when the plane or
 * phase changes; the bars move by direct DOM writes on every tick (P7).
 */
export const GateCard = memo(function GateCard(props: GateCardProps): ReactElement {
  const { index, plane, turning, charter, model, tickMs, store, onTap } = props;
  const card = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const timer = useRef<HTMLElement>(null);
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
            pop(pops.current, `+${formatCash(cents)}${full ? ' full' : ''}`, charter ? 'charter' : full ? 'full' : 'cash');
          }
        }
        // A plane just left or arrived: React is about to swap the bars; leave these alone.
        if (g.plane !== plane || g.turn > 0 !== turning) return;
        if (g.turn > 0) {
          const done = 1 - g.turn / Math.max(1, g.turnMax);
          if (bar.current) bar.current.style.transform = `scaleX(${done})`;
          if (label.current) label.current.textContent = formatDuration((g.turn * tickMs) / 1000);
        } else {
          if (bar.current) bar.current.style.transform = `scaleX(${g.boarded / (g.seats * 1000)})`;
          if (label.current) label.current.textContent = `${Math.floor(g.boarded / 1000)}/${g.seats}`;
          if (timer.current) timer.current.style.transform = `scaleX(${g.timerMax === 0 ? 0 : g.timer / g.timerMax})`;
        }
        card.current?.classList.toggle('rushing', g.rush > 0);
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
        <span className="gate-no">Gate {index + 1}</span>
        {charter && !turning && <span className="badge">Charter x2</span>}
      </span>
      <span className="gate-plane" key={`p${plane}${turning ? 't' : 'b'}`}>
        <PlaneIcon className={`plane-icon${turning ? ' away' : ''}`} />
        <span className="gate-model">{turning ? 'Turnaround' : model}</span>
      </span>
      <span className={`bar${turning ? ' bar-turn' : ''}`} key={`b${plane}${turning ? 't' : 'b'}`}>
        <i ref={bar} />
      </span>
      <span className="gate-foot">
        <span ref={label} className="gate-count" />
        {!turning && (
          <span className="timer" key={`t${plane}`} aria-hidden="true">
            <i ref={timer} />
          </span>
        )}
      </span>
      <span ref={pops} className="pops" aria-hidden="true" />
    </button>
  );
});

/** The next gate to buy, as a dashed card where it will stand: something to aim for. Opens the upgrade sheet. */
export function NextGateCard(props: { number: number; cost: number; affordable: boolean; onOpen: () => void }): ReactElement {
  return (
    <button type="button" className={`gate gate-next${props.affordable ? ' ready' : ''}`} onClick={props.onOpen} data-testid="next-gate">
      <span className="gate-head">
        <span className="gate-no">Gate {props.number}</span>
      </span>
      <span className="gate-next-label">{props.affordable ? 'Open it now' : 'Not built yet'}</span>
      <span className="gate-next-cost">{formatCash(props.cost)}</span>
    </button>
  );
}
