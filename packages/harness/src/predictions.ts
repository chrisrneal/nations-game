/**
 * Prediction accuracy from exported saves (Gate 2: "owner predicts AI
 * responses 70%+ after one game").
 *
 * The phone's prediction mode (prompt 11) stores every "What will they do?"
 * guess beside the real AI answer in the save. Export the save from the Game
 * tab and run `npm run harness -- predictions --files a.json,b.json` (or
 * `--dir folder`). Only guessed questions are graded; lapsed ones (never
 * guessed) are counted but not scored.
 *
 * Reads the file format the app writes and nothing else; it needs no sim.
 */

/** One stored question, as apps/web/src/platform/predictions.ts writes it. */
export interface StoredPrediction {
  readonly id: number;
  readonly tick: number;
  readonly nationId: string;
  readonly kind: string;
  readonly outcome: string;
  readonly guess: string | null;
  readonly status: 'open' | 'guessed' | 'lapsed';
}

/** The game-over playtest answers, as apps/web/src/platform/playtest.ts writes them (Gate 2 line 7). */
export interface StoredPlaytest {
  readonly who: 'owner' | 'other' | null;
  readonly again: 'yes' | 'unsure' | 'no' | null;
  readonly interesting: string;
}

export interface PredictionFile {
  readonly name: string;
  readonly humanId: string;
  readonly records: readonly StoredPrediction[];
  /** Present when the player answered the game-over questions. */
  readonly playtest?: StoredPlaytest;
}

export const PREDICTION_TARGET_PCT = 70;

/** Reads one exported save (or a bare saved game); throws a plain message if it is not one. */
export function parsePredictionFile(name: string, text: string): PredictionFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name}: not JSON`);
  }
  const root = parsed as { format?: string; game?: unknown };
  const game = (root.format === 'nations-game-save' ? root.game : parsed) as { humanId?: unknown; predictions?: { records?: unknown }; playtest?: unknown } | undefined;
  if (game === undefined || game === null || typeof game.humanId !== 'string') throw new Error(`${name}: not a Nations saved game`);
  const records = Array.isArray(game.predictions?.records) ? (game.predictions.records as StoredPrediction[]) : [];
  const p = game.playtest as Partial<StoredPlaytest> | undefined;
  const playtest: StoredPlaytest | undefined =
    typeof p === 'object' && p !== null
      ? {
          who: p.who === 'owner' || p.who === 'other' ? p.who : null,
          again: p.again === 'yes' || p.again === 'unsure' || p.again === 'no' ? p.again : null,
          interesting: typeof p.interesting === 'string' ? p.interesting : '',
        }
      : undefined;
  return { name, humanId: game.humanId, records, ...(playtest === undefined ? {} : { playtest }) };
}

export interface Tally {
  readonly guessed: number;
  readonly correct: number;
}

export interface PredictionReport {
  readonly files: readonly { readonly name: string; readonly humanId: string; readonly guessed: number; readonly correct: number; readonly lapsed: number }[];
  readonly total: Tally;
  readonly lapsed: number;
  readonly byKind: Readonly<Record<string, Tally>>;
  readonly byNation: Readonly<Record<string, Tally>>;
  /** What the AI actually did, and how often it was guessed right. */
  readonly byOutcome: Readonly<Record<string, Tally>>;
  readonly accuracyPct: number;
  readonly pass: boolean;
}

function add(map: Record<string, Tally>, key: string, right: boolean): void {
  const t = map[key] ?? { guessed: 0, correct: 0 };
  map[key] = { guessed: t.guessed + 1, correct: t.correct + (right ? 1 : 0) };
}

export function predictionReport(files: readonly PredictionFile[]): PredictionReport {
  const byKind: Record<string, Tally> = {};
  const byNation: Record<string, Tally> = {};
  const byOutcome: Record<string, Tally> = {};
  let guessed = 0;
  let correct = 0;
  let lapsed = 0;
  const perFile = files.map((f) => {
    let g = 0;
    let c = 0;
    let l = 0;
    for (const r of f.records) {
      if (r.status === 'lapsed') l++;
      if (r.status !== 'guessed' || r.guess === null) continue;
      const right = r.guess === r.outcome;
      g++;
      if (right) c++;
      add(byKind, r.kind, right);
      add(byNation, r.nationId, right);
      add(byOutcome, r.outcome, right);
    }
    guessed += g;
    correct += c;
    lapsed += l;
    return { name: f.name, humanId: f.humanId, guessed: g, correct: c, lapsed: l };
  });
  const accuracyPct = guessed === 0 ? 0 : Math.round((correct * 1000) / guessed) / 10;
  return { files: perFile, total: { guessed, correct }, lapsed, byKind, byNation, byOutcome, accuracyPct, pass: guessed > 0 && accuracyPct >= PREDICTION_TARGET_PCT };
}

function pct(t: Tally): string {
  return t.guessed === 0 ? '-' : `${Math.round((t.correct * 100) / t.guessed)}%`;
}

function table(title: string, first: string, rows: Readonly<Record<string, Tally>>): string[] {
  const keys = Object.keys(rows).sort();
  if (keys.length === 0) return [];
  return [`## ${title}`, '', `| ${first} | Guessed | Right | Accuracy |`, '|---|---|---|---|', ...keys.map((k) => `| ${k} | ${rows[k]!.guessed} | ${rows[k]!.correct} | ${pct(rows[k]!)} |`), ''];
}

