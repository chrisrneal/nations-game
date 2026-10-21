/**
 * Hints never set a wave up to fail (RULES 8b). Friends carry over from wave
 * to wave (RULES 8), so a hint meets friends left by earlier waves; this plays
 * whole days pressing Hint until it says Go, and checks that
 *  - the finished setup gives nobody a tummy ache and nobody goes hungry, and
 *  - no single hint press, for a player who carries friends over, leaves a
 *    setup that would give a kid a NEW tummy ache if Go were pressed right then
 *    (a stale friend left throwing, or half a route throwing at the wrong kid).
 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '@snacks/contracts';
import { generatePuzzle, startGame, step } from '@snacks/sim';

const DAYS = 10;

const achedKids = (s: GameState): Set<number> => {
  const wave = step(s, { type: 'go' }).wave;
  return new Set(wave === null ? [] : wave.kids.filter((k) => k.ache).map((k) => k.kid));
};

describe('hints are safe', () => {
  for (const round of ['daily', 'bonus'] as const) {
    it(`${round}: ${DAYS} days played by hint alone are won with no tummy ache, and no hint press adds one`, () => {
      for (let day = 50000; day < 50000 + DAYS; day++) {
        let s = startGame(generatePuzzle('main', round, day, 0));
        while (s.phase === 'setup') {
          let done = false;
          for (let press = 0; press < 120 && !done; press++) {
            const before = achedKids(s);
            const r = step(s, { type: 'hint' });
            expect(r.error, `${round} day ${day} wave ${s.wave}`).toBeNull();
            if (r.state.hint?.tier === 3) {
              const added = [...achedKids(r.state)].filter((k) => !before.has(k));
              expect(added, `${round} day ${day} wave ${s.wave}: a hint step would give kid(s) ${added} a tummy ache`).toEqual([]);
            }
            s = r.state;
            done = s.hint?.tier === 0;
          }
          expect(done, `${round} day ${day} wave ${s.wave}: the hint never reached Go`).toBe(true);
          const go = step(s, { type: 'go' });
          expect(go.wave!.kids.every((k) => k.end === 'happy'), `${round} day ${day} wave ${s.wave}`).toBe(true);
          s = go.state;
        }
        expect(s.phase).toBe('won');
      }
    }, 120_000);
  }
});
