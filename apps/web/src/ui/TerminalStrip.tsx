import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { formatRate, short } from './format.ts';
import type { AirportStore } from './store.ts';

/** The terminal: passengers waiting against the room, and the arrival rate (written every tick). */
export function TerminalStrip(props: { store: AirportStore; tickMs: number }): ReactElement {
  const { store, tickMs } = props;
  const bar = useRef<HTMLElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const rate = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const t = update.view.terminal;
        if (bar.current) bar.current.style.transform = `scaleX(${t.cap === 0 ? 0 : t.waiting / t.cap})`;
        if (text.current) text.current.textContent = `${short(t.waiting / 1000)} / ${short(t.cap / 1000)} waiting`;
        if (rate.current) rate.current.textContent = `+${formatRate((t.arrivalPerTick * 1000) / tickMs)}`;
      }),
    [store, tickMs],
  );
  return (
    <section className="terminal" aria-label="Terminal" data-testid="terminal">
      <div className="terminal-row">
        <span className="terminal-name">Terminal</span>
        <span ref={text} />
        <span ref={rate} className="muted" />
      </div>
      <span className="bar bar-terminal">
        <i ref={bar} />
      </span>
    </section>
  );
}
