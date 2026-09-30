#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 *   npm run harness                                  play 20 seeded games of 200 ticks,
 *     [-- --games N --ticks T --seed S --out DIR]    write games.csv + summary.txt
 *   npm run harness -- determinism [--seeds 1000]    same hashes twice in Node and in Chromium
 *     [--ticks 20] [--no-browser]
 *   npm run harness -- bench [--ticks 1000]          time catch-up ticks in Node and Chromium
 *     [--runs 5] [--no-browser]
 *   npm run harness -- gate1 [--games 200]           the Gate 1 suite: seeded full-roster games with
 *     [--seed 1] [--ranges 1] [--ticks T]            random strategies plus paired runs; writes gate1.md.
 *     [--out DIR]                                    --ranges N plays N consecutive ranges of --games
 *                                                    seeds and reports each range and all of them pooled
 *   npm run harness -- gate2 [--games 200]           the Gate 2 suite: random archetypes, crisis success,
 *     [--seed 1] [--ticks T] [--absence 20]          defection and retaliation, win rates, cooperator vs
 *     [--no-idle] [--out DIR]                        free-rider and spoiler pairs, the 24-hour absence
 *                                                    test, the AI-vs-idle and decision-density lines (prompt
 *                                                    17; --no-idle skips them), and the Gate 1 suite again;
 *                                                    writes gate2.md
 *   npm run harness -- predictions                   prediction accuracy (Gate 2) from saves exported on
 *     [--files a.json,b.json] [--dir DIR] [--out DIR] the phone with prediction mode on; writes predictions.md
 *   `--set id=value[,id=value]` (play, gate1, gate2) replaces sim tunables for that run, inside
 *   their bands, for tuning sweeps (overrides.ts).
 *   `--suite gate1` is the same as `gate1`. An unknown command or flag is an
 *   error (exit 2), never silently ignored.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchCatchUp, hashSeeds, runGame, type GameMetrics } from './game.ts';
import { formatSummary, summarize, toCsv } from './metrics.ts';
import { findChromium, runInBrowser } from './browser.ts';
import { loadRoster } from './roster.ts';
import { formatGate1, formatGate1Ranges, runGate1, runGate1Ranges } from './gate1.ts';
import { formatGate2, runGate2 } from './gate2.ts';
import { parseArgs, type HarnessCommand, type ParsedArgs } from './args.ts';
import { applyOverrides, parseOverrides } from './overrides.ts';
import { formatPredictionReport, parsePredictionFile, predictionReport } from './predictions.ts';

let parsed: ParsedArgs;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

