import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react';
import { useBackClose } from './useBackClose.ts';

/** How far the head must be pulled down, in px, for the sheet to close. */
const SWIPE_CLOSE_PX = 72;

/** While a finger pulls the sheet, the browser gets no say in its moves: a fling would swallow the next tap (as in drag.ts). */
const holdTouch = (event: TouchEvent): void => {
  if (event.cancelable) event.preventDefault();
};

/**
 * A bottom sheet: content rises from the bottom edge so its actions sit under
 * the thumb (primary actions in the bottom third, docs/ROADMAP.md). It closes
 * with its ✕, the backdrop, Escape, or a swipe down on its head (the grabber
 * and title). The swipe moves the sheet by writing its transform straight to
 * the DOM (P7), never through React.
 */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; label?: string; className?: string }): ReactElement {
  const { onClose } = props;
  const sheetRef = useRef<HTMLElement>(null);
  const pull = useRef<{ id: number; y: number; dy: number } | null>(null);
  // The phone's Back button closes the sheet before it leaves the game (K13).
  useBackClose(true, onClose);
  useEffect(() => () => window.removeEventListener('touchmove', holdTouch), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = (dy: number, animate: boolean): void => {
    const sheet = sheetRef.current;
    if (sheet === null) return;
    sheet.style.transition = animate ? 'transform 160ms ease-out' : 'none';
    sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };

  const onDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest('button') !== null) return;
    pull.current = { id: event.pointerId, y: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener('touchmove', holdTouch, { passive: false });
  };
  const onMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const p = pull.current;
    if (p === null || p.id !== event.pointerId) return;
    p.dy = Math.max(0, event.clientY - p.y);
    move(p.dy, false);
  };
  const onUp = (event: ReactPointerEvent<HTMLElement>): void => {
    const p = pull.current;
    if (p === null || p.id !== event.pointerId) return;
    pull.current = null;
    window.removeEventListener('touchmove', holdTouch);
    if (p.dy >= SWIPE_CLOSE_PX) onClose();
    else move(0, true);
  };

  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <section ref={sheetRef} className={`sheet${props.className ? ` ${props.className}` : ''}`} role="dialog" aria-modal="true" aria-label={props.label ?? props.title}>
        <div className="sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="sheet-grabber" aria-hidden="true" />
          <h2 className="sheet-title">{props.title}</h2>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}
