import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, createFeedback, loadPrefs, savePrefs, type FeedbackEnv } from './feedback.ts';
import { RECIPES } from './sounds.ts';
import { fakeAudio, type FakeAudio } from './fakeAudio.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

interface Harness {
  readonly env: FeedbackEnv;
  readonly audio: FakeAudio;
  readonly target: EventTarget;
  readonly buzzes: (number | number[])[];
  readonly state: { hidden: boolean; clock: number; contexts: number; session: string };
}

function harness(over: Partial<FeedbackEnv> = {}): Harness {
  const audio = fakeAudio();
  const target = new EventTarget();
  const buzzes: (number | number[])[] = [];
  const state = { hidden: false, clock: 1000, contexts: 0, session: '' };
  const env: FeedbackEnv = {
    makeContext: () => {
      state.contexts += 1;
      return audio.ctx;
    },
    vibrate: (p) => {
      buzzes.push(p);
      return true;
    },
    now: () => state.clock,
    target,
    hidden: () => state.hidden,
    setAudioSession: (type) => {
      state.session = type;
    },
    ...over,
  };
  return { env, audio, target, buzzes, state };
}

/** How many sound sources a cue added: one per voice, plus an LFO for wobbling voices. */
const sources = (audio: FakeAudio): number => audio.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource').length;
const gesture = (target: EventTarget): void => void target.dispatchEvent(new Event('pointerdown'));

describe('feedback preferences', () => {
  it('starts with sound on for everyone, haptics on and Kindy hints spoken', () => {
    expect(DEFAULT_PREFS).toEqual({ haptics: true, voice: true, muted: [] });
    expect(loadPrefs(memoryStorage())).toEqual(DEFAULT_PREFS);
  });

  it('remembers the choice, and survives broken storage', () => {
    const storage = memoryStorage();
    savePrefs({ haptics: false, voice: false, muted: ['p2'] }, storage);
    expect(loadPrefs(storage)).toEqual({ haptics: false, voice: false, muted: ['p2'] });
    // The old phone-wide "sound" switch (off by default, from the beeps) means nothing now.
    storage.setItem('snacks-prefs', '{"sound":false,"haptics":true}');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    storage.setItem('snacks-prefs', '{"muted":["p1",3,null,"p1"]}');
    expect(loadPrefs(storage).muted).toEqual(['p1']);
    storage.setItem('snacks-prefs', '{nope');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });
});

describe('cues', () => {
  it('do nothing harmful where there is no vibration or audio (Node)', () => {
    const feedback = createFeedback(DEFAULT_PREFS, { target: new EventTarget() });
    feedback.setProfile('p1');
    expect(feedback.canVibrate).toBe(false);
    expect(() => feedback.cue('dayWin')).not.toThrow();
    expect(() => feedback.haptic('catch')).not.toThrow();
  });

  it('play for the child on screen, and are silent in the picker', () => {
    const h = harness();
    const feedback = createFeedback(DEFAULT_PREFS, h.env);
    gesture(h.target);
    const base = sources(h.audio);
    feedback.cue('tap');
    expect(sources(h.audio) - base).toBe(0);
    feedback.setProfile('p1');
    feedback.cue('tap');
    expect(sources(h.audio) - base).toBe(RECIPES.tap.length);
    feedback.setProfile(null);
    feedback.cue('tap');
    expect(sources(h.audio) - base).toBe(RECIPES.tap.length);
  });

  it('are muted for one profile and not another, and the choice is saved', () => {
    const h = harness();
    const saved: string[] = [];
    const feedback = createFeedback(DEFAULT_PREFS, { ...h.env, save: (p) => saved.push(JSON.stringify(p.muted)) });
    feedback.setMuted('p2', true);
    expect(feedback.isMuted('p2')).toBe(true);
    expect(feedback.isMuted('p1')).toBe(false);
    expect(saved).toEqual(['["p2"]']);
    gesture(h.target);
    const base = sources(h.audio);
    feedback.setProfile('p2');
    feedback.cue('fed');
    expect(sources(h.audio) - base).toBe(0);
    feedback.setProfile('p1');
    feedback.cue('fed');
    expect(sources(h.audio) - base).toBeGreaterThan(0);
    feedback.setMuted('p2', false);
    expect(saved).toEqual(['["p2"]', '[]']);
  });

  it('give a confirming blip when a profile is unmuted, even from the picker', () => {
    const h = harness();
    const feedback = createFeedback({ ...DEFAULT_PREFS, muted: ['p1'] }, h.env);
    gesture(h.target);
    const base = sources(h.audio);
    feedback.setMuted('p1', false);
    expect(sources(h.audio) - base).toBe(RECIPES.tap.length);
  });

  it('cap how many sounds start a second, so a busy wave stays gentle', () => {
    const h = harness();
    const feedback = createFeedback(DEFAULT_PREFS, h.env);
    gesture(h.target);
    feedback.setProfile('p1');
    const base = sources(h.audio);
    for (let i = 0; i < 40; i++) feedback.cue('catch');
    const first = sources(h.audio);
    expect(first - base).toBeLessThan(40 * RECIPES.catch.length);
    expect(first - base).toBeGreaterThan(0);
    // A second later the budget is back.
    h.state.clock += 1100;
    feedback.cue('catch');
    expect(sources(h.audio)).toBeGreaterThan(first);
  });

  it('always let the big moments through, however busy it was', () => {
    const h = harness();
    const feedback = createFeedback(DEFAULT_PREFS, h.env);
    gesture(h.target);
    feedback.setProfile('p1');
    for (let i = 0; i < 40; i++) feedback.cue('catch');
    const before = sources(h.audio);
    feedback.cue('dayWin');
    expect(sources(h.audio)).toBe(before + RECIPES.dayWin.length);
  });
});

