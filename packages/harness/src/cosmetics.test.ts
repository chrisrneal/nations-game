/**
 * The locked rule (RULES 9a, K12): what lasts from day to day is cosmetic
 * only. Stickers, hats and outfits must never reach the puzzle, the
 * generator, the solver, the engine or the view, so no day can be easier,
 * harder or different because of what a child has earned.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addProfile, emptyBook, equipCosmetic, gameView, generatePuzzle, hashState, recordBonus, recordDaily, startGame, step } from '@snacks/sim';

const simDir = fileURLToPath(new URL('../../sim/src/', import.meta.url));
/** The only sim files that know about stickers and the profile book that holds them. */
const BOOKKEEPING = new Set(['stickers.ts', 'profiles.ts', 'index.ts']);

const playFiles = readdirSync(simDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !BOOKKEEPING.has(f));

describe('cosmetics never reach play', () => {
  it('finds the game files to check', () => {
    expect(playFiles).toEqual(expect.arrayContaining(['game.ts', 'generate.ts', 'solver.ts', 'resolve.ts', 'view.ts', 'clues.ts', 'hint.ts', 'mainHint.ts', 'save.ts']));
  });

  it('no game file imports the sticker catalogue or the profile book', () => {
    for (const file of playFiles) {
      const source = readFileSync(`${simDir}${file}`, 'utf8');
      expect(source, file).not.toMatch(/from '\.\/(stickers|profiles)\.ts'/);
      expect(source, file).not.toMatch(/\b(sticker|cosmetic|outfit|worn)/i);
    }
  });

  it('the view the interface reads holds nothing about stickers, hats or outfits', () => {
    const keys = (value: unknown, out: string[] = []): string[] => {
      if (Array.isArray(value)) value.forEach((v) => keys(v, out));
      else if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          out.push(k);
          keys(v, out);
        }
      }
      return out;
    };
    for (const mode of ['main', 'kindy'] as const) {
      const view = gameView(startGame(generatePuzzle(mode, 'daily', 20_400, 0)));
      expect(keys(view).filter((k) => /sticker|cosmetic|outfit|worn/i.test(k))).toEqual([]);
    }
  });

  it('a day is the same puzzle, hash for hash, whatever the profile has earned', () => {
    let book = addProfile(emptyBook(), { name: '', avatar: 'dog', mode: 'main' }).book;
    const bare = hashState(startGame(generatePuzzle('main', 'daily', 20_410, 0)));
    for (let i = 0; i < 31; i++) book = recordDaily(book, 'p1', { day: 20_400 + i, fed: 14, hungry: 0, retries: 0 });
    book = recordBonus(book, 'p1', 20_400);
    book = equipCosmetic(book, 'p1', 'hat', 'crown').book;
    expect(book.profiles[0]!.cosmetics).toHaveLength(4);
    const dressed = startGame(generatePuzzle('main', 'daily', 20_410, 0));
    expect(hashState(dressed)).toBe(bare);
    expect(hashState(step(dressed, { type: 'go' }).state)).toBe(hashState(step(startGame(generatePuzzle('main', 'daily', 20_410, 0)), { type: 'go' }).state));
  });
});
