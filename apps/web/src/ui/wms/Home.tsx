import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { formatCash, timeOfDay } from '../format.ts';
import type { WarehouseStore } from '../store.ts';

/**
 * The bar over the WMS (W8): the warehouse clock (day and time, a minute a
 * second), cash, what today has earned, and settings, in one row so the floor
 * gets the height. Everything in it changes every tick, so it is written
 * straight to the DOM (P7).
 */
export function HomeTop(props: { store: WarehouseStore; onSettings: () => void }): ReactElement {
  const { store, onSettings } = props;
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
