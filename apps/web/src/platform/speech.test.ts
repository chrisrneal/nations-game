import { describe, expect, it } from 'vitest';
import { createSpeech, type SpeechApi } from './speech.ts';

/** A pretend voice that writes down what it says. */
function fakeVoice(): { api: SpeechApi; said: string[] } {
  const said: string[] = [];
  class Utterance {
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    constructor(readonly text: string) {}
  }
  const api = {
    synth: { speak: (u: SpeechSynthesisUtterance) => void said.push(u.text), cancel: () => undefined },
    Utterance: Utterance as unknown as SpeechApi['Utterance'],
  };
  return { api, said };
}

describe('spoken Kindy hints (D16)', () => {
  it('speaks only after the first tap has unlocked it (iOS), with a silent first line', () => {
    const { api, said } = fakeVoice();
    const speech = createSpeech(() => true, api);
    speech.say('Put the thrower here!');
    expect(said).toEqual([]);
    speech.unlock();
    speech.say('Put the thrower here!');
    expect(said).toEqual([' ', 'Put the thrower here!']);
  });

  it('says nothing when a grown-up turned the voice off', () => {
    const { api, said } = fakeVoice();
    let on = false;
    const speech = createSpeech(() => on, api);
    speech.unlock();
    speech.say('Press the green button!');
    on = true;
    speech.say('Press the green button!');
    expect(said).toEqual([' ', 'Press the green button!']);
  });

  it('falls back silently where there is no speech at all', () => {
    const speech = createSpeech(() => true, null);
    expect(speech.available).toBe(false);
    expect(() => {
      speech.unlock();
      speech.say('Hello');
      speech.stop();
    }).not.toThrow();
  });
});
