/**
 * Haptics and sound (decision record K12). Device APIs live here, in the
 * platform, so the interface only says what happened ("a kid was fed") and
 * never touches `navigator.vibrate` or an AudioContext itself.
 *
 * - Sound is on, gently, for every child, and a grown-up mutes a child in the
 *   grown-ups' menu; the mute is kept per profile. Every sound is synthesized
 *   (sounds.ts): no audio files to download or cache.
 * - iOS only lets audio start inside a touch, so the first touch anywhere
 *   builds the audio context and starts it (and a silent sound with it). The
 *   context is put to sleep while the app is hidden and woken when it is back.
 * - Haptics are a short buzz on a catch and at the end of a wave, where the
 *   phone has `navigator.vibrate` (Android). iOS Safari has none, so nothing
 *   happens there. Nothing here ever throws.
 * - Spoken Kindy hints (`voice`, speech.ts) are on by default; a grown-up
 *   turns them off in the grown-ups' menu (D16).
 */
import { MASTER_VOLUME, playCue, type Cue } from './sounds.ts';

export type { Cue } from './sounds.ts';

export interface Prefs {
  readonly haptics: boolean;
  /** Kindy hints are spoken as well as shown (D16). */
  readonly voice: boolean;
  /** Profiles (ids) whose sound is off. Everyone else hears it. */
  readonly muted: readonly string[];
}

export const DEFAULT_PREFS: Prefs = { haptics: true, voice: true, muted: [] };
const KEY = 'snacks-prefs';

export function loadPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as { haptics?: unknown; voice?: unknown; muted?: unknown };
    // Saved before the mute existed? Its phone-wide "sound" switch (off unless turned on) is dropped on purpose.
    const muted = Array.isArray(parsed.muted) ? [...new Set(parsed.muted.filter((id): id is string => typeof id === 'string'))] : [];
    return { haptics: parsed.haptics !== false, voice: parsed.voice !== false, muted };
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

/** The two moments a buzz means something. */
export type Haptic = 'catch' | 'waveEnd';

export interface Feedback {
  readonly prefs: Prefs;
  setPrefs(prefs: Prefs): void;
  /** Haptics are possible on this device. */
  readonly canVibrate: boolean;
  /** Whose game is on screen: sound follows that child's mute. Null in the picker, where nothing plays. */
  setProfile(id: string | null): void;
  isMuted(profile: string): boolean;
  /** Mutes or unmutes one profile and keeps the choice. Unmuting plays a small blip to show it works. */
  setMuted(profile: string, muted: boolean): void;
  cue(cue: Cue): void;
  haptic(kind: Haptic): void;
}

/** What the browser provides, so tests can stand in for it. Anything left out comes from the real browser. */
export interface FeedbackEnv {
  makeContext?: (() => AudioContext | null) | undefined;
  vibrate?: ((pattern: number | number[]) => boolean) | undefined;
  now?: (() => number) | undefined;
  /** Where touches and visibility changes are heard (the window). */
  target?: EventTarget | undefined;
  hidden?: (() => boolean) | undefined;
  setAudioSession?: ((type: string) => void) | undefined;
  save?: ((prefs: Prefs) => void) | undefined;
}

const VIBRATE: Readonly<Record<Haptic, number | number[]>> = {
  catch: 12,
  waveEnd: [30, 40, 50],
};

/** A long chain of catches would buzz like a phone call: at most one catch buzz in this many ms. */
const CATCH_BUZZ_GAP_MS = 120;

/** A wave can start many sounds at once; each small sound may start this many times a second. */
const MAX_PER_SECOND = 4;
/** The big moments are never held back. */
const ALWAYS: ReadonlySet<Cue> = new Set<Cue>(['waveWin', 'dayWin', 'lose', 'sticker', 'buy']);

type AudioCtor = new () => AudioContext;

function browserContext(): AudioContext | null {
  const Ctor: AudioCtor | undefined = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  return Ctor === undefined ? null : new Ctor();
}

/** Events that count as "the user touched the screen" for audio to start (iOS, Chrome). */
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