try {
  const overrides = parseOverrides(parsed.strings.set ?? '');
  if (Object.keys(overrides).length > 0) {
    applyOverrides(overrides);
    console.log(`tunables set for this run: ${Object.entries(overrides).map(([id, v]) => `${id}=${v}`).join(', ')}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const flag = (name: string, fallback: number): number => parsed.numbers[name] ?? fallback;
const option = (name: string, fallback: string): string => parsed.strings[name] ?? fallback;
const useBrowser = !parsed.switches.includes('no-browser');
const roster = loadRoster();

function stats(times: readonly number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return `median ${median.toFixed(1)} ms, worst ${max.toFixed(1)} ms over ${times.length} runs`;
}

async function play(): Promise<void> {
  const games = flag('games', 20);
  const ticks = flag('ticks', 200);
  const firstSeed = flag('seed', 1);
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = performance.now();
  const results: GameMetrics[] = [];
  for (let i = 0; i < games; i++) results.push(runGame({ seed: firstSeed + i, ticks, roster }));
  const summary = summarize(results, performance.now() - start);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'games.csv'), toCsv(results));
  const text = formatSummary(summary);
  writeFileSync(join(outDir, 'summary.txt'), `${text}\n`);
  console.log(text);
  console.log(`wrote ${join(outDir, 'games.csv')} and summary.txt`);
  if (summary.rejected > 0) process.exitCode = 1;
}

async function determinism(): Promise<void> {
  const seeds = flag('seeds', 1000);
  const ticks = flag('ticks', 20);
  const first = hashSeeds(1, seeds, ticks, roster);
  const second = hashSeeds(1, seeds, ticks, roster);
  const repeatMismatch = first.filter((hash, i) => hash !== second[i]).length;
  console.log(`node repeat run: ${seeds - repeatMismatch}/${seeds} seeds identical`);
  let failed = repeatMismatch > 0;
  if (useBrowser) {
    const run = await runInBrowser({ firstSeed: 1, seeds, ticks, benchTicks: 0, benchRuns: 0 });
    const browserMismatch = first.filter((hash, i) => hash !== run.hashes[i]).length;
    console.log(`node vs browser: ${seeds - browserMismatch}/${seeds} seeds identical (${run.userAgent})`);
    failed ||= browserMismatch > 0 || run.hashes.length !== seeds;
  }
  console.log(failed ? 'DETERMINISM: FAIL' : 'DETERMINISM: PASS');
  if (failed) process.exitCode = 1;
}

async function bench(): Promise<void> {
  const ticks = flag('ticks', 1000);
  const runs = flag('runs', 5);
  console.log(`catch-up benchmark: ${ticks} ticks, ${roster.length} nations, the shipped AI (AiDirector) for every nation`);
  benchCatchUp(ticks, 1, roster, () => performance.now()); // warm-up
  console.log(`node:     ${stats(benchCatchUp(ticks, runs, roster, () => performance.now()))}`);
  if (useBrowser && findChromium() !== undefined) {
    const run = await runInBrowser({ firstSeed: 1, seeds: 0, ticks: 0, benchTicks: ticks, benchRuns: runs });
    console.log(`chromium: ${stats(run.benchMs)} (first run includes JIT warm-up)`);
  }
  console.log('budget:   2000 ms on a mid-range phone (Gate 0); phones are typically several times slower than this machine');
}

async function gate1(): Promise<void> {
  const games = flag('games', 200);
  const firstSeed = flag('seed', 1);
  const ranges = flag('ranges', 1);
  const ticks = parsed.numbers.ticks;
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = performance.now();
  const options = { games, firstSeed, roster, ...(ticks === undefined ? {} : { ticks }) };
  const report = ranges === 1 ? runGate1(options) : runGate1Ranges({ ...options, ranges });
  const text = 'ranges' in report ? formatGate1Ranges(report) : formatGate1(report);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'gate1.md'), `${text}\n`);
  console.log(text);
  console.log(`wall time ${Math.round(performance.now() - start)} ms; wrote ${join(outDir, 'gate1.md')}`);
  if (!report.pass) process.exitCode = 1;
}

async function gate2(): Promise<void> {
  const games = flag('games', 200);
  const firstSeed = flag('seed', 1);
  const ticks = parsed.numbers.ticks;
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = performance.now();
  const report = runGate2({
    games,
    firstSeed,
    roster,
    absenceSeeds: flag('absence', 20),
    ...(ticks === undefined ? {} : { ticks }),
    ...(parsed.switches.includes('no-idle') ? { skipIdle: true } : {}),
  });
  const text = [formatGate2(report), report.gate1 === null ? '' : formatGate1(report.gate1, `Gate 1 suite rerun, seeds ${firstSeed}-${firstSeed + games - 1} (top scorer waived)`).replace(/^## /gm, '### ').replace(/^# /, '## ')].join('\n');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'gate2.md'), `${text}\n`);
  console.log(text);
  console.log(`wall time ${Math.round(performance.now() - start)} ms; wrote ${join(outDir, 'gate2.md')}`);
  if (!report.pass) process.exitCode = 1;
}

async function predictions(): Promise<void> {
  const files = (parsed.strings.files ?? '').split(',').filter((f) => f.length > 0);
  const dir = parsed.strings.dir;
  if (dir !== undefined) files.push(...readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)));
  if (files.length === 0) {
    console.error('Give exported saves: --files a.json,b.json or --dir folder (export from the Game tab with prediction mode on).');
    process.exit(2);
  }
  const report = predictionReport(files.map((f) => parsePredictionFile(f, readFileSync(f, 'utf8'))));
  const text = formatPredictionReport(report);
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'predictions.md'), `${text}\n`);
  console.log(text);
  console.log(`wrote ${join(outDir, 'predictions.md')}`);
  if (!report.pass) process.exitCode = 1;
}

const commands: Record<HarnessCommand, () => Promise<void>> = { play, determinism, bench, gate1, gate2, predictions };
await commands[parsed.command]();
