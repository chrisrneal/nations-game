/**
 * @nations/ai - deterministic utility AI for nations.
 *
 * Contract: reads only a per-nation View (and the events its audience may
 * see), emits Commands, never writes State and never reads State. No LLM in
 * decisions (D5), so games replay exactly and the balance harness can run
 * hundreds of them headlessly. Every decision explains itself with numbers.
 *
 * Phase 2: `AiDirector` runs the layered AI of docs/AI_DESIGN.md for the whole
 * roster inside a per-tick budget. Phase 1's greedy trader (`greedyDecide`)
 * stays for the Gate 1 harness bots, and the Phase 0 dummy for its tests.
 * Runtime imports: contracts types and own files only (checked by
 * packages/harness/src/purity.test.ts).
 */
export { dummyDecide } from './dummy.ts';
export { GREEDY, greedyDecide, openOffersBy, type Decision, type TraderStyle } from './greedy.ts';
export { AiDirector, endowmentsOf, type AiDirectorOptions, type DirectorOutput, type DirectorSnapshot, type TickUsage } from './director.ts';
export { NationMind, type MindSnapshot } from './mind.ts';
export { personalityFor, stanceLabel, structuralInputs, type Personality, type Reciprocity, type StructuralInputs } from './personality.ts';
export { EXPLANATION_EVENT, hasNumber, type DecisionKind, type Explanation, type ExplanationEvent } from './explain.ts';
export { crisisLabel, lastPaidPct, openAppeals, visibleTo } from './perception.ts';
export type { Goal, GoalId } from './goals.ts';
export type { PartnerMemory } from './beliefs.ts';
