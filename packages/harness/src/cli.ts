#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 *   npm run harness                                  play 20 seeded games of 200 ticks,
 *     [-- --games N --ticks T --seed S --out DIR]    write games.csv + summary.txt
 *   npm run harness -- determinism [--seeds 1000]    same hashes twice in Node and in Chromium
 *     [--ticks 50] [--no-browser]
 *   npm run harness -- bench [--ticks 1000]          time catch-up ticks in Node and Chromium
 *     [--runs 5] [--no-browser]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchCatchUp, hashSeeds, runGame, type GameMetrics } from './game.ts';
import { formatSummary, summarize, toCsv } from './metrics.ts';
import { findChromium, runInBrowser } from './browser.ts';
import { loadRoster } from './roster.ts';

const args = process.argv.slice(2);
const command = args[0] !== undefined && !args[0].startsWith('--') ? args[0] : 'play';

function flag(name: string, fallback: number): number {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`--${name} needs a whole number`);
  return value;
}

function option(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

const useBrowser = !args.includes('--no-browser');
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
  const ticks = flag('ticks', 50);
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
  console.log(`catch-up benchmark: ${ticks} ticks, ${roster.length} nations, dummy AI for every nation`);
  benchCatchUp(ticks, 1, roster, () => performance.now()); // warm-up
  console.log(`node:     ${stats(benchCatchUp(ticks, runs, roster, () => performance.now()))}`);
  if (useBrowser && findChromium() !== undefined) {
    const run = await runInBrowser({ firstSeed: 1, seeds: 0, ticks: 0, benchTicks: ticks, benchRuns: runs });
    console.log(`chromium: ${stats(run.benchMs)} (first run includes JIT warm-up)`);
  }
  console.log('budget:   2000 ms on a mid-range phone (Gate 0); phones are typically several times slower than this machine');
}

const commands: Record<string, () => Promise<void>> = { play, determinism, bench };
const run = commands[command];
if (run === undefined) {
  console.error(`Unknown harness command "${command}". Use play, determinism or bench.`);
  process.exitCode = 2;
} else {
  await run();
}
