#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 *   npm run harness [-- pacing] [--seed 1]           the airport pacing pass (RULES 11): greedy and idle
 *     [--minutes 90] [--out DIR]                     bots, time to each milestone; writes pacing.md
 *   npm run harness -- determinism [--seeds 1000]    same airport hashes twice in Node and in Chromium
 *     [--ticks 240] [--no-browser]
 *   npm run harness -- bench [--ticks 345600]        time airport catch-up (default 24 h) in Node and Chromium
 *     [--runs 5] [--no-browser]
 *   `--set id=value[,id=value]` (pacing) replaces airport tunables for that run, inside their bands
 *   (overrides.ts). An unknown command or flag is an error (exit 2), never silently ignored.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchAirportCatchUp, hashAirportSeeds } from './airport.ts';
import { formatPacing, runPacing } from './pacing.ts';
import { findChromium, runInBrowser } from './browser.ts';
import { parseArgs, type HarnessCommand, type ParsedArgs } from './args.ts';
import { applyOverrides, parseOverrides } from './overrides.ts';

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

function stats(times: readonly number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return `median ${median.toFixed(1)} ms, worst ${max.toFixed(1)} ms over ${times.length} runs`;
}

async function determinism(): Promise<void> {
  const seeds = flag('seeds', 1000);
  const ticks = flag('ticks', 240);
  const first = hashAirportSeeds(1, seeds, ticks);
  const second = hashAirportSeeds(1, seeds, ticks);
  const repeatMismatch = first.filter((hash, i) => hash !== second[i]).length;
  console.log(`node repeat run: ${seeds - repeatMismatch}/${seeds} airports identical`);
  let failed = repeatMismatch > 0;
  if (useBrowser) {
    const run = await runInBrowser({ firstSeed: 1, seeds, ticks, benchTicks: 0, benchRuns: 0 });
    const browserMismatch = first.filter((hash, i) => hash !== run.hashes[i]).length;
    console.log(`node vs browser: ${seeds - browserMismatch}/${seeds} airports identical (${run.userAgent})`);
    failed ||= browserMismatch > 0 || run.hashes.length !== seeds;
  }
  console.log(failed ? 'DETERMINISM: FAIL' : 'DETERMINISM: PASS');
  if (failed) process.exitCode = 1;
}

async function bench(): Promise<void> {
  const ticks = flag('ticks', 345_600);
  const runs = flag('runs', 5);
  console.log(`catch-up benchmark: ${ticks} ticks (${(ticks / 14_400).toFixed(1)} h) of a busy 8-gate airport`);
  benchAirportCatchUp(ticks, 1, () => performance.now()); // warm-up
  console.log(`node:     ${stats(benchAirportCatchUp(ticks, runs, () => performance.now()))}`);
  if (useBrowser && findChromium() !== undefined) {
    const run = await runInBrowser({ firstSeed: 1, seeds: 0, ticks: 0, benchTicks: ticks, benchRuns: runs });
    console.log(`chromium: ${stats(run.benchMs)} (first run includes JIT warm-up)`);
  }
  console.log('budget:   2000 ms on a mid-range phone for the 24-hour cap (P4); phones are several times slower than this machine');
}

async function pacing(): Promise<void> {
  const seed = flag('seed', 1);
  const minutes = flag('minutes', 90);
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = performance.now();
  const report = runPacing({ seed, minutes });
  const text = formatPacing(report, seed);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'pacing.md'), `${text}\n`);
  console.log(text);
  console.log(`wall time ${Math.round(performance.now() - start)} ms; wrote ${join(outDir, 'pacing.md')}`);
  if (!report.pass) process.exitCode = 1;
}

const commands: Record<HarnessCommand, () => Promise<void>> = { pacing, determinism, bench };
await commands[parsed.command]();
