import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { DEFAULT_SPEED, SPEEDS } from '../../platform/index.ts';
import { formatCash, timeOfDay } from '../format.ts';
import type { WarehouseStore } from '../store.ts';

/** The running speeds the speed button steps through (W9): every speed but pause. */
const RUNNING = SPEEDS.filter((s) => s > 0);

/** The speed after `speed` when the speed button is tapped: the next one up, round to the slowest; from pause, the default. */
export function nextSpeed(speed: number): number {
  if (speed === 0) return DEFAULT_SPEED;
  return RUNNING.find((s) => s > speed) ?? RUNNING[0] ?? DEFAULT_SPEED;
}

/**
 * The bar over the WMS (W8): the warehouse clock (day and time), pause and
 * the speed (W9: warehouse minutes a second), cash, what today has earned,
 * and settings, in one row so the floor gets the height. Everything in it
 * changes every tick, so it is written straight to the DOM (P7).
 */
export function HomeTop(props: { store: WarehouseStore; onSettings: () => void; onSpeed: (speed: number) => void }): ReactElement {
  const { store, onSettings, onSpeed } = props;
  const pause = useRef<HTMLButtonElement>(null);
  const speed = useRef<HTMLButtonElement>(null);
  // The last running speed, to resume at after a pause.
  const running = useRef(DEFAULT_SPEED);
  const day = useRef<HTMLSpanElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const cash = useRef<HTMLSpanElement>(null);
  const today = useRef<HTMLSpanElement>(null);
  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const v = update.view;
        const write = (el: HTMLElement | null, text: string): void => {
          if (el !== null && el.textContent !== text) el.textContent = text;
        };
        write(day.current, `Day ${v.clock.day}`);
        write(time.current, timeOfDay(v.clock.minute));
        write(cash.current, formatCash(v.cash));
        write(today.current, `+${formatCash(v.wms.today.earned)} today`);
        if (update.speed > 0) running.current = update.speed;
        const p = pause.current;
        if (p !== null) {
          write(p, update.speed === 0 ? '▶' : '❚❚');
          p.setAttribute('aria-label', update.speed === 0 ? 'Run the warehouse' : 'Pause the warehouse');
          p.setAttribute('aria-pressed', String(update.speed === 0));
        }
        const s = speed.current;
        if (s !== null) {
          write(s, `${running.current}×`);
          s.setAttribute('aria-label', `Speed: ${running.current} warehouse ${running.current === 1 ? 'minute' : 'minutes'} a second. Tap for ${nextSpeed(update.speed === 0 ? running.current : update.speed)}.`);
          s.dataset.speed = String(update.speed);
        }
        const el = cash.current;
        if (el !== null && update.events.some((e) => e.type === 'wmsShipped') && el.getAnimations?.().length === 0) {
          el.animate?.([{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
        }
      }),
    [store],
  );
  return (
    <div className="home-top">
      <span className="home-clock" data-testid="clock">
        <span ref={day} className="home-day" />
        <span ref={time} className="home-time num" />
      </span>
      <span className="home-speed">
        <button ref={pause} type="button" className="speed-btn" onClick={() => onSpeed(store.current?.speed === 0 ? running.current : 0)} data-testid="pause" />
        <button ref={speed} type="button" className="speed-btn speed-x" onClick={() => onSpeed(nextSpeed(store.current?.speed === 0 ? running.current : (store.current?.speed ?? DEFAULT_SPEED)))} data-testid="speed" />
      </span>
      <span className="home-money">
        <span ref={cash} className="home-cash" data-testid="cash" />
        <span ref={today} className="home-income" data-testid="income" />
      </span>
      <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings} data-testid="settings">
        ⚙
      </button>
    </div>
  );
}
