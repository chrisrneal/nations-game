import { describe, expect, it } from 'vitest';
import { fixturePuzzle } from './fixture.ts';
import { startGame, step } from './game.ts';
import { generatePuzzle } from './generate.ts';
import { gameView } from './view.ts';

describe('the View (S6)', () => {
  it('never says what a main-mode kid wants; Kindy shows the picture', () => {
    const main = gameView(startGame(generatePuzzle('main', 'daily', 20_000, 0)));
    expect(main.kids.length).toBeGreaterThan(0);
    expect(main.kids.every((k) => k.wants === null && k.clue !== null)).toBe(true);
    expect(JSON.stringify(main)).not.toMatch(/witness|"wants":"/);
    const kindy = gameView(startGame(generatePuzzle('kindy', 'daily', 20_000, 0)));
    expect(kindy.kids.every((k) => k.wants !== null && k.clue === null)).toBe(true);
  });

  it('shows where each friend’s next throw lands, and who picks up (D12)', () => {
    let s = startGame(fixturePuzzle(['a S2 . # ka', '. . . . =']));
    s = step(s, { type: 'place', friend: 1, cell: 1, facing: 2 }).state;
    expect(gameView(s).friends[0]).toMatchObject({ target: 3, picker: true });
    s = step(s, { type: 'turn', friend: 1, facing: 0 }).state;
    expect(gameView(s).friends[0]?.target).toBe(-1);
  });

  it('warns about a loop before Go (D12)', () => {
    let s = startGame(fixturePuzzle(['a S2 S6 ka']));
    s = step(s, { type: 'place', friend: 1, cell: 1, facing: 2 }).state;
    expect(gameView(s).loopWarning).toBe(false);
    s = step(s, { type: 'place', friend: 2, cell: 2, facing: 6 }).state;
    expect(gameView(s).loopWarning).toBe(true);
  });

  it('prices the shop and says what can be bought', () => {
    const v = gameView(startGame(fixturePuzzle(['a . ka'], { shop: ['short', 'nurse'] })));
    expect(v.shop).toEqual([
      { type: 'short', price: 1, canBuy: false, shortfall: 1, owned: 0, refund: -1 },
      { type: 'nurse', price: 3, canBuy: false, shortfall: 3, owned: 0, refund: -1 },
    ]);
  });
});
