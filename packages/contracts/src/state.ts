/**
 * The seeded random number generator, stored inside State (S5).
 *
 * Determinism: two machines stepping the same state with the same commands must
 * produce identical results, so randomness cannot come from Math.random - it is
 * state that is saved, restored and hashed like everything else. Integer fields
 * only, so there is no float drift between a phone, a laptop and a server.
 */
export interface RngState {
  readonly seed: number;
  readonly counter: number;
}
