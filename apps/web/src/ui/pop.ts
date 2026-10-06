/**
 * A short-lived floating label ("+$12") over a dock: plain DOM and a CSS
 * animation, removed when it ends, so a departure costs React nothing (P7).
 */
export function pop(container: HTMLElement | null, text: string, kind: 'cash' | 'full' | 'express'): void {
  if (container === null) return;
  const el = document.createElement('span');
  el.className = `pop pop-${kind}`;
  el.textContent = text;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  container.append(el);
  // A safety net if animations are off (prefers-reduced-motion).
  setTimeout(() => el.remove(), 1500);
}

/** A truck seen from above, cab up: it drives off the dock nose first. */
const TRUCK_PATH = 'M11 1h10a2 2 0 0 1 2 2v5H9V3a2 2 0 0 1 2-2zM8 9h16v22H8z';

/** A truck leaving the dock: drives up and away, then removes itself. */
export function flyOff(container: HTMLElement | null, express: boolean): void {
  if (container === null) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', `fly${express ? ' fly-express' : ''}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', TRUCK_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  svg.addEventListener('animationend', () => svg.remove(), { once: true });
  container.append(svg);
  setTimeout(() => svg.remove(), 1500);
}

/** A soft flash over the whole card (a full shipment). */
export function flash(container: HTMLElement | null, kind: 'full' | 'express'): void {
  if (container === null) return;
  const el = document.createElement('span');
  el.className = `flash flash-${kind}`;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  container.append(el);
  setTimeout(() => el.remove(), 1500);
}

/** A ripple where the thumb touched. */
export function ripple(container: HTMLElement | null, x: number, y: number): void {
  if (container === null) return;
  const el = document.createElement('span');
  el.className = 'ripple';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  container.append(el);
  setTimeout(() => el.remove(), 1500);
}
