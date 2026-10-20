import type { GameView, WaveResult } from '@snacks/contracts';
import { waveTimeline, type Flight, type Timeline, type TimelineOptions } from './timeline.ts';

/**
 * Plays a wave back over the board (RULES 7, K9) from its timeline
 * (timeline.ts): every snack flies its real route, arcing as its thrower
 * throws, friends bob as they catch and pass, lunchbox lids pop, a fed kid
 * dances and goes home happy, a tummy ache wobbles, the Nurse sends sparkles,
 * a hungry kid walks home sad, and in Kindy a wrong snack bounces off a
 * shaking head.
 *
 * Only `transform` and `opacity` move, through the Web Animations API, so the
 * browser can run it all off the main thread; faces change by one attribute
 * write at the moment they change. Never a React render per frame (P7).
 * `view` is the board as it stood when Go was pressed.
 */
export interface Replay {
  readonly done: Promise<void>;
  readonly timeline: Timeline;
  cancel(): void;
}

const OUTCOME: Readonly<Record<'yum' | 'ache' | 'shake', string>> = { yum: 'happy', ache: 'ache', shake: 'shake' };
const MOOD: Readonly<Record<'yum' | 'ache' | 'shake', string>> = { yum: 'yum', ache: 'ache', shake: 'sad' };

