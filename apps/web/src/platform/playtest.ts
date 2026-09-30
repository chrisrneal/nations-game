/**
 * The playtest questions (Gate 2 line 7: "10 playtests, 3+ by others, most
 * want another game"). Asked at game over, answered in taps, skippable, and
 * stored in the exported save beside the prediction answers, so
 * `npm run harness -- predictions --dir docs/playtests` can tally them.
 *
 * Host-side, never State: an answer changes nothing in the world.
 */
export type PlaytestWho = 'owner' | 'other';
export type PlaytestAgain = 'yes' | 'unsure' | 'no';

export interface PlaytestAnswers {
  readonly version: 1;
  readonly who: PlaytestWho | null;
  readonly again: PlaytestAgain | null;
  /** "Which choice felt most interesting?" One optional line. */
  readonly interesting: string;
}

export const EMPTY_PLAYTEST: PlaytestAnswers = { version: 1, who: null, again: null, interesting: '' };

/** Longest "most interesting choice" line kept: one line, not an essay. */
export const INTERESTING_MAX = 200;

/** Merges a partial answer, trimming the free-text line to one short line. */
export function answer(current: PlaytestAnswers, update: Partial<Omit<PlaytestAnswers, 'version'>>): PlaytestAnswers {
  const interesting = update.interesting === undefined ? current.interesting : update.interesting.replace(/\s+/g, ' ').trim().slice(0, INTERESTING_MAX);
  return { ...current, ...update, interesting, version: 1 };
}

/** The file name a finished game exports under: playtest-<date>-<nation>.json. */
export function playtestFileName(humanId: string, now: number): string {
  const d = new Date(now);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `playtest-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${humanId}.json`;
}
