import { describe, expect, it } from 'vitest';
import { runGate2 } from './gate2.test.helpers.ts';
import { fullRoster } from './testkit.test.helpers.ts';

/**
 * The AI's Gate 2 check. CI runs 5 seeds and holds the AI's own criteria to
 * PASS; the full run is on demand:
 *
 *   AI_GATE2_GAMES=200 AI_GATE2_SEED=1 npx vitest run packages/ai/src/gate2.test.ts
 *
 * prints the results table (docs/AI_DESIGN.md "Gate 2 check" has the latest).
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const games = Number(env.AI_GATE2_GAMES ?? 5);
const firstSeed = Number(env.AI_GATE2_SEED ?? 1);

describe(`AI Gate 2 check (${games} seeds from ${firstSeed})`, () => {
  const report = runGate2({ games, firstSeed, roster: fullRoster() });
  (globalThis as unknown as { console: { log(text: string): void } }).console.log(report.table);

  it('retaliation, explanations, budget, legality and determinism pass', () => {
    expect(report.pass.retaliation).toBe(true);
    expect(report.pass.betrayal).toBe(true);
    expect(report.pass.explanations).toBe(true);
    expect(report.pass.budget).toBe(true);
    expect(report.pass.rejected).toBe(true);
    expect(report.pass.determinism).toBe(true);
  });
});
