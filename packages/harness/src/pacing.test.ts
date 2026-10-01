/**
 * The pacing targets of docs/RULES.md section 11 hold for the shipped
 * tunables: the greedy and idle bots on seed 1 (`npm run harness -- pacing`
 * prints the full report and runs any seed).
 */
import { describe, expect, it } from 'vitest';
import { runPacing } from './pacing.ts';

describe('pacing (RULES 11)', () => {
  const report = runPacing({ seed: 1 });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, check) => {
    expect(check.pass, `${check.value} (target ${check.target})`).toBe(true);
  });

  it('the first sale lands in the 30-60 minute window with at least 3 slots', () => {
    expect(report.greedy.firstSale).toBeGreaterThanOrEqual(1800);
    expect(report.greedy.firstSale).toBeLessThanOrEqual(3600);
    expect(report.greedy.slotsAtFirstSale).toBeGreaterThanOrEqual(3);
  });
});