/** Gate 2 line 7: "10 playtests, 3+ by others, most want another game". */
export const PLAYTESTS_NEEDED = 10;
export const PLAYTESTS_BY_OTHERS_NEEDED = 3;

export interface PlaytestReport {
  readonly total: number;
  readonly byOwner: number;
  readonly byOthers: number;
  /** "Would you play another game?" counts, per group (unanswered counted apart). */
  readonly again: Readonly<Record<'owner' | 'other' | 'unknown', Readonly<Record<'yes' | 'unsure' | 'no' | 'none', number>>>>;
  readonly interesting: readonly { readonly name: string; readonly who: string; readonly line: string }[];
  readonly mostWantAnother: boolean;
  readonly verdict: 'PASS' | 'FAIL' | 'NOT YET';
}

export function playtestReport(files: readonly PredictionFile[]): PlaytestReport {
  const empty = (): Record<'yes' | 'unsure' | 'no' | 'none', number> => ({ yes: 0, unsure: 0, no: 0, none: 0 });
  const again = { owner: empty(), other: empty(), unknown: empty() };
  const interesting: { name: string; who: string; line: string }[] = [];
  let total = 0;
  for (const f of files) {
    if (f.playtest === undefined) continue;
    total++;
    const who = f.playtest.who ?? 'unknown';
    again[who][f.playtest.again ?? 'none']++;
    if (f.playtest.interesting.length > 0) interesting.push({ name: f.name, who, line: f.playtest.interesting });
  }
  const byOwner = files.filter((f) => f.playtest?.who === 'owner').length;
  const byOthers = files.filter((f) => f.playtest?.who === 'other').length;
  const yes = again.owner.yes + again.other.yes + again.unknown.yes;
  const mostWantAnother = total > 0 && yes * 2 > total;
  const enough = total >= PLAYTESTS_NEEDED && byOthers >= PLAYTESTS_BY_OTHERS_NEEDED;
  return { total, byOwner, byOthers, again, interesting, mostWantAnother, verdict: !enough ? 'NOT YET' : mostWantAnother ? 'PASS' : 'FAIL' };
}

export function formatPlaytestReport(r: PlaytestReport): string {
  const row = (who: 'owner' | 'other' | 'unknown', label: string): string => {
    const a = r.again[who];
    return `| ${label} | ${a.yes} | ${a.unsure} | ${a.no} | ${a.none} |`;
  };
  return [
    '# Playtests',
    '',
    `Gate 2 line 7: ${PLAYTESTS_NEEDED} playtests, ${PLAYTESTS_BY_OTHERS_NEEDED}+ by others, most want another game.`,
    '',
    `**${r.total} playtest${r.total === 1 ? '' : 's'} (owner ${r.byOwner}, others ${r.byOthers}); most want another game: ${r.mostWantAnother ? 'yes' : 'no'} - ${r.verdict}.**`,
    '',
    '| Who | Yes | Not sure | No | No answer |',
    '|---|---|---|---|---|',
    row('owner', 'Owner'),
    row('other', 'Others'),
    ...(r.again.unknown.yes + r.again.unknown.unsure + r.again.unknown.no + r.again.unknown.none > 0 ? [row('unknown', 'Did not say')] : []),
    '',
    '## Most interesting choice, in their words',
    '',
    ...(r.interesting.length === 0 ? ['None given yet.'] : r.interesting.map((i) => `- "${i.line}" (${i.who}, ${i.name})`)),
    '',
  ].join('\n');
}

export function formatPredictionReport(r: PredictionReport): string {
  const verdict =
    r.total.guessed === 0 ? 'NO DATA (no guesses in these saves: turn on prediction mode in the Game tab)' : r.pass ? 'PASS' : 'FAIL';
  return [
    '# Prediction accuracy',
    '',
    `Gate 2 line: the owner predicts AI responses ${PREDICTION_TARGET_PCT}%+ after one game.`,
    '',
    `**${r.total.correct} of ${r.total.guessed} right: ${r.accuracyPct}% - ${verdict}.** ${r.lapsed} question${r.lapsed === 1 ? '' : 's'} lapsed unguessed (not graded).`,
    '',
    '| Save | Nation | Guessed | Right | Accuracy |',
    '|---|---|---|---|---|',
    ...r.files.map((f) => `| ${f.name} | ${f.humanId} | ${f.guessed} | ${f.correct} | ${pct(f)} |`),
    '',
    ...table('By question', 'Kind', r.byKind),
    ...table('By what the AI did', 'Answer', r.byOutcome),
    ...table('By AI nation', 'Nation', r.byNation),
  ].join('\n');
}