export function playWave(overlay: HTMLElement, board: HTMLElement, view: GameView, wave: WaveResult, options: TimelineOptions): Replay {
  const timeline = waveTimeline(view, wave, options);
  const { calm } = options;
  const box = overlay.getBoundingClientRect();
  const sx = box.width / view.width;
  const sy = box.height / view.height;
  const size = Math.min(sx, sy);
  const animations: Animation[] = [];
  const made: Element[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const marked: HTMLElement[] = [];
  const cellEl = (cell: number): HTMLElement | null => board.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
  const at = (ms: number, run: () => void): void => {
    timers.push(setTimeout(run, ms));
  };
  const animate = (el: Element | null | undefined, frames: Keyframe[], timing: KeyframeAnimationOptions): void => {
    if (el === null || el === undefined) return;
    animations.push(el.animate(frames, { fill: 'backwards', easing: 'ease-in-out', ...timing }));
  };
  const mark = (cell: HTMLElement, key: 'mood' | 'outcome', value: string): void => {
    cell.dataset[key] = value;
    if (!marked.includes(cell)) marked.push(cell);
  };

  for (const flight of timeline.flights) flyOne(flight);

  function flyOne(flight: Flight): void {
    const el = document.createElement('span');
    el.className = 'flying-snack';
    el.style.width = `${size * 0.62}px`;
    el.style.height = `${size * 0.62}px`;
    const shadow = document.createElement('span');
    shadow.className = 'fly-shadow';
    const lift = document.createElement('span');
    lift.className = 'fly-lift';
    // The very picture in the lunchbox, so the flying snack is the same drawing.
    const picture = cellEl(flight.lunchbox)?.querySelector('.art-snack')?.cloneNode(true);
    if (picture !== undefined) lift.appendChild(picture);
    el.append(shadow, lift);
    overlay.appendChild(el);
    made.push(el);
    const end = Math.max(1, flight.end);
    const eaten = flight.ending === 'fed' || flight.ending === 'ache';
    const ground: Keyframe[] = [];
    const air: Keyframe[] = [];
    const under: Keyframe[] = [];
    for (const p of flight.points) {
      const offset = p.t / end;
      const fading = p.t > flight.arrive ? (p.t - flight.arrive) / Math.max(1, end - flight.arrive) : 0;
      const grow = p.t === 0 ? 0.55 : 1;
      const scale = eaten ? grow * (1 - 0.6 * fading) : grow;
      const turn = flight.spin ? Math.round((p.t / end) * 300) : 0;
      ground.push({ offset, opacity: 1 - fading, transform: `translate(${(p.x + 0.5) * sx}px, ${(p.y + 0.5) * sy}px) translate(-50%, -50%)` });
      air.push({ offset, transform: `translateY(${(-p.lift * size).toFixed(1)}px) rotate(${turn}deg) scale(${scale.toFixed(3)})` });
      under.push({ offset, opacity: 0.35 - p.lift * 0.25, transform: `scale(${(1 - p.lift * 0.5).toFixed(3)})` });
    }
    animate(el, ground, { duration: end, easing: 'linear', fill: 'forwards' });
    animate(lift, air, { duration: end, easing: 'linear', fill: 'forwards' });
    animate(shadow, under, { duration: end, easing: 'linear', fill: 'forwards' });
    // The picker winds up and throws as the snack reaches it.
    if (flight.picker >= 0 && !calm) bob(cellEl(flight.picker), options.beatMs);
  }

  function bob(cell: HTMLElement | null, when: number): void {
    animate(cell?.querySelector('.friend .art'), [{ transform: 'none' }, { transform: 'translateY(-14%) scale(1.08)' }, { transform: 'none' }], { duration: 260, delay: Math.max(0, when - 80) });
  }

  for (const event of timeline.events) {
    const cell = cellEl(event.cell);
    if (cell === null) continue;
    const kid = cell.querySelector<HTMLElement>('.kid');
    switch (event.kind) {
      case 'pickup':
        animate(cell.querySelector('.lunchbox-lid'), [{ transform: 'none' }, { transform: 'translateY(-10%) rotate(-14deg)' }, { transform: 'none' }], { duration: 380, delay: event.at });
        break;
      case 'catch':
        if (!calm) bob(cell, event.at);
        break;
      case 'react':
        at(event.at, () => {
          mark(cell, 'mood', MOOD[event.mood]);
          mark(cell, 'outcome', OUTCOME[event.mood]);
        });
        if (event.mood === 'shake') at(event.at + 900, () => delete cell.dataset.mood);
        if (calm) animate(kid, [{ opacity: 1 }, { opacity: 0.7 }, { opacity: 1 }], { duration: 500, delay: event.at });
        else if (event.mood === 'yum')
          animate(kid, [{ transform: 'none' }, { transform: 'translateY(-12%) rotate(-8deg)' }, { transform: 'none' }, { transform: 'translateY(-12%) rotate(8deg)' }, { transform: 'none' }], { duration: 520, delay: event.at, iterations: 2 });
        else if (event.mood === 'ache')
          animate(kid, [{ transform: 'none' }, { transform: 'translateX(-8%) rotate(-7deg)' }, { transform: 'translateX(8%) rotate(7deg)' }, { transform: 'none' }], { duration: 340, delay: event.at, iterations: 3 });
        else animate(kid, [{ transform: 'none' }, { transform: 'translateX(-10%) rotate(-6deg)' }, { transform: 'translateX(10%) rotate(6deg)' }, { transform: 'none' }], { duration: 300, delay: event.at, iterations: 3 });
        break;
      case 'heal':
        healOne(event.nurse, event.cell, event.at, event.ms, cell);
        break;
      case 'walk': {
        const [x, y] = [event.cell % view.width, Math.floor(event.cell / view.width)];
        const dx = (event.to[0] - x) * sx;
        const dy = (event.to[1] - y) * sy;
        at(event.at, () => mark(cell, 'mood', event.mood === 'yum' ? 'yum' : 'sad'));
        if (calm) {
          animate(kid, [{ opacity: 1 }, { opacity: 0.25 }], { duration: event.ms, delay: event.at, fill: 'forwards' });
          break;
        }
        // Happy: a skip home; sad: a slow, droopy walk.
        const steps = event.mood === 'yum' ? 4 : 5;
        const frames: Keyframe[] = [];
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const hop = event.mood === 'yum' ? (i % 2 === 1 ? -0.18 * size : 0) : 0;
          const tilt = event.mood === 'yum' ? 0 : i % 2 === 1 ? 4 : -4;
          frames.push({ offset: u, opacity: u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1, transform: `translate(${(dx * u).toFixed(1)}px, ${(dy * u + hop).toFixed(1)}px) rotate(${i === steps ? 0 : tilt}deg) scale(${event.mood === 'yum' ? 1 : 0.94})` });
        }
        animate(kid, frames, { duration: event.ms, delay: event.at, easing: 'linear', fill: 'forwards' });
        break;
      }
    }
  }

  /** The Nurse's sparkles: little stars from the Nurse to the kid, then the kid feels better. */
  function healOne(nurse: number, kidCell: number, when: number, ms: number, cell: HTMLElement): void {
    at(when + ms * 0.6, () => mark(cell, 'mood', 'ok'));
    const to = { x: ((kidCell % view.width) + 0.5) * sx, y: (Math.floor(kidCell / view.width) + 0.5) * sy };
    const from = nurse < 0 ? to : { x: ((nurse % view.width) + 0.5) * sx, y: (Math.floor(nurse / view.width) + 0.5) * sy };
    if (calm) {
      animate(cell.querySelector('.kid'), [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: ms, delay: when });
      return;
    }
    bob(cellEl(nurse), when);
    for (let i = 0; i < 6; i++) {
      const spark = document.createElement('span');
      spark.className = 'sparkle';
      spark.style.width = spark.style.height = `${size * 0.3}px`;
      overlay.appendChild(spark);
      made.push(spark);
      const spread = ((i % 3) - 1) * size * 0.35;
      const rise = (i < 3 ? -1 : 1) * size * 0.25;
      const place = (x: number, y: number, s: number): string => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s}) rotate(${i * 30}deg)`;
      animate(
        spark,
        [
          { opacity: 0, transform: place(from.x, from.y, 0.3) },
          { opacity: 1, transform: place((from.x + to.x) / 2 + spread, (from.y + to.y) / 2 + rise - size * 0.4, 1) },
          { opacity: 1, transform: place(to.x + spread * 0.6, to.y + rise, 0.9) },
          { opacity: 0, transform: place(to.x, to.y - size * 0.3, 0.2) },
        ],
        { duration: ms, delay: when + i * 70, fill: 'both' },
      );
    }
  }

  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const end = setTimeout(() => cleanup(), timeline.duration);
  let over = false;
  function cleanup(): void {
    if (over) return;
    over = true;
    clearTimeout(end);
    for (const t of timers) clearTimeout(t);
    for (const a of animations) a.cancel();
    for (const el of made) el.remove();
    for (const el of marked) {
      delete el.dataset.outcome;
      delete el.dataset.mood;
    }
    finish();
  }
  return { done, timeline, cancel: cleanup };
}
