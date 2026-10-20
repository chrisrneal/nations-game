import type { FriendType } from '@snacks/contracts';

/**
 * Drag and drop for setup, on pointer events (mouse, touch and pen alike).
 * Drag from the tray to a square to place a friend, from one square to
 * another to move it, or off the board to send it back to the tray. Every
 * drag has a tap-only way too: drag is never the only way to do anything.
 *
 * The ghost under the finger and the square it hovers are direct DOM writes,
 * never a React render per frame (P7). Only the drop goes back to React.
 */

export type DragSource = { readonly kind: 'tray'; readonly type: FriendType } | { readonly kind: 'friend'; readonly id: number };

/** Where a drag ended: a square of the board, or null when it was let go off the board. */
export type DropHandler = (source: DragSource, cell: number | null) => void;

/** How far a finger moves before a press becomes a drag, in CSS pixels. */
const DRAG_START_PX = 8;

function cellAt(x: number, y: number): HTMLElement | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('.board [data-cell]') ?? null;
}

export class DragController {
  private active: { source: DragSource; id: number; x0: number; y0: number; label: HTMLElement; ghost: HTMLElement | null; hover: HTMLElement | null } | null = null;
  /** Set when a drag ends: the click the browser may send straight after (mouse) belongs to the drag, not a tap. */
  private dropped = false;

  constructor(private readonly onDrop: () => DropHandler) {}

  /** Call from a pointerdown on a tray button or a friend's square. */
  begin(event: { pointerId: number; clientX: number; clientY: number; button: number; pointerType: string }, source: DragSource, label: HTMLElement): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.stop();
    this.active = { source, id: event.pointerId, x0: event.clientX, y0: event.clientY, label, ghost: null, hover: null };
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('touchmove', this.holdTouch, { passive: false });
  }

  /** True when a click is the tail end of a drag and should be ignored. */
  justDragged(): boolean {
    return this.dropped;
  }

  /** Drop any drag in progress without doing anything (unmount, Go pressed). */
  stop(): void {
    const a = this.active;
    if (a === null) return;
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('touchmove', this.holdTouch);
    a.ghost?.remove();
    if (a.hover !== null) delete a.hover.dataset.drop;
    if (a.ghost !== null) document.body.classList.remove('dragging');
    this.active = null;
  }

  private readonly move = (event: PointerEvent): void => {
    const a = this.active;
    if (a === null || event.pointerId !== a.id) return;
    if (a.ghost === null) {
      if (Math.hypot(event.clientX - a.x0, event.clientY - a.y0) < DRAG_START_PX) return;
      const ghost = a.label.cloneNode(true) as HTMLElement;
      ghost.classList.add('drag-ghost');
      ghost.removeAttribute('id');
      document.body.appendChild(ghost);
      document.body.classList.add('dragging');
      a.ghost = ghost;
    }
    event.preventDefault();
    a.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -60%)`;
    const over = cellAt(event.clientX, event.clientY);
    if (over !== a.hover) {
      if (a.hover !== null) delete a.hover.dataset.drop;
      if (over !== null) over.dataset.drop = '';
      a.hover = over;
    }
  };

  private readonly up = (event: PointerEvent): void => {
    const a = this.active;
    if (a === null || event.pointerId !== a.id) return;
    const dragged = a.ghost !== null;
    // Hide the ghost first so it is not what lies under the finger.
    a.ghost?.remove();
    const over = dragged ? cellAt(event.clientX, event.clientY) : null;
    this.stop();
    if (!dragged) return;
    // That click comes in the same task as the pointerup, so it is over by the next one.
    this.dropped = true;
    setTimeout(() => (this.dropped = false), 0);
    this.onDrop()(a.source, over === null ? null : Number(over.dataset.cell));
  };

  /**
   * While a finger drags, the browser gets no say in its moves. Without this a
   * quick drag can end as a fling, and the browser then swallows the next tap
   * (it only stops the fling).
   */
  private readonly holdTouch = (event: TouchEvent): void => {
    if (event.cancelable) event.preventDefault();
  };

  private readonly cancel = (event: PointerEvent): void => {
    if (this.active !== null && event.pointerId === this.active.id) this.stop();
  };
}
