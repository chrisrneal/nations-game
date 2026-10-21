import type { FriendView, GameState, GameView, KidView, ShopItem } from '@snacks/contracts';
import { clueText } from './clues.ts';
import { boughtThisSetup, priceOf } from './game.ts';
import { FACINGS } from './geometry.ts';
import { kindyHint } from './hint.ts';
import { landing, occupancy, pickupFor, resolveSnacks, type WaveKid } from './resolve.ts';
import { SNACKS } from './snacks.ts';

/**
 * The View (S6): everything the interface may show. It never says what a
 * main-mode kid wants; that is the puzzle. After a wave, the wave result
 * shows what each kid ate, which the player has then seen; and a hint the
 * player asked for may show the lunchbox that feeds a kid (tier 2, K11).
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function kidLabel(id: number): string {
  return LETTERS[(id - 1) % LETTERS.length]!;
}

export function gameView(state: GameState): GameView {
  const { puzzle } = state;
  const board = puzzle.board;
  const kindy = puzzle.mode === 'kindy';
  // Where friends throw depends only on where everyone stands, never on what a kid wants.
  const waveKids: WaveKid[] = state.kids.map((k) => ({ id: k.id, cell: k.cell, wants: 'apple' }));
  const occ = occupancy(board, state.friends, waveKids);
  const friends: FriendView[] = state.friends.map((f) => {
    let target = -1;
    if (f.cell >= 0 && f.type !== 'nurse') {
      target = landing(board, occ, f.type, f.facing, f.cell % board.width, Math.floor(f.cell / board.width)).cell;
    }
    return { id: f.id, type: f.type, cell: f.cell, facing: f.facing, target, picker: pickupFor(board, f) >= 0 };
  });
  const loopWarning = resolveSnacks({ board, friends: state.friends, kids: waveKids, mode: puzzle.mode }).snacks.some((s) => s.end === 'loop');
  // On the board when this setup began (the checkpoint) and still throwing: they will fire again at Go.
  const carried = new Set(state.checkpoint.friends.filter((f) => f.cell >= 0).map((f) => f.id));
  const leftovers = state.phase === 'setup' ? friends.filter((f) => f.cell >= 0 && f.picker && carried.has(f.id)).length : 0;
  const kids: KidView[] = state.kids.map((k) => {
    const kid = puzzle.kids.find((p) => p.id === k.id)!;
    return {
      id: k.id,
      cell: k.cell,
      label: kidLabel(k.id),
      look: kid.look,
      clue: kid.clue === null ? null : clueText(kid.clue),
      facts: kid.clue === null ? null : kid.clue.facts,
      wants: kindy ? kid.wants : null,
      healed: k.healed,
    };
  });
  const shop: ShopItem[] = puzzle.shop.map((type) => {
    const price = priceOf(type);
    const mine = state.friends.filter((f) => f.type === type);
    // The last one bought this setup, one still in the tray before one on the board.
    const back = mine.filter((f) => boughtThisSetup(state, f)).sort((a, b) => Number(a.cell < 0) - Number(b.cell < 0) || a.id - b.id);
    const setup = state.phase === 'setup';
    return { type, price, canBuy: setup && state.points >= price, shortfall: Math.max(0, price - state.points), owned: mine.length, refund: setup ? (back.at(-1)?.id ?? -1) : -1 };
  });
  return {
    mode: puzzle.mode,
    round: puzzle.round,
    day: puzzle.day,
    seed: puzzle.seed,
    width: board.width,
    height: board.height,
    squares: board.squares,
    lunchboxes: board.lunchboxes,
    snacks: puzzle.snacks.map((s) => SNACKS[s]),
    wave: state.wave,
    waves: puzzle.waves,
    phase: state.phase,
    points: state.points,
    hungry: state.hungry,
    hungryAllowed: puzzle.hungryAllowed,
    fed: state.fed,
    friends,
    kids,
    shop,
    loopWarning,
    leftovers,
    lastWave: state.lastWave,
    facings: FACINGS,
    hint: kindyHint(state),
    // Main mode, during setup: the hint the player asked for (K11). Its lunchbox, from tier 2, is the one way the View says what a kid wants.
    mainHint: !kindy && state.phase === 'setup' ? state.hint : null,
    hints: state.hints,
  };
}