describe('unlocking audio (iOS)', () => {
  it('waits for the first touch before making an audio context, then resumes it inside that touch', () => {
    const h = harness();
    createFeedback(DEFAULT_PREFS, h.env);
    expect(h.state.contexts).toBe(0);
    gesture(h.target);
    expect(h.state.contexts).toBe(1);
    expect(h.audio.raw.resumed).toBe(1);
    expect(h.audio.raw.state).toBe('running');
    // A silent sound is started in the gesture: that is what iOS wants.
    expect(h.audio.nodes.some((n) => n.kind === 'bufferSource' && n.started !== null)).toBe(true);
    gesture(h.target);
    expect(h.state.contexts).toBe(1);
    expect(h.audio.raw.resumed).toBe(1);
  });

  it('listens to taps, touches, clicks and keys', () => {
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
      const h = harness();
      createFeedback(DEFAULT_PREFS, h.env);
      h.target.dispatchEvent(new Event(type));
      expect(h.state.contexts, type).toBe(1);
    }
  });

  it('asks for the quiet "ambient" audio session, so the phone\'s own music is not cut off', () => {
    const h = harness();
    createFeedback(DEFAULT_PREFS, h.env);
    expect(h.state.session).toBe('ambient');
  });

  it('suspends audio when the app is hidden and resumes at the next touch after it is back', () => {
    const h = harness();
    createFeedback(DEFAULT_PREFS, h.env);
    gesture(h.target);
    h.state.hidden = true;
    h.target.dispatchEvent(new Event('visibilitychange'));
    expect(h.audio.raw.suspended).toBe(1);
    h.state.hidden = false;
    h.target.dispatchEvent(new Event('visibilitychange'));
    expect(h.audio.raw.resumed).toBe(2);
    // iOS may say no outside a touch; the next touch asks again.
    h.audio.raw.state = 'interrupted';
    gesture(h.target);
    expect(h.audio.raw.resumed).toBe(3);
  });

  it('survives a browser with no audio, or one that throws', () => {
    const none = harness({ makeContext: () => null });
    const a = createFeedback(DEFAULT_PREFS, none.env);
    a.setProfile('p1');
    gesture(none.target);
    expect(() => a.cue('fed')).not.toThrow();
    const boom = harness({
      makeContext: () => {
        throw new Error('no audio');
      },
    });
    const b = createFeedback(DEFAULT_PREFS, boom.env);
    b.setProfile('p1');
    expect(() => gesture(boom.target)).not.toThrow();
    expect(() => b.cue('fed')).not.toThrow();
  });
});

describe('haptics', () => {
  it('buzz briefly on a catch and at the end of a wave, where the phone can', () => {
    const h = harness();
    const feedback = createFeedback(DEFAULT_PREFS, h.env);
    expect(feedback.canVibrate).toBe(true);
    feedback.haptic('catch');
    expect(h.buzzes).toHaveLength(1);
    expect(h.buzzes[0]).toBeLessThanOrEqual(20);
    h.state.clock += 500;
    feedback.haptic('waveEnd');
    expect(h.buzzes).toHaveLength(2);
    const total = ([] as number[]).concat(h.buzzes[1]!).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(300);
  });

  it('do not buzz on every catch of a long chain', () => {
    const h = harness();
    const feedback = createFeedback(DEFAULT_PREFS, h.env);
    for (let i = 0; i < 6; i++) {
      feedback.haptic('catch');
      h.state.clock += 40;
    }
    expect(h.buzzes.length).toBeLessThan(4);
  });

  it('do nothing on a phone with no vibration (iOS), or when switched off, and never throw', () => {
    const ios = harness({ vibrate: undefined });
    const a = createFeedback(DEFAULT_PREFS, ios.env);
    expect(a.canVibrate).toBe(false);
    expect(() => a.haptic('waveEnd')).not.toThrow();
    const off = harness();
    createFeedback({ ...DEFAULT_PREFS, haptics: false }, off.env).haptic('waveEnd');
    expect(off.buzzes).toHaveLength(0);
    const angry = harness({
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => createFeedback(DEFAULT_PREFS, angry.env).haptic('waveEnd')).not.toThrow();
  });

  it('are not tied to the sound mute (a quiet profile can still feel the wave)', () => {
    const h = harness();
    const feedback = createFeedback({ ...DEFAULT_PREFS, muted: ['p1'] }, h.env);
    feedback.setProfile('p1');
    feedback.haptic('waveEnd');
    expect(h.buzzes).toHaveLength(1);
  });
});
