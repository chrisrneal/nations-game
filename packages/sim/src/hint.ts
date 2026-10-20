import type { FriendType, GameState, KindyHint, PlacedFriend } from '@snacks/contracts';
import { resolveSnacks, type WaveKid } from './resolve.ts';
import { feedSome, fedBy, type Budget, type Progress } from './solver.ts';

/**
 * Kindy hints (RULES 11, K8): the next step towards a setup that feeds the
 * kids on the board, for the interface to show with a pointing hand and say
 * out loud. Never text, never in main mode (S6).
 *
 * The setup aimed at is the puzzle's stored solution for this wave while the
 * day goes to plan. Once a kid is left waiting it is a setup that feeds
 * everyone if there is one, else the longest-waiting kid (their own wave's
 * stored solution first, then the solver's). The generator makes sure there
 * always is one (`stuckKindySet`). The steps lead there one tap pair at a
 * time: each friend placed (moving one already out before taking one from
 * the tray), then aimed, then anyone in the way back to the tray, then Go.
 * A setup the child made that already feeds everyone is left alone.
 */
export function kindyHint(state: GameState): KindyHint | null {
  const { puzzle } = state;
  if (puzzle.mode !== 'kindy' || state.phase !== 'setup' || state.kids.length === 0) return null;
  const { board } = puzzle;
  const kids: WaveKid[] = state.kids.map((k) => ({ id: k.id, cell: k.cell, wants: puzzle.kids.find((p) => p.id === k.id)!.wants }));
  const fedNow = resolveSnacks({ board, friends: state.friends, kids, mode: puzzle.mode }).fed;
  if (fedNow.size === kids.length) return { kind: 'go' };

  const target = targetSetup(state, kids);
  if (target === null) return null;
  const plan = target.friends;
  const placed = state.friends.filter((f) => f.cell >= 0);
  const planned = (cell: number, type: FriendType): boolean => plan.some((p) => p.cell === cell && p.type === type);
  for (const p of plan) {
    const here = placed.find((f) => f.cell === p.cell);
    if (here !== undefined && here.type === p.type && here.facing === p.facing) continue;
    if (here !== undefined) return here.type === p.type ? { kind: 'aim', friend: here.id, facing: p.facing } : { kind: 'tray', friend: here.id };
    const spare = placed.find((f) => f.type === p.type && !planned(f.cell, f.type)) ?? state.friends.find((f) => f.type === p.type && f.cell < 0);
    if (spare === undefined) return null;
    return { kind: 'place', friend: spare.id, cell: p.cell };
  }
  // Every friend of the setup is out and aimed: anyone else who catches the snack goes back.
  if (target.fed.every((id) => fedNow.has(id))) return { kind: 'go' };
  const extra = placed.find((f) => !planned(f.cell, f.type));
  return extra === undefined ? { kind: 'go' } : { kind: 'tray', friend: extra.id };
}

/** The setup a hint leads to: the stored solution on plan, else what feeds the most-waiting kids (see above). */
function targetSetup(state: GameState, kids: readonly WaveKid[]): Progress | null {
  const { puzzle } = state;
  const owned: Partial<Record<FriendType, number>> = {};
  for (const f of state.friends) owned[f.type] = (owned[f.type] ?? 0) + 1;
  const fits = (friends: readonly PlacedFriend[]): boolean => {
    const need: Partial<Record<FriendType, number>> = {};
    for (const f of friends) need[f.type] = (need[f.type] ?? 0) + 1;
    return Object.entries(need).every(([type, n]) => n <= (owned[type as FriendType] ?? 0));
  };
  const stored = (wave: number): readonly PlacedFriend[] | null => {
    const layout = puzzle.witness.find((l) => l.wave === wave);
    return layout !== undefined && layout.buys.length === 0 && fits(layout.friends) ? layout.friends : null;
  };

  const due = puzzle.kids.filter((k) => k.wave === state.wave).map((k) => k.id);
  const onPlan = due.length === kids.length && kids.every((k) => due.includes(k.id));
  const planned = onPlan ? stored(state.wave) : null;
  if (planned !== null) {
    const fed = fedBy(puzzle.board, planned, kids, puzzle.mode);
    if (kids.every((k) => fed.has(k.id))) return { friends: planned, fed: kids.map((k) => k.id) };
  }
  const budget: Budget = { owned, points: 0, shop: [] };
  return feedSome(puzzle.board, kids, puzzle.mode, budget, (kid) => {
    const wave = puzzle.kids.find((k) => k.id === kid.id)?.wave ?? 0;
    const layout = stored(wave);
    return layout === null ? [] : [layout];
  });
}
