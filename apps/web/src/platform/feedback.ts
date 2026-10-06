/**
 * Haptics and sound (slice 7). Device APIs live here, in the platform, so the
 * interface only says what happened ("a full shipment left") and never touches
 * `navigator.vibrate` or an AudioContext itself.
 *
 * - Haptics are on by default where the device supports them (Android
 *   browsers; iOS Safari has no vibration API, so nothing happens there).
 * - Sound is off by default. Turning it on is a tap, which is the user gesture
 *   browsers require before audio can start. Every sound is synthesized: no
 *   audio files to download or cache.
 */
export interface Prefs {
  readonly sound: boolean;
  readonly haptics: boolean;
}

export const DEFAULT_PREFS: Prefs = { sound: false, haptics: true };
const KEY = 'warehouse-prefs';

export function loadPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { sound: parsed.sound === true, haptics: parsed.haptics !== false };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or full storage: the preference lasts until the app closes.
  }
}

export type Cue = 'tap' | 'depart' | 'full' | 'express' | 'buy' | 'unlock' | 'collect' | 'boost';

export interface Feedback {
  readonly prefs: Prefs;
  setPrefs(prefs: Prefs): void;
  /** Haptics are possible on this device. */
  readonly canVibrate: boolean;
  cue(cue: Cue): void;
}

const VIBRATE: Readonly<Partial<Record<Cue, number | number[]>>> = {
  tap: 8,
  buy: 15,
  express: [15, 40, 15],
  unlock: [20, 50, 30],
  collect: [10, 30, 10, 30, 25],
  boost: [30, 30, 60],
};

/** Notes for each cue: [frequency Hz, start s, length s]. */
const NOTES: Readonly<Partial<Record<Cue, readonly (readonly [number, number, number])[]>>> = {
  tap: [[1400, 0, 0.025]],
  depart: [[520, 0, 0.08]],
  full: [
    [660, 0, 0.07],
    [990, 0.06, 0.1],
  ],
  express: [
    [784, 0, 0.07],
    [988, 0.07, 0.07],
    [1319, 0.14, 0.14],
  ],
  buy: [[880, 0, 0.06]],
  unlock: [
    [523, 0, 0.08],
    [659, 0.08, 0.08],
    [784, 0.16, 0.08],
    [1047, 0.24, 0.18],
  ],
  collect: [
    [784, 0, 0.08],
    [1047, 0.08, 0.2],
  ],
  // A quick rising sweep: something just got faster.
  boost: [
    [392, 0, 0.06],
    [587, 0.05, 0.06],
    [784, 0.1, 0.06],
    [1175, 0.15, 0.22],
  ],
};

/** Departures can come several a second with eight docks; at most this many sounds a second. */
const MAX_SOUNDS_PER_SEC = 5;

export function createFeedback(initial: Prefs = loadPrefs()): Feedback {
  let prefs = initial;
  let audio: AudioContext | null = null;
  let recent: number[] = [];
  const nav = globalThis.navigator as Navigator | undefined;
  const canVibrate = typeof nav?.vibrate === 'function';

  const context = (): AudioContext | null => {
    if (audio !== null) return audio;
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return null;
    audio = new Ctor();
    return audio;
  };

  const play = (cue: Cue): void => {
    const notes = NOTES[cue];
    const ctx = context();
    if (notes === undefined || ctx === null) return;
    const now = ctx.currentTime;
    const wall = performance.now();
    recent = recent.filter((t) => wall - t < 1000);
    if (cue !== 'buy' && cue !== 'unlock' && cue !== 'collect' && cue !== 'boost' && recent.length >= MAX_SOUNDS_PER_SEC) return;
    recent.push(wall);
    for (const [freq, start, length] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cue === 'tap' ? 'square' : 'triangle';
      osc.frequency.value = freq;
      const peak = cue === 'tap' ? 0.03 : 0.12;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(peak, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + length + 0.02);
    }
  };

  return {
    get prefs() {
      return prefs;
    },
    canVibrate,
    setPrefs(next) {
      prefs = next;
      savePrefs(next);
      // Turning sound on is a tap: start (or resume) audio inside that gesture, with a confirming note.
      if (next.sound) {
        void context()?.resume();
        play('buy');
      }
    },
    cue(cue) {
      if (prefs.haptics && canVibrate) {
        const pattern = VIBRATE[cue];
        if (pattern !== undefined) nav?.vibrate(pattern);
      }
      if (prefs.sound) play(cue);
    },
  };
}
