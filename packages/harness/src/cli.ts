#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 *   npm run harness [-- report] [--seed 1]           the WMS report (RULES 11): an untouched warehouse on
 *     [--seeds 8] [--minutes 120] [--out DIR]        several seeds; writes report.md
 *   npm run harness -- determinism [--seeds 1000]    same warehouse hashes twice in Node and in Chromium
 *     [--ticks 240] [--no-browser]
 *   npm run harness -- bench [--ticks 115200]        time warehouse catch-up (default 8 h, the offline cap) in Node and Chromium
 *     [--runs 5] [--no-browser]
 *   `--set id=value[,id=value]` (report) replaces warehouse tunables for that run, inside their bands
 *   (overrides.ts). An unknown command or flag is an error (exit 2), never silently ignored.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { benchWarehouseCatchUp, hashWarehouseSeeds } from './warehouse.ts';
import { formatReport, runReport } from './report.ts';
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
  const first = hashWarehouseSeeds(1, seeds, ticks);
  const second = hashWarehouseSeeds(1, seeds, ticks);
  const repeatMismatch = first.filter((hash, i) => hash !== second[i]).length;
  console.log(`node repeat run: ${seeds - repeatMismatch}/${seeds} warehouses identical`);
  let failed = repeatMismatch > 0;
  if (useBrowser) {
    const run = await runInBrowser({ firstSeed: 1, seeds, ticks, benchTicks: 0, benchRuns: 0 });
    const browserMismatch = first.filter((hash, i) => hash !== run.hashes[i]).length;
    console.log(`node vs browser: ${seeds - browserMismatch}/${seeds} warehouses identical (${run.userAgent})`);
    failed ||= browserMismatch > 0 || run.hashes.length !== seeds;
  }
  console.log(failed ? 'DETERMINISM: FAIL' : 'DETERMINISM: PASS');
  if (failed) process.exitCode = 1;
}

async function bench(): Promise<void> {
  const ticks = flag('ticks', 115_200);
  const runs = flag('runs', 5);
  console.log(`catch-up benchmark: ${ticks} ticks (${(ticks / 14_400).toFixed(1)} h) of a busy warehouse (16 workers, 4 doors)`);
  benchWarehouseCatchUp(ticks, 1, () => performance.now()); // warm-up
  console.log(`node:     ${stats(benchWarehouseCatchUp(ticks, runs, () => performance.now()))}`);
  if (useBrowser && findChromium() !== undefined) {
    const run = await runInBrowser({ firstSeed: 1, seeds: 0, ticks: 0, benchTicks: ticks, benchRuns: runs });
    console.log(`chromium: ${stats(run.benchMs)} (first run includes JIT warm-up)`);
  }
  console.log('budget:   2000 ms on a mid-range phone for the 8-hour cap (P4); phones are several times slower than this machine');
}

async function report(): Promise<void> {
  const outDir = resolve(option('out', join(fileURLToPath(new URL('..', import.meta.url)), 'out')));
  const start = performance.now();
  const result = runReport({ firstSeed: flag('seed', 1), seeds: flag('seeds', 8), minutes: flag('minutes', 120) });
  const text = formatReport(result);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.md'), `${text}\n`);
  console.log(text);
  console.log(`wall time ${Math.round(performance.now() - start)} ms; wrote ${join(outDir, 'report.md')}`);
  if (!result.pass) process.exitCode = 1;
}

const commands: Record<HarnessCommand, () => Promise<void>> = { report, determinism, bench };
await commands[parsed.command]();
