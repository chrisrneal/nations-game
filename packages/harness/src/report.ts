/**
 * The generator report (RULES 10): generate many days of each kind, check
 * every promise, and summarise how hard the days are and how long they take.
 * Since K11 it also measures how often the tray gives the answer away, draws
 * the bonus round's ramp against its targets, and has a sanity table of each
 * kind's waves.
 */
import type { Mode, Round } from '@snacks/contracts';
import { bonusFriendsAt, SNACK_TUNABLES } from '@snacks/sim';
import { checkDays, type DayCheck } from './games.ts';
import type { DayStats } from './stats.ts';

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
const percent = (part: number, whole: number): string => `${whole === 0 ? '0' : ((100 * part) / whole).toFixed(1)}%`;
const name = (r: KindReport): string => `${r.mode} ${r.round}`;

function statsOf(r: KindReport): DayStats[] {
  return r.checks.flatMap((c) => (c.stats === null ? [] : [c.stats]));
}

/** Mean difficulty of each wave over a kind's days (RULES 10: friends in the solution plus relational clues). */
export function difficultyCurve(r: KindReport): number[] {
  const waves = Math.max(0, ...r.checks.map((c) => c.difficulty.length));
  return Array.from({ length: waves }, (_, w) => mean(r.checks.flatMap((c) => (c.difficulty[w] === undefined ? [] : [c.difficulty[w]]))));
}

/** How often the tray gives the answer away (K11): waves with nothing spare, and days whose tray is only the answer. */
export function giveaway(r: KindReport): { waves: number; tellWaves: number; days: number; bareDays: number; decoys: number; fewest: number } {
  const stats = statsOf(r);
  return {
    waves: stats.reduce((sum, s) => sum + s.spare.length, 0),
    tellWaves: stats.reduce((sum, s) => sum + s.tells.length, 0),
    days: stats.length,
    bareDays: stats.filter((s) => s.unused === 0).length,
    decoys: mean(stats.map((s) => s.unused)),
    fewest: Math.min(...stats.map((s) => s.unused)),
  };
}

/** The targets the report holds the generator to (K11), each with whether it is met. */
export function targets(reports: readonly KindReport[]): { what: string; met: boolean; detail: string }[] {
  const out: { what: string; met: boolean; detail: string }[] = [];
  for (const r of reports.filter((x) => x.mode === 'main')) {
    const g = giveaway(r);
    out.push({ what: `${name(r)}: no wave where the tray gives the answer away (0%)`, met: g.tellWaves === 0, detail: `${g.tellWaves} of ${g.waves} waves, ${percent(g.tellWaves, g.waves)}` });
    out.push({ what: `${name(r)}: no day whose tray is only the answer (0%)`, met: g.bareDays === 0, detail: `${g.bareDays} of ${g.days} days, ${percent(g.bareDays, g.days)}` });
  }
  const bonus = reports.find((x) => x.round === 'bonus');
  const daily = reports.find((x) => x.mode === 'main' && x.round === 'daily');
  if (bonus !== undefined && daily !== undefined) {
    const b = difficultyCurve(bonus);
    const d = difficultyCurve(daily);
    const early = mean(b.slice(0, 3));
    const late = mean(b.slice(-3));
    out.push({ what: 'bonus: the last three waves at least 1.5 harder than the first three (not flat)', met: late >= early + 1.5, detail: `${early.toFixed(1)} → ${late.toFixed(1)}` });
    out.push({ what: 'bonus: wave 10 harder than the daily’s wave 10', met: (b.at(-1) ?? 0) > (d.at(-1) ?? 0), detail: `${(b.at(-1) ?? 0).toFixed(1)} against ${(d.at(-1) ?? 0).toFixed(1)}` });
  }
  return out;
}

/** One kind's waves: what each needs, from the stored solutions. */
function sanityTable(r: KindReport): string[] {
  const stats = statsOf(r);
  const waves = Math.max(0, ...stats.map((s) => s.friends.length));
  const kidsAt = (w: number): number => mean(r.checks.flatMap((c) => (c.stats === null ? [] : [c.stats.chains[w]?.length ?? 0])));
  const lines = [
    `### ${name(r)} (${stats.length} days)`,
    '',
    '| Wave | Kids | Friends needed | Clue steps | Pass chain (mean, longest) | Spare friends | Tray tells |',
    '|---|---|---|---|---|---|---|',
  ];
  for (let w = 0; w < waves; w++) {
    const at = stats.filter((s) => s.friends[w] !== undefined);
    const chains = at.flatMap((s) => s.chains[w] ?? []);
    const tells = at.filter((s) => s.tells.includes(w + 1)).length;
    lines.push(
      `| ${w + 1} | ${kidsAt(w).toFixed(1)} | ${mean(at.map((s) => s.friends[w]!)).toFixed(1)} | ${mean(at.map((s) => s.clueSteps[w]!)).toFixed(1)} | ${mean(chains).toFixed(1)}, ${Math.max(0, ...chains)} | ${mean(at.map((s) => s.spare[w]!)).toFixed(1)} | ${percent(tells, at.length)} |`,
    );
  }
  const g = giveaway(r);
  lines.push('', `Decoys (starting-tray friends the solution never places): ${g.decoys.toFixed(1)} a day, fewest ${g.fewest}.`, '');
  return lines;
}

