import type { GameView, WaveResult } from '@snacks/contracts';
import { kidReaction } from './kindy.ts';
import { SNACK_EMOJI } from './labels.ts';

/**
 * Plays a wave back over the board (RULES 7): every snack flies its route at
 * once, a beat at a time, then each kid reacts. Direct DOM writes and the Web
 * Animations API only, never a React render per frame (P7). `view` is the
 * board as it stood when Go was pressed.
 */
export interface Replay {
  readonly done: Promise<void>;
  cancel(): void;
}

const REACTION_MS = 900;

export function playWave(overlay: HTMLElement, board: HTMLElement, view: GameView, wave: WaveResult, beatMs: number): Replay {
  const { width, height } = view;
  const spot = (x: number, y: number): Keyframe => ({ left: `${((x + 0.5) / width) * 100}%`, top: `${((y + 0.5) / height) * 100}%` });
  const animations: Animation[] = [];
  const made: HTMLElement[] = [];
  let longest = 0;

  for (const trace of wave.snacks) {
    const el = document.createElement('span');
    // Drawn by CSS from data-pic: no text on the page, as Kindy needs (Pic.tsx).
    el.className = 'flying-snack pic';
    el.dataset.pic = SNACK_EMOJI[trace.snack];
    overlay.appendChild(el);
    made.push(el);
    // One beat out of the lunchbox to the picker, then each throw.
    const total = 1 + trace.beats;
    const box = { x: trace.lunchbox % width, y: Math.floor(trace.lunchbox / width) };
    const first = trace.hops[0];
    const frames: Keyframe[] = [{ ...spot(box.x, box.y), offset: 0, opacity: 1, transform: 'translate(-50%, -50%) scale(0.6)' }];
    let beats = 1;
    if (first !== undefined) frames.push({ ...spot(first.fromX, first.fromY), offset: beats / total, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' });
    for (const hop of trace.hops) {
      beats += hop.beats;
      frames.push({ ...spot(hop.toX, hop.toY), offset: beats / total, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' });
    }
    const flight = total * beatMs;
    const ending: Keyframe =
      trace.end === 'fed'
        ? { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }
        : trace.end === 'ache' || trace.end === 'bounced'
          ? { transform: 'translate(-50%, -80%) scale(0.8) rotate(40deg)', opacity: 0 }
          : { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 };
    const last = frames[frames.length - 1]!;
    const all = [...frames.map((f) => ({ ...f, offset: ((f.offset as number) * flight) / (flight + 300) })), { ...last, ...ending, offset: 1 }];
    animations.push(el.animate(all, { duration: flight + 300, easing: 'linear', fill: 'forwards' }));
    longest = Math.max(longest, flight + 300);
  }

  // Each kid reacts once the snacks have landed: a happy dance, a wobble, a sad walk home, or (Kindy) a head shake at a wrong snack.
  const marked: HTMLElement[] = [];
  const timer = setTimeout(() => {
    for (const outcome of wave.kids) {
      const kid = view.kids.find((k) => k.id === outcome.kid);
      const cell = kid === undefined ? null : board.querySelector<HTMLElement>(`[data-cell="${kid.cell}"]`);
      if (cell === null) continue;
      cell.dataset.outcome = outcome.end === 'happy' ? 'happy' : outcome.ache ? 'ache' : outcome.end === 'waits' ? kidReaction(wave, outcome.kid) : outcome.end;
      marked.push(cell);
    }
  }, longest);

  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const end = setTimeout(() => cleanup(), longest + REACTION_MS);
  function cleanup(): void {
    clearTimeout(timer);
    clearTimeout(end);
    for (const a of animations) a.cancel();
    for (const el of made) el.remove();
    for (const el of marked) delete el.dataset.outcome;
    finish();
  }
  return { done, cancel: cleanup };
}
