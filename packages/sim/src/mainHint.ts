import type { Friend, FriendType, GameCommand, GameState, HintTopic, MainHint, PlacedFriend, PuzzleKid } from '@snacks/contracts';
import { priceOf } from './game.ts';
import { pickupFor, resolveSnacks, type WaveKid } from './resolve.ts';
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
 * Every command set that puts one friend right (the route's wrong ones first,
 * then any other of the target's), or takes one in the way back; empty when
 * there is nothing to do. A friend left over from an earlier wave that still
 * throws and that the plan does not use goes back in the same press.
 */
function nextFriends(state: GameState, kids: readonly WaveKid[], target: readonly PlacedFriend[], kid: number): Step[] {
  const placed = state.friends.filter((f) => f.cell >= 0);
  const planned = (cell: number, type: FriendType): boolean => target.some((p) => p.cell === cell && p.type === type);
  // A friend left over from an earlier wave that the plan does not use would keep throwing while the route is built (it can
  // give a kid a tummy ache before the plan is done), so those go back to the tray first.
  const stale = placed.find((f) => !planned(f.cell, f.type) && pickupFor(state.puzzle.board, f) >= 0);
  const steps: Step[] = [];
  for (const p of [...routeOf(state, kids, target, kid), ...target]) {
    const here = placed.find((f) => f.cell === p.cell);
    if (here !== undefined && here.type === p.type) {
      if (here.facing === p.facing) continue;
      steps.push({ commands: [{ type: 'turn', friend: here.id, facing: p.facing }], placed: p.cell });
      continue;
    }
    const commands: GameCommand[] = here === undefined ? [] : [{ type: 'toTray', friend: here.id }];
    const spare = placed.find((f) => f.type === p.type && !planned(f.cell, f.type)) ?? state.friends.find((f) => f.type === p.type && f.cell < 0);
    if (spare !== undefined) commands.push({ type: 'place', friend: spare.id, cell: p.cell, facing: p.facing });
    else commands.push({ type: 'buy', friend: p.type }, { type: 'place', friend: state.nextFriendId, cell: p.cell, facing: p.facing });
    steps.push({ commands, placed: p.cell });
  }
  if (stale !== undefined) {
    // Sent back in the same press as the step, unless that step already moves it.
    const away: GameCommand = { type: 'toTray', friend: stale.id };
    if (steps.length === 0) return [{ commands: [away], placed: -1 }];
    return steps.map((s) => (s.commands.some((c) => 'friend' in c && c.friend === stale.id) ? s : { ...s, commands: [away, ...s.commands] }));
  }
  if (steps.length > 0) return steps;
  const extra = placed.find((f) => !planned(f.cell, f.type));
  return extra === undefined ? [] : [{ commands: [{ type: 'toTray', friend: extra.id }], placed: -1 }];
}

interface Step {
  commands: GameCommand[];
  placed: number;
}

/** Kids a setup gives a tummy ache. */
function achesOf(state: GameState, kids: readonly WaveKid[]): ReadonlySet<number> {
  return new Set(resolveSnacks({ board: state.puzzle.board, friends: state.friends, kids, mode: state.puzzle.mode }).aches.keys());
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
      const options = target === null ? [] : nextFriends(state, kids, target, kid.id);
      if (options.length === 0) return { state, error: 'No hint can help with this board now. Try moving your friends.' };
      // Half a route can throw a snack at the wrong kid before the rest stands, so of the steps that help, take the first
      // that gives nobody a new tummy ache if the player pressed Go right after (the finished plan never does).
      const achesBefore = achesOf(state, kids);
      let chosen: { step: Step; state: GameState } | null = null;
      for (const option of options) {
        let tried = state;
        for (const command of option.commands) {
          const r = apply(tried, command);
          if (r.error !== null) return { state, error: r.error };
          tried = r.state;
        }
        chosen ??= { step: option, state: tried };
        if ([...achesOf(tried, kids)].every((k) => achesBefore.has(k))) {
          chosen = { step: option, state: tried };
          break;
        }
      }
      next = chosen!.state;
      placed = chosen!.step.placed;
    }
    hint = { tier: tier as MainHint['tier'], kid: kid.id, about: topics(kid), lunchbox, placed };
  }
  const hints = [...state.hints];
  while (hints.length < state.wave) hints.push(0);
  hints[state.wave - 1] = hints[state.wave - 1]! + 1;
  return { state: { ...next, hint, hints }, error: null };
}
