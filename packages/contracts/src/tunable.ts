/**
 * A balance number with the band it is allowed to move inside.
 *
 * Tuning has to stay honest. Every tunable is declared in
 * packages/sim/src/tunables.ts and in the docs/RULES.md table, never inline,
 * so the harness can sweep the band and a reviewer can see every number in one
 * place. Machines with different values would simulate different warehouses from
 * the same commands.
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
