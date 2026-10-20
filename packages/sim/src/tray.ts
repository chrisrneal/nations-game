import type { FriendType, Puzzle } from '@snacks/contracts';

/**
 * What the starting tray tells a player about the answer (RULES 10, K11).
 *
 * The friends a player owns at a wave are the tray plus what the stored
 * solution (the witness) bought before it. A wave **gives the answer away**
 * when every one of those friends is placed by that wave's solution: nothing
 * is spare, so "use everything" is the answer. A day's tray gives it away
 * when every friend in it is placed on some wave: it holds nothing but the
 * answer's pieces. Decoys are there to stop both.
 *
 * Friends are matched the way the witness is played (witness.ts): the first
 * owned friend of the type, tray friends before bought ones.
 */
export interface TrayUse {
  /** Spare friends at each wave: owned at the start of its setup and not placed by its solution. */
  readonly spare: readonly number[];
  /** Waves whose solution places every friend owned at the start of its setup. */
  readonly tells: readonly number[];
  /** Friends in the starting tray the solution never places all day. */
  readonly unused: number;
}

export function trayUse(puzzle: Puzzle): TrayUse {
  const owned: { id: number; type: FriendType }[] = puzzle.tray.map((type, i) => ({ id: i + 1, type }));
  const ever = new Set<number>();
  const spare: number[] = [];
  const tells: number[] = [];
  for (const layout of puzzle.witness) {
    const before = owned.length;
    for (const type of layout.buys) owned.push({ id: owned.length + 1, type });
    const used = new Set<number>();
    for (const placed of layout.friends) {
      const friend = owned.find((f) => f.type === placed.type && !used.has(f.id));
      if (friend !== undefined) used.add(friend.id);
    }
    for (const id of used) ever.add(id);
    const left = owned.slice(0, before).filter((f) => !used.has(f.id)).length;
    spare.push(left);
    if (left === 0) tells.push(layout.wave);
  }
  return { spare, tells, unused: puzzle.tray.filter((_, i) => !ever.has(i + 1)).length };
}
