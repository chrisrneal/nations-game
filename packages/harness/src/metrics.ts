import type { GameMetrics } from './game.ts';

export const CSV_COLUMNS = [
  'seed',
  'ticks',
  'nations',
  'submitted',
  'rejectedAtSubmit',
  'rejectedAtStep',
  'racedAtStep',
  'tradesSettled',
  'offersExpired',
  'offersFailed',
  'controllerSwitches',
  'finalHash',
] as const satisfies readonly (keyof GameMetrics)[];

/** CSV text: header plus one row per game. Values are numbers or hex, so no quoting is needed. */
export function toCsv(games: readonly GameMetrics[]): string {
  const rows = games.map((game) => CSV_COLUMNS.map((column) => String(game[column])).join(','));
  return `${[CSV_COLUMNS.join(','), ...rows].join('\n')}\n`;
}

export interface Summary {
  readonly games: number;
  readonly ticksPerGame: number;
  readonly submitted: number;
  readonly rejected: number;
  /** Same-month races (the other side answered first): refused, but not invalid. */
  readonly raced: number;
  readonly tradesSettled: number;
  readonly meanCommandsPerGame: number;
  readonly distinctHashes: number;
  readonly elapsedMs: number;
}

export function summarize(games: readonly GameMetrics[], elapsedMs: number): Summary {
  const sum = (pick: (g: GameMetrics) => number) => games.reduce((total, g) => total + pick(g), 0);
  const submitted = sum((g) => g.submitted);
  return {
    games: games.length,
    ticksPerGame: games[0]?.ticks ?? 0,
    submitted,
    rejected: sum((g) => g.rejectedAtSubmit + g.rejectedAtStep),
    raced: sum((g) => g.racedAtStep),
    tradesSettled: sum((g) => g.tradesSettled),
    meanCommandsPerGame: games.length === 0 ? 0 : Math.round(submitted / games.length),
    distinctHashes: new Set(games.map((g) => g.finalHash)).size,
    elapsedMs: Math.round(elapsedMs),
  };
}

export function formatSummary(summary: Summary): string {
  return [
    `games played:        ${summary.games} x ${summary.ticksPerGame} ticks`,
    `commands submitted:  ${summary.submitted} (mean ${summary.meanCommandsPerGame} per game)`,
    `commands rejected:   ${summary.rejected} (plus ${summary.raced} same-month races: the other side answered first)`,
    `trades settled:      ${summary.tradesSettled}`,
    `distinct end states: ${summary.distinctHashes}`,
    `wall time:           ${summary.elapsedMs} ms`,
  ].join('\n');
}