export function formatReport(reports: readonly KindReport[]): string {
  const lines: string[] = ['# Generator report', ''];
  lines.push('| Kind | Days | Passed | Seeds skipped (mean, worst) | ms a day (median, 99th) | Kids a day | Tray | Decoys |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of reports) {
    const ok = r.checks.filter((c) => c.problems.length === 0);
    const skipped = ok.map((c) => c.skipped);
    const ms = r.checks.map((c) => c.ms);
    lines.push(
      `| ${name(r)} | ${r.checks.length} | ${ok.length} | ${mean(skipped).toFixed(1)}, ${Math.max(0, ...skipped)} | ${pct(ms, 0.5).toFixed(1)}, ${pct(ms, 0.99).toFixed(1)} | ${mean(ok.map((c) => c.kids)).toFixed(1)} | ${mean(ok.map((c) => c.tray)).toFixed(1)} | ${giveaway(r).decoys.toFixed(1)} |`,
    );
  }
  lines.push('', 'Difficulty by wave (mean friends in the solver’s setup plus relational clues):', '');
  for (const r of reports) lines.push(`- ${name(r)}: ${difficultyCurve(r).map((x) => x.toFixed(1)).join(' · ')}`);

  lines.push('', '## Does the tray give the answer away? (K11)', '');
  lines.push(
    'A wave gives it away when the friends you own at its start (the tray plus what the stored solution bought earlier) are exactly the ones its solution places: nothing is spare, so “use everything” is the answer. A day’s tray gives it away when every friend in it is placed by the solution on some wave: it holds nothing but the answer’s pieces. Kindy’s friends are given (D15) and keep no decoys.',
    '',
    '| Kind | Waves giving it away | Days whose tray is only the answer | Decoys a day (mean, fewest) |',
    '|---|---|---|---|',
  );
  for (const r of reports) {
    const g = giveaway(r);
    lines.push(`| ${name(r)} | ${g.tellWaves} of ${g.waves} (${percent(g.tellWaves, g.waves)}) | ${g.bareDays} of ${g.days} (${percent(g.bareDays, g.days)}) | ${g.decoys.toFixed(1)}, ${g.fewest} |`);
  }

  lines.push('', '## The bonus round’s ramp (K11)', '');
  const planned = Array.from({ length: SNACK_TUNABLES.mainWaves.value }, (_, i) => bonusFriendsAt(i + 1));
  lines.push(`- Planned (\`bonusFriendsFirst\` ${SNACK_TUNABLES.bonusFriendsFirst.value} to \`bonusFriendsLast\` ${SNACK_TUNABLES.bonusFriendsLast.value}): the two kids’ shortest routes add up to ${planned.join(' · ')} friends.`);
  for (const r of reports.filter((x) => x.mode === 'main')) {
    const curve = difficultyCurve(r);
    const top = Math.max(...curve, 1);
    lines.push(`- Measured, ${name(r)}: ${curve.map((x) => x.toFixed(1)).join(' · ')}`);
    lines.push('', '```', ...curve.map((x, w) => `${name(r).padEnd(11)} wave ${String(w + 1).padStart(2)} ${'█'.repeat(Math.round((x / top) * 30)).padEnd(30)} ${x.toFixed(1)}`), '```', '');
  }

  lines.push('## Targets', '', '| Target | Measured | Met |', '|---|---|---|');
  for (const t of targets(reports)) lines.push(`| ${t.what} | ${t.detail} | ${t.met ? 'yes' : '**NO**'} |`);

  lines.push('', '## Difficulty sanity, wave by wave (K11)', '');
  lines.push(
    'From each day’s stored solution: kids arriving, friends it places, clue-logic steps (one per fact on a card; a card pointing at another kid adds that kid’s facts), the pass chain each fed snack travels (friends from the picker to the kid), the friends owned but left spare, and the share of days where that wave places every friend owned.',
    '',
  );
  for (const r of reports) lines.push(...sanityTable(r));

  const failed = reports.flatMap((r) => r.failed.map((c) => `- ${name(r)} day ${c.day}: ${c.problems.join('; ')}`));
  lines.push(failed.length === 0 ? 'Every day passed every check.' : `FAILED:\n${failed.slice(0, 30).join('\n')}`);
  return lines.join('\n');
}
