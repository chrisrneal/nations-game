/**
 * Spoken Kindy hints (RULES 11, D16): the phone's built-in voice through the
 * Web Speech API. Device APIs live here, in the platform, so the interface
 * only says which line to speak.
 *
 * - iOS lets a page speak only once speech has started inside a tap, so the
 *   first tap calls `unlock()`, which speaks a silent space. Until then, and
 *   wherever there is no speech (or no voice), `say` does nothing and the
 *   pointing hand is the whole hint.
 * - A grown-up can turn the voice off (`enabled`, the `voice` preference).
 */
export interface Speech {
  /** The device has the Web Speech API. */
  readonly available: boolean;
  /** Call inside the first tap: lets the page speak from then on (iOS). */
  unlock(): void;
  /** Speaks a short line, cutting off any line still being spoken; silently nothing when it can't or mustn't. */
  say(line: string): void;
  stop(): void;
}

/** What speech needs from the browser: `speechSynthesis` and the utterance constructor. Passed in by tests. */
export interface SpeechApi {
  readonly synth: Pick<SpeechSynthesis, 'speak' | 'cancel'>;
  readonly Utterance: new (text: string) => SpeechSynthesisUtterance;
}

function browserSpeech(): SpeechApi | null {
  const g = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
  if (g.speechSynthesis === undefined || typeof g.SpeechSynthesisUtterance !== 'function') return null;
  return { synth: g.speechSynthesis, Utterance: g.SpeechSynthesisUtterance };
}

export function createSpeech(enabled: () => boolean, api: SpeechApi | null = browserSpeech()): Speech {
  let unlocked = false;
  return {
    available: api !== null,
    unlock() {
      if (api === null || unlocked) return;
      unlocked = true;
      try {
        const silent = new api.Utterance(' ');
        silent.volume = 0;
        api.synth.speak(silent);
      } catch {
        // No voice after all: the hand alone shows the hint.
      }
    },
    say(line) {
      if (api === null || !unlocked || !enabled()) return;
      try {
        api.synth.cancel();
        const u = new api.Utterance(line);
        u.lang = 'en';
        // A little slower and brighter than the default: for a 4-year-old.
        u.rate = 0.9;
        u.pitch = 1.2;
        api.synth.speak(u);
      } catch {
        // Speech failed: the hand alone shows the hint.
      }
    },
    stop() {
      try {
        api?.synth.cancel();
      } catch {
        // Nothing was being said.
      }
    },
  };
}
