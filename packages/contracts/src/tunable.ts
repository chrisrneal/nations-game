/**
 * A balance number with the band it is allowed to move inside.
 *
 * Multiplayer need: tuning has to stay honest across machines. Every tunable is
 * declared in packages/sim/src/tunables.ts, never inline, so the balance harness
 * can sweep the band, a gate review can see every number in one file, and client
 * and server can be checked for identical values - a mismatch would make two
 * machines simulate different games from the same commands.
 *
 * `min` and `max` are the range the harness may search and a reviewer may edit
 * within; going outside the band is a design change, not tuning.
 */
export interface Tunable {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Why this band, in one sentence, for whoever tunes it next. */
  readonly note: string;
}
