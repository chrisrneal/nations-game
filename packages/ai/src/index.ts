/**
 * @nations/ai - deterministic utility AI for nations.
 *
 * Contract: reads only a per-nation View, emits Commands, never writes State and
 * never reads State. No LLM in decisions (D5), so games replay exactly and the
 * balance harness can run hundreds of them headlessly. Every decision explains
 * itself with numbers, and the same code acts as caretaker for an absent human.
 *
 * Phase 1: the greedy trader (`greedyDecide`), which swaps surplus for deficit.
 * The Phase 0 dummy stays for the platform until it switches (docs/GAPS.md).
 * Runtime imports: contracts types and own files only (checked by
 * packages/harness/src/purity.test.ts).
 */
export { dummyDecide } from './dummy.ts';
export { GREEDY, greedyDecide, openOffersBy, type Decision, type TraderStyle } from './greedy.ts';
