/**
 * The generator report (RULES 10): generate many days of each kind, check
 * every promise, and summarise how hard the days are and how long they take.
 */
import type { Mode, Round } from '@snacks/contracts';
import { checkDays, type DayCheck } from './games.ts';

export interface KindReport {
  readonly mode: Mode;
  readonly round: Round;
  readonly checks: readonly DayCheck[];
  readonly failed: readonly DayCheck[];
}

export const KINDS: readonly (readonly [Mode, Round])[] = [
  ['main', 'daily'],
  ['main', 'bonus'],
  ['kindy', 'daily'],
];

export function runReport(firstDay: number, days: number, now: () => number): KindReport[] {
  return KINDS.map(([mode, round]) => {
    const checks = checkDays(mode, round, firstDay, days, now);
    return { mode, round, checks, failed: checks.filter((c) => c.problems.length > 0) };
  });
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const pct = (xs: readonly number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;

export function formatReport(reports: readonly KindReport[]): string {
  const lines: string[] = ['# Generator report', ''];
  lines.push('| Kind | Days | Passed | Seeds skipped (mean, worst) | ms a day (median, 99th) | Kids a day | Tray |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of reports) {
    const ok = r.checks.filter((c) => c.problems.length === 0);
    const skipped = ok.map((c) => c.skipped);
    const ms = r.checks.map((c) => c.ms);
    lines.push(
      `| ${r.mode} ${r.round} | ${r.checks.length} | ${ok.length} | ${mean(skipped).toFixed(1)}, ${Math.max(0, ...skipped)} | ${pct(ms, 0.5).toFixed(1)}, ${pct(ms, 0.99).toFixed(1)} | ${mean(ok.map((c) => c.kids)).toFixed(1)} | ${mean(ok.map((c) => c.tray)).toFixed(1)} |`,
    );
  }
  lines.push('', 'Difficulty by wave (mean friends in the solver’s setup plus relational clues):', '');
  for (const r of reports) {
    const waves = Math.max(0, ...r.checks.map((c) => c.difficulty.length));
    const means = Array.from({ length: waves }, (_, w) => mean(r.checks.flatMap((c) => (c.difficulty[w] === undefined ? [] : [c.difficulty[w]]))).toFixed(1));
    lines.push(`- ${r.mode} ${r.round}: ${means.join(' · ')}`);
  }
  const failed = reports.flatMap((r) => r.failed.map((c) => `- ${r.mode} ${r.round} day ${c.day}: ${c.problems.join('; ')}`));
  lines.push('', failed.length === 0 ? 'Every day passed every check.' : `FAILED:\n${failed.slice(0, 30).join('\n')}`);
  return lines.join('\n');
}