export function createFeedback(initial: Prefs = loadPrefs(), env: FeedbackEnv = {}): Feedback {
  let prefs = initial;
  let profile: string | null = null;
  let audio: AudioContext | null = null;
  let bus: AudioNode | null = null;
  const recent = new Map<Cue, number[]>();
  let lastCatch = -Infinity;

  const nav = globalThis.navigator as (Navigator & { audioSession?: { type: string } }) | undefined;
  const vibrate = env.vibrate ?? (typeof nav?.vibrate === 'function' ? (p: number | number[]) => nav.vibrate(p) : undefined);
  const now = env.now ?? (() => performance.now());
  const target: EventTarget | undefined = env.target ?? (typeof window === 'undefined' ? undefined : window);
  const hidden = env.hidden ?? (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const save = env.save ?? ((p: Prefs) => savePrefs(p));
  const canVibrate = vibrate !== undefined;

  // Mix with the phone's own music instead of cutting it off, and obey the silent switch (iOS 17+).
  try {
    if (env.setAudioSession !== undefined) env.setAudioSession('ambient');
    else if (nav?.audioSession !== undefined) nav.audioSession.type = 'ambient';
  } catch {
    // Older browsers have no audio session: nothing to set.
  }

  const wake = (): void => {
    const ctx = audio;
    if (ctx === null || ctx.state === 'running') return;
    try {
      void ctx.resume().catch(() => undefined);
    } catch {
      // Refused outside a touch: the next touch asks again.
    }
  };

  /** Builds the audio graph the first time it is needed: a gentle master level and a compressor so stacked sounds never jump. */
  const context = (): AudioContext | null => {
    if (audio !== null) return audio;
    try {
      const ctx = (env.makeContext ?? browserContext)();
      if (ctx === null) return null;
      const master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 4;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      audio = ctx;
      bus = master;
      return ctx;
    } catch {
      return null;
    }
  };

  /** Inside a touch: build the context, resume it and start a silent sound, which is what iOS needs to let later sounds out. */
  const unlock = (): void => {
    const ctx = context();
    if (ctx === null) return;
    if (ctx.state !== 'running') {
      wake();
      try {
        const silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, 22050);
        silent.connect(ctx.destination);
        silent.start(0);
      } catch {
        // The silent sound is a nicety.
      }
    }
  };

  if (target !== undefined) {
    for (const type of GESTURES) target.addEventListener(type, unlock, { capture: true, passive: true });
    // Asleep in the background: no sound, no battery. Awake again with the app.
    target.addEventListener('visibilitychange', () => {
      const ctx = audio;
      if (ctx === null) return;
      if (hidden()) void ctx.suspend().catch(() => undefined);
      else wake();
    });
  }

  const allowed = (cue: Cue): boolean => {
    if (ALWAYS.has(cue)) return true;
    const t = now();
    const times = (recent.get(cue) ?? []).filter((x) => t - x < 1000);
    if (times.length >= MAX_PER_SECOND) {
      recent.set(cue, times);
      return false;
    }
    times.push(t);
    recent.set(cue, times);
    return true;
  };

  const play = (cue: Cue): void => {
    const ctx = audio;
    if (ctx === null || bus === null || ctx.state !== 'running') return;
    try {
      playCue(ctx, bus, cue, ctx.currentTime + 0.01);
    } catch {
      // A sound that fails is a sound missed, never a broken game.
    }
  };

  const persist = (next: Prefs): void => {
    prefs = next;
    save(next);
  };

  return {
    get prefs() {
      return prefs;
    },
    canVibrate,
    setPrefs: persist,
    setProfile(id) {
      profile = id;
    },
    isMuted: (id) => prefs.muted.includes(id),
    setMuted(id, muted) {
      const was = prefs.muted.includes(id);
      if (was === muted) return;
      persist({ ...prefs, muted: muted ? [...prefs.muted, id] : prefs.muted.filter((m) => m !== id) });
      if (!muted) play('tap');
    },
    cue(cue) {
      if (profile === null || prefs.muted.includes(profile)) return;
      if (allowed(cue)) play(cue);
    },
    haptic(kind) {
      if (!prefs.haptics || vibrate === undefined) return;
      if (kind === 'catch') {
        const t = now();
        if (t - lastCatch < CATCH_BUZZ_GAP_MS) return;
        lastCatch = t;
      }
      try {
        vibrate(VIBRATE[kind]);
      } catch {
        // Blocked (no recent touch, or a policy): never an error.
      }
    },
  };
}
