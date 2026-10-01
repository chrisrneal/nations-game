/**
 * A short-lived floating label ("+$12") over a gate: plain DOM and a CSS
 * animation, removed when it ends, so a departure costs React nothing (P7).
 */
export function pop(container: HTMLElement | null, text: string, kind: 'cash' | 'full' | 'charter'): void {
  if (container === null) return;
  const el = document.createElement('span');
  el.className = `pop pop-${kind}`;
  el.textContent = text;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  container.append(el);
  // A safety net if animations are off (prefers-reduced-motion).
  setTimeout(() => el.remove(), 1500);
}
