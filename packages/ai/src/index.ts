/**
 * @nations/ai - deterministic utility AI for nations.
 *
 * Contract: reads only a per-nation View, emits Commands, never writes State and
 * never reads State. No LLM in decisions (D5), so games replay exactly and the
 * balance harness can run hundreds of them headlessly. Every decision must be
 * able to explain its top reasons, and the same code acts as caretaker for an
 * absent human's nation.
 *
 * Phase 0: only the dummy AI, which picks valid commands at random from a seed.
 * packages/ai imports @nations/sim for types only (checked by
 * packages/harness/src/purity.test.ts).
 *
 * Shape to come:
 *   decide(view: View, personality: Personality): { commands: readonly Command[]; reasons: readonly string[] }
 */
export { dummyDecide } from './dummy.ts';
