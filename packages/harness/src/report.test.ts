/**
 * The RULES 11 targets hold for the shipped tunables: an untouched warehouse
 * on four seeds for an hour (`npm run harness -- report` prints the full
 * report and runs any seeds and length).
 */
import { describe, expect, it } from 'vitest';
import { runReport } from './report.ts';

describe('the WMS report (RULES 11)', () => {
  const report = runReport({ seeds: 4, minutes: 60 });

  it.each(report.checks.map((c) => [c.name, c] as const))('%s', (_name, check) => {
    expect(check.pass, `${check.value} (target ${check.target})`).toBe(true);
  });

  it('every seed ships, earns and receives', () => {
    for (const s of report.seeds) {
      expect(s.shipped).toBeGreaterThan(100);
      expect(s.earnedPerHour).toBeGreaterThan(0);
      expect(s.posClosed).toBeGreaterThan(10);
    }
  });
});
