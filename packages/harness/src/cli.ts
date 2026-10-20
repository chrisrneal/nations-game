#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 *   npm run harness [-- report] [--from 20000]       generate and check main, bonus and Kindy days (RULES 10),
 *     [--days 1000] [--out DIR]                      with the K11 targets (tray giveaway, bonus ramp); writes report.md
 *   npm run harness -- determinism [--seeds 300]     scripted games hash the same twice in Node and in Chromium
 *     [--no-browser]
 *   npm run harness -- bench [--runs 20]             time generating a main day in Node and Chromium
 *     [--no-browser]
 *   An unknown command or flag is an error (exit 2), never silently ignored.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchGeneration, hashGames } from './games.ts';
import { formatReport, runReport, targets } from './report.ts';
import { findChromium, runInBrowser } from './browser.ts';
import { parseArgs, type HarnessCommand, type ParsedArgs } from './args.ts';

let parsed: ParsedArgs;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const flag = (name: string, fallback: number): number => parsed.numbers[name] ?? fallback;
const option = (name: string, fallback: string): string => parsed.strings[name] ?? fallback;
const useBrowser = !parsed.switches.includes('no-browser');
const now = (): number => performance.now();

function stats(times: readonly number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return `median ${median.toFixed(1)} ms, worst ${max.toFixed(1)} ms over ${times.length} days`;
}

async function determinism(): Promise<void> {
  const seeds = flag('seeds', 300);
  const first = hashGames(1, seeds);
  const second = hashGames(1, seeds);
  const repeatMismatch = first.filter((hash, i) => hash !== second[i]).length;
  console.log(`node repeat run: ${seeds - repeatMismatch}/${seeds} games identical`);
  let failed = repeatMismatch > 0;
  if (useBrowser) {
    const run = await runInBrowser({ firstSeed: 1, seeds, benchRuns: 0 });
    const browserMismatch = first.filter((hash, i) => hash !== run.hashes[i]).length;
    console.log(`node vs browser: ${seeds - browserMismatch}/${seeds} games identical (${run.userAgent})`);
    failed ||= browserMismatch > 0 || run.hashes.length !== seeds;
  }
  console.log(failed ? 'DETERMINISM: FAIL' : 'DETERMINISM: PASS');
  if (failed) process.exitCode = 1;
}

async function bench(): Promise<void> {
  const runs = flag('runs', 20);
  console.log(`generation benchmark: ${runs} main-mode days, generated and checked`);
  benchGeneration('main', 2, now); // warm-up
  console.log(`node:     ${stats(benchGeneration('main', runs, now))}`);
  if (useBrowser && findChromium() !== undefined) {
    const run = await runInBrowser({ firstSeed: 1, seeds: 0, benchRuns: runs });
    console.log(`chromium: ${stats(run.benchMs)} (the first includes JIT warm-up)`);
  }
  console.log('budget:   1000 ms on a phone with the CPU slowed 4x (RULES 10); the phone check measures that in the app');
}

async function report(): Promise<void> {
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = now();
  const reports = runReport(flag('from', 20_000), flag('days', 1000), now);
  const text = formatReport(reports);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.md'), `${text}\n`);
  console.log(text);
  console.log(`wall time ${Math.round(now() - start)} ms; wrote ${join(outDir, 'report.md')}`);
  if (reports.some((r) => r.failed.length > 0) || targets(reports).some((t) => !t.met)) process.exitCode = 1;
}

const commands: Record<HarnessCommand, () => Promise<void>> = { report, determinism, bench };
await commands[parsed.command]();
