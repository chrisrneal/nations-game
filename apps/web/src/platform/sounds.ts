/**
 * The sound set (decision record K13): small, original and synthesized with the
 * Web Audio API, so there is nothing to download or cache. Every pitched sound
 * is a note of one scale (C major pentatonic) in a soft sine or triangle
 * voice with the same quick fade in and slow fade out, and every effect (the
 * throw's whoosh, the catch's pock) is a short band of noise or a gliding
 * note. That is what makes them sound like one game.
 *
 * A cue is plain data: a list of voices. `playCue` turns it into oscillators,
 * so the recipes can be checked in Node without a speaker (sounds.test.ts) and
 * rendered offline in Chromium (apps/web/e2e/audio-check.ts).
 */

export type Cue =
  | 'tap'
  | 'buy'
  | 'throw'
  | 'catch'
  | 'fed'
  | 'dance'
  | 'ache'
  | 'heal'
  | 'hungry'
  | 'waveWin'
  | 'dayWin'
  | 'lose'
  | 'sticker';

export const CUES: readonly Cue[] = ['tap', 'buy', 'throw', 'catch', 'fed', 'dance', 'ache', 'heal', 'hungry', 'waveWin', 'dayWin', 'lose', 'sticker'];

/** One layer of a sound. Times are in seconds from the cue's start; `peak` is its loudest, as a fraction of full scale. */
export interface Voice {
  /** A pitched note, or a band of noise whose centre frequency is `freq`. */
  readonly kind: 'tone' | 'noise';
  readonly shape?: 'sine' | 'triangle';
  readonly at: number;
  readonly len: number;
  readonly peak: number;
  readonly freq: number;
  /** Glide to this frequency over the voice's length. */
  readonly to?: number;
  /** A wobble in the pitch, for a tummy ache: `rate` Hz, `depth` Hz either side. */
  readonly wobble?: { readonly rate: number; readonly depth: number };
  /** How narrow the noise band is. */
  readonly q?: number;
}

const C4 = 261.63;
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;
const C7 = 2093.0;

/** The scale every pitched voice comes from (C major pentatonic). */
export const SCALE_HZ: readonly number[] = [C4, 293.66, E4, G4, A4, C5, D5, E5, G5, A5, C6, 1174.66, E6, G6, 1760.0, C7];

/** The overall level: gentle by default, so a quiet room and a small speaker are both fine. */
export const MASTER_VOLUME = 0.8;

/** No cue runs longer than this. */
export const MAX_CUE_SECONDS = 1.6;

const tone = (at: number, len: number, peak: number, freq: number, shape: 'sine' | 'triangle' = 'triangle', extra: Partial<Voice> = {}): Voice => ({ kind: 'tone', shape, at, len, peak, freq, ...extra });

/** The jig of a happy dance: up the chord and back, eight quick notes. */
const JIG = [C5, E5, G5, E5, C5, E5, G5, C6];

