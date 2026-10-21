import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { HomeView } from '@snacks/contracts';
import type { Feedback, GameHost } from '../platform/index.ts';
import { Icon } from './art/Icons.tsx';
import { Avatar } from './Avatar.tsx';
import { ParentMenu } from './ParentMenu.tsx';
import { profileLabel } from './people.ts';
import { UpdateNotice } from './UpdateNotice.tsx';

/** How long a grown-up holds the button (D17): long enough that a quick tap by a child does nothing. */
const HOLD_MS = 1000;

/**
 * Who's playing? (RULES 12, K7): a grid of big pictures, and tapping yours
 * is the whole switch, so a 4-year-old can do it without reading. Adding,
 * changing and deleting profiles is behind a grown-up press-and-hold (D17).
 */
export function Picker(props: {
  home: HomeView;
  host: GameHost;
  feedback?: Feedback | undefined;
  onPick: (id: string) => void;
  onClose?: (() => void) | undefined;
  onToast: (text: string) => void;
}): ReactElement {
  const { home, host, onToast } = props;
  const [parents, setParents] = useState(false);
  return (
    <div className="picker">
      <header className="picker-head">
        <h1 className="picker-title">Who’s playing?</h1>
        {props.onClose !== undefined && (
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        )}
      </header>
      <ul className="picker-grid" aria-label="Players">
        {home.profiles.map((p) => (
          <li key={p.id}>
            <button type="button" className={`picker-tile${p.id === home.current ? ' on' : ''}`} aria-label={`Play as ${profileLabel(p)}`} onClick={() => props.onPick(p.id)}>
              <Avatar id={p.avatar} size={88} />
              <span className="picker-name">{p.name}</span>
              {p.streak > 0 && (
                <span className="picker-streak" aria-label={`Streak ${p.streak}`}>
                  <Icon className="count-icon" name="flame" />
                  {p.streak}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <footer className="picker-foot">
        <UpdateNotice />
        <HoldButton label="Grown-ups" onHold={() => setParents(true)} onTap={() => onToast('Grown-ups: press and hold the button.')}>
          Grown-ups <span className="muted small">(hold)</span>
        </HoldButton>
      </footer>
      {parents && <ParentMenu home={home} host={host} feedback={props.feedback} onToast={onToast} onClose={() => setParents(false)} />}
    </div>
  );
}

/**
 * A button that acts only after being held down (D17). The fill grows with
 * a CSS transition, so nothing re-renders while it is held (P7). A quick
 * tap says what to do instead. When the hold fires, the lift that follows
 * is not a tap: whatever opened under the finger stays untouched.
 */
export function HoldButton(props: { label: string; onHold: () => void; onTap: () => void; children: ReactNode }): ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    ref.current?.classList.remove('holding');
  };
  useEffect(() => stop, []);
  return (
    <button
      ref={ref}
      type="button"
      className="btn hold-btn"
      aria-label={`${props.label} (press and hold)`}
      onPointerDown={() => {
        fired.current = false;
        ref.current?.classList.add('holding');
        timer.current = setTimeout(() => {
          fired.current = true;
          stop();
          props.onHold();
        }, HOLD_MS);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onTouchEnd={(event) => {
        // The menu opened under the finger: lifting it must not tap what is there now.
        if (fired.current) event.preventDefault();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (!fired.current) props.onTap();
        fired.current = false;
      }}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-text">{props.children}</span>
    </button>
  );
}
