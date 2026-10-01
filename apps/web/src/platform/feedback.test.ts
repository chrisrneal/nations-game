import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, createFeedback, loadPrefs, savePrefs } from './feedback.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('feedback preferences (slice 7)', () => {
  it('starts with sound off and haptics on', () => {
    expect(DEFAULT_PREFS).toEqual({ sound: false, haptics: true });
    expect(loadPrefs(memoryStorage())).toEqual(DEFAULT_PREFS);
  });

  it('remembers the player\'s choice, and survives broken storage', () => {
    const storage = memoryStorage();
    savePrefs({ sound: true, haptics: false }, storage);
    expect(loadPrefs(storage)).toEqual({ sound: true, haptics: false });
    storage.setItem('airport-prefs', '{nope');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });

  it('cues do nothing harmful where there is no vibration or audio (Node)', () => {
    const feedback = createFeedback({ sound: false, haptics: true });
    expect(feedback.canVibrate).toBe(false);
    expect(() => feedback.cue('charter')).not.toThrow();
  });
});