export const RECIPES: Readonly<Record<Cue, readonly Voice[]>> = {
  // A soft blip, falling a little.
  tap: [tone(0, 0.06, 0.1, A5, 'sine', { to: E5 })],
  // Two quick pings, the second higher.
  buy: [tone(0, 0.1, 0.12, G5), tone(0.07, 0.2, 0.12, C6)],
  // A whoosh of air with a rising note inside it.
  throw: [{ kind: 'noise', at: 0, len: 0.16, peak: 0.2, freq: 500, to: 1800, q: 1.2 }, tone(0, 0.14, 0.09, G4, 'sine', { to: D5 })],
  // A soft pock as the snack lands in a friend's hands, and on its way again.
  catch: [tone(0, 0.09, 0.16, C5, 'sine', { to: G4 }), { kind: 'noise', at: 0, len: 0.04, peak: 0.05, freq: 2000, q: 0.8 }],
  // A bright two-note chime, a sparkle on top: yum.
  fed: [tone(0, 0.14, 0.16, E5), tone(0.09, 0.26, 0.16, G5), tone(0.09, 0.3, 0.06, C6, 'sine')],
  // A bouncy little jig, as long as the kid dances.
  dance: JIG.map((hz, i) => tone(i * 0.125, 0.11, 0.12, hz)),
  // A wobbly slide down: oh no, a tummy ache.
  ache: [tone(0, 0.42, 0.15, G4, 'triangle', { to: E4, wobble: { rate: 7, depth: 12 } })],
  // Sparkles climbing over a warm note: the Nurse helps.
  heal: [tone(0, 0.3, 0.09, G5, 'sine'), tone(0.07, 0.3, 0.09, C6, 'sine'), tone(0.14, 0.3, 0.09, E6, 'sine'), tone(0.21, 0.34, 0.09, G6, 'sine'), tone(0, 0.5, 0.05, C5)],
  // Three slow notes down, like a sigh: a kid goes home hungry.
  hungry: [tone(0, 0.22, 0.13, A4), tone(0.2, 0.22, 0.13, E4), tone(0.42, 0.4, 0.13, C4)],
  // A short rising run and a held top note.
  waveWin: [tone(0, 0.14, 0.14, C5), tone(0.09, 0.14, 0.14, E5), tone(0.18, 0.14, 0.14, G5), tone(0.27, 0.4, 0.14, C6), tone(0.27, 0.35, 0.05, G6, 'sine')],
  // The run, then a held chord with a sparkle: the day is won.
  dayWin: [
    tone(0, 0.18, 0.12, C5),
    tone(0.1, 0.18, 0.12, E5),
    tone(0.2, 0.18, 0.12, G5),
    tone(0.3, 0.2, 0.12, C6),
    tone(0.45, 0.9, 0.09, C6),
    tone(0.45, 0.9, 0.09, E6),
    tone(0.45, 0.9, 0.09, G6),
    tone(0.55, 0.8, 0.04, C7, 'sine'),
  ],
  // Gentle: a try-again, not a telling-off.
  lose: [tone(0, 0.2, 0.12, G4), tone(0.18, 0.36, 0.12, E4)],
  // A glitter sweep up into a bell: a sticker appears.
  sticker: [tone(0, 0.22, 0.08, G5, 'sine', { to: G6 }), tone(0.2, 0.6, 0.1, G6, 'sine'), tone(0.26, 0.7, 0.06, C7, 'sine'), tone(0.2, 0.4, 0.05, C6)],
};

/** How long a cue lasts, tails included. */
export function cueSeconds(cue: Cue): number {
  return Math.max(...RECIPES[cue].map((v) => v.at + v.len));
}

/** The most the voices' peaks add up to at any moment: a ceiling on how loud a cue can get. */
export function overlapPeak(cue: Cue): number {
  const voices = RECIPES[cue];
  return Math.max(...voices.map((v) => voices.filter((w) => w.at <= v.at + 0.0001 && w.at + w.len > v.at).reduce((sum, w) => sum + w.peak, 0)));
}

const ATTACK = 0.008;
const FLOOR = 0.0001;

/** One second of white noise for the whooshes. A tiny fixed generator, so it is the same sound everywhere. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let x = 12345;
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    data[i] = x / 2147483648 - 1;
  }
  return buffer;
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** The path every sound takes out: a gentle master level, then a compressor so stacked sounds never jump. */
export function makeBus(ctx: BaseAudioContext): AudioNode {
  const master = ctx.createGain();
  master.gain.value = MASTER_VOLUME;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 4;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return master;
}

/** Starts a cue `when` seconds on the context's clock, into `out`. Every node is stopped when its voice fades. */
export function playCue(ctx: BaseAudioContext, out: AudioNode, cue: Cue, when: number): void {
  for (const voice of RECIPES[cue]) {
    const start = when + voice.at;
    const end = start + voice.len;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(FLOOR, start);
    gain.gain.linearRampToValueAtTime(voice.peak, start + Math.min(ATTACK, voice.len / 2));
    gain.gain.exponentialRampToValueAtTime(FLOOR, end);
    gain.connect(out);
    if (voice.kind === 'noise') {
      let buffer = noises.get(ctx);
      if (buffer === undefined) {
        buffer = noiseBuffer(ctx);
        noises.set(ctx, buffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = voice.q ?? 1;
      band.frequency.setValueAtTime(voice.freq, start);
      if (voice.to !== undefined) band.frequency.exponentialRampToValueAtTime(voice.to, end);
      source.connect(band);
      band.connect(gain);
      source.start(start);
      source.stop(end + 0.02);
      continue;
    }
    const osc = ctx.createOscillator();
    osc.type = voice.shape ?? 'triangle';
    osc.frequency.setValueAtTime(voice.freq, start);
    if (voice.to !== undefined) osc.frequency.exponentialRampToValueAtTime(voice.to, end);
    osc.connect(gain);
    osc.start(start);
    osc.stop(end + 0.02);
    if (voice.wobble !== undefined) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = voice.wobble.rate;
      depth.gain.value = voice.wobble.depth;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(end + 0.02);
    }
  }
}
