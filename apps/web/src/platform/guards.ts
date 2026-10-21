/**
 * Touch guards (decision record K13): a child's finger on a game piece must
 * never open a long-press menu, select text, drag a picture out or pinch the
 * page. CSS does most of it (`user-select`, `-webkit-touch-callout`,
 * `touch-action`, styles.css); these listeners cover what CSS cannot reach,
 * notably Safari's `gesturestart` pinch and Android's long-press menu. Text
 * boxes (a child's name) keep everything.
 */
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function editable(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return t !== null && t !== undefined && ((typeof t.tagName === 'string' && EDITABLE.has(t.tagName)) || t.isContentEditable === true);
}

export function installGuards(target: EventTarget = window): void {
  const stop = (event: Event): void => {
    if (!editable(event.target) && event.cancelable) event.preventDefault();
  };
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) target.addEventListener(type, stop);
  // Safari's pinch events: preventing them is the only way to stop a pinch there.
  for (const type of ['gesturestart', 'gesturechange']) target.addEventListener(type, (event) => event.cancelable && event.preventDefault());
}
