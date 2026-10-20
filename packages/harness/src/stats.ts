/**
 * How hard a generated day is, wave by wave (RULES 10, K9): what the
 * difficulty report's sanity tables are made of. Pure code over @snacks/sim,
 * from the puzzle and its stored solution.
 */
import type { Puzzle, PuzzleKid } from '@snacks/contracts';
import { resolveSnacks, trayUse } from '@snacks/sim';

export interface DayStats {
  /** Friends the stored solution places, each wave. */
  readonly friends: readonly number[];
  /** Clue-logic steps each wave: facts on its kids' cards, a card pointing at another kid counting that kid's facts too. Kindy: 0. */
  readonly clueSteps: readonly number[];
  /** Each wave, the friends each fed snack passed through (picker included): its pass chain. */
  readonly chains: readonly (readonly number[])[];
  /** Friends owned at the start of each wave's setup that its solution leaves out. */
  readonly spare: readonly number[];
  /** Waves where the friends owned are exactly the ones the solution places: the tray gives the answer away. */
  readonly tells: readonly number[];
  /** Friends in the starting tray the solution never places: decoys. */
  readonly unused: number;
}

/** The kid a relational card points at, in the same wave. */
function pointedAt(p: Puzzle, kid: PuzzleKid): PuzzleKid | undefined {
  const wave = p.kids.filter((k) => k.wave === kid.wave && k.id !== kid.id);
  for (const f of kid.clue?.facts ?? []) {
    if (f.kind === 'same') return wave.find((k) => k.look[f.feature]);
    if (f.kind === 'notSister') return wave.find((k) => kid.look.sister > 0 && k.look.sister === kid.look.sister);
  }
  return undefined;
}

/** Steps to work out one kid's snack: one per fact, plus the facts of the card it points at. */
export function clueSteps(p: Puzzle, kid: PuzzleKid): number {
  if (kid.clue === null) return 0;
  const other = pointedAt(p, kid);
  return kid.clue.facts.length + (other?.clue?.facts.length ?? 0);
}

export function dayStats(p: Puzzle): DayStats {
  const use = trayUse(p);
  const chains = p.witness.map((layout) => {
    const kids = p.kids.filter((k) => k.wave === layout.wave).map((k) => ({ id: k.id, cell: k.cell, wants: k.wants }));
    const friends = layout.friends.map((f, i) => ({ id: i + 1, ...f }));
    return resolveSnacks({ board: p.board, friends, kids, mode: p.mode })
      .snacks.filter((s) => s.end === 'fed')
      .map((s) => s.hops.length);
  });
  return {
    friends: p.witness.map((l) => l.friends.length),
    clueSteps: p.witness.map((l) => p.kids.filter((k) => k.wave === l.wave).reduce((sum, k) => sum + clueSteps(p, k), 0)),
    chains,
    spare: use.spare,
    tells: use.tells,
    unused: use.unused,
  };
}
