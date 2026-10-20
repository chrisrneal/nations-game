import type { Friend, FriendType, GameCommand, GameState, HintTopic, MainHint, PlacedFriend, PuzzleKid } from '@snacks/contracts';
import { priceOf } from './game.ts';
import { resolveSnacks, type WaveKid } from './resolve.ts';
import { buysFor, fedBy, solveWave, type Budget } from './solver.ts';

/**
 * Main-mode hints (RULES 8b, K11): the hint button, in three tiers per kid,
 * worked out from the puzzle's stored solution.
 *
 * 1. Which kid's card to solve next, and what it is about (a trait, or the
 *    kid it points at). Cards that pin their snack themselves come first.
 * 2. The lunchbox that feeds that kid: from here the View says which snack
 *    they want, because the player asked.
 * 3. One friend of that kid's route put in place with the right facing (a
 *    friend of another type on its square goes back to the tray; a friend
 *    already out moves before one comes from the tray; one is bought only
 *    when none is owned). Pressed again, the next friend of the route. With
 *    the route complete, a friend still in the way goes back to the tray.
 *
 * When the setup on the board feeds the kid, the next press moves to the
 * next kid; when it feeds them all, the hint says Go (tier 0). The setup
 * aimed at is the stored solution while the wave goes to plan and the player
 * can afford it; otherwise what the solver finds with the friends and points
 * the player has. Hints never change the streak (RULES 9).
 */

/** What the setup on the board does for this wave's kids now. */
function fedNow(state: GameState, kids: readonly WaveKid[]): ReadonlySet<number> {
  return new Set(resolveSnacks({ board: state.puzzle.board, friends: state.friends, kids, mode: state.puzzle.mode }).fed.keys());
}

const relational = (kid: PuzzleKid): boolean => kid.clue?.facts.some((f) => f.kind === 'same' || f.kind === 'notSister') === true;

/** What a kid's card is about, in the card's order. */
function topics(kid: PuzzleKid): HintTopic[] {
  const out: HintTopic[] = [];
  for (const f of kid.clue?.facts ?? []) {
    const topic: HintTopic = f.kind === 'same' ? f.feature : f.kind === 'notSister' ? 'sister' : f.trait;
    if (!out.includes(topic)) out.push(topic);
  }
  return out;
}

function budgetOf(state: GameState): Budget {
  const owned: Partial<Record<FriendType, number>> = {};
  for (const f of state.friends) owned[f.type] = (owned[f.type] ?? 0) + 1;
  return { owned, points: state.points, shop: state.puzzle.shop };
}

/** The setup the hint leads to (see above), or null when none can feed the kid. */
function targetSetup(state: GameState, kids: readonly WaveKid[], kid: number): readonly PlacedFriend[] | null {
  const { puzzle } = state;
  const budget = budgetOf(state);
  const affordable = (friends: readonly PlacedFriend[]): boolean => {
    const buys = buysFor(friends, budget);
    return buys !== null && buys.reduce((sum, t) => sum + priceOf(t), 0) <= budget.points;
  };
  const due = puzzle.kids.filter((k) => k.wave === state.wave).map((k) => k.id);
  const onPlan = due.length === kids.length && kids.every((k) => due.includes(k.id));
  const stored = puzzle.witness.find((l) => l.wave === state.wave)?.friends;
  if (onPlan && stored !== undefined && affordable(stored)) {
    const fed = fedBy(puzzle.board, stored, kids, puzzle.mode);
    if (kids.every((k) => fed.has(k.id))) return stored;
  }
  const all = solveWave(puzzle.board, kids, puzzle.mode, budget);
  if (all !== null) return all.friends;
  const alone = solveWave(puzzle.board, kids.filter((k) => k.id === kid), puzzle.mode, budget);
  if (alone !== null && fedBy(puzzle.board, alone.friends, kids, puzzle.mode).has(kid)) return alone.friends;
  return null;
}

/** The friends of `target` that carry the kid's snack, from the picker on. */
function routeOf(state: GameState, kids: readonly WaveKid[], target: readonly PlacedFriend[], kid: number): PlacedFriend[] {
  const { board, mode } = state.puzzle;
  const friends: Friend[] = target.map((f, i) => ({ id: i + 1, ...f }));
  const trace = resolveSnacks({ board, friends, kids, mode }).snacks.find((t) => t.kid === kid && t.end === 'fed');
  if (trace === undefined) return [];
  return trace.hops.flatMap((h) => target.filter((f) => f.cell === h.fromY * board.width + h.fromX));
}

/**
 * Commands that put one friend right (the route's first wrong one, then any
 * other of the target's), or take one in the way back; null when there is
 * nothing to do.
 */
function nextFriend(state: GameState, kids: readonly WaveKid[], target: readonly PlacedFriend[], kid: number): { commands: GameCommand[]; placed: number } | null {
  const placed = state.friends.filter((f) => f.cell >= 0);
  const planned = (cell: number, type: FriendType): boolean => target.some((p) => p.cell === cell && p.type === type);
  for (const p of [...routeOf(state, kids, target, kid), ...target]) {
    const here = placed.find((f) => f.cell === p.cell);
    if (here !== undefined && here.type === p.type) {
      if (here.facing === p.facing) continue;
      return { commands: [{ type: 'turn', friend: here.id, facing: p.facing }], placed: p.cell };
    }
    const commands: GameCommand[] = here === undefined ? [] : [{ type: 'toTray', friend: here.id }];
    const spare = placed.find((f) => f.type === p.type && !planned(f.cell, f.type)) ?? state.friends.find((f) => f.type === p.type && f.cell < 0);
    if (spare !== undefined) commands.push({ type: 'place', friend: spare.id, cell: p.cell, facing: p.facing });
    else commands.push({ type: 'buy', friend: p.type }, { type: 'place', friend: state.nextFriendId, cell: p.cell, facing: p.facing });
    return { commands, placed: p.cell };
  }
  const extra = placed.find((f) => !planned(f.cell, f.type));
  return extra === undefined ? null : { commands: [{ type: 'toTray', friend: extra.id }], placed: -1 };
}

/**
 * One press of the hint button: the next tier for the kid being helped, or
 * the next kid. The caller (game.ts) has checked it is a main-mode setup.
 * `apply` runs the commands a tier-3 press sends, through the normal rules.
 */
export function pressHint(state: GameState, apply: (state: GameState, command: GameCommand) => { state: GameState; error: string | null }): { state: GameState; error: string | null } {
  const { puzzle } = state;
  const kids: WaveKid[] = state.kids.map((k) => ({ id: k.id, cell: k.cell, wants: puzzle.kids.find((p) => p.id === k.id)!.wants }));
  const fed = fedNow(state, kids);
  const current = state.hint;
  const same = current !== null && current.kid >= 0 && kids.some((k) => k.id === current.kid) && !fed.has(current.kid);
  const order = state.kids
    .map((k) => puzzle.kids.find((p) => p.id === k.id)!)
    .sort((a, b) => Number(relational(a)) - Number(relational(b)) || a.id - b.id)
    .filter((k) => !fed.has(k.id));
  const kid = same ? puzzle.kids.find((k) => k.id === current.kid)! : order[0];
  const tier = same ? Math.min(3, current.tier + 1) : 1;

  let next = state;
  let hint: MainHint;
  if (kid === undefined) hint = { tier: 0, kid: -1, about: [], lunchbox: -1, placed: -1 };
  else {
    const lunchbox = tier >= 2 ? (puzzle.board.lunchboxes.find((l) => l.snack === kid.wants)?.cell ?? -1) : -1;
    let placed = -1;
    if (tier === 3) {
      const target = targetSetup(state, kids, kid.id);
      const step = target === null ? null : nextFriend(state, kids, target, kid.id);
      if (step === null) return { state, error: 'No hint can help with this board now. Try moving your friends.' };
      for (const command of step.commands) {
        const r = apply(next, command);
        if (r.error !== null) return { state, error: r.error };
        next = r.state;
      }
      placed = step.placed;
    }
    hint = { tier: tier as MainHint['tier'], kid: kid.id, about: topics(kid), lunchbox, placed };
  }
  const hints = [...state.hints];
  while (hints.length < state.wave) hints.push(0);
  hints[state.wave - 1] = hints[state.wave - 1]! + 1;
  return { state: { ...next, hint, hints }, error: null };
}
