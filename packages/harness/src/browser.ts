/**
 * Runs game.ts inside real headless Chromium and returns its hashes, so they
 * can be compared with Node's (S5: identical hashes in the browser and in Node).
 *
 * No new dependency: Vite (already used by apps/web) bundles browser-entry.ts
 * into one script, which is inlined into an HTML file and loaded with
 * `chromium --headless --dump-dom`. The page writes its result into the DOM.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface BrowserRun {
  readonly browser: string;
  readonly userAgent: string;
  readonly hashes: readonly string[];
  readonly benchMs: readonly number[];
}

export interface BrowserRunOptions {
  readonly firstSeed: number;
  readonly seeds: number;
  readonly ticks: number;
  readonly benchTicks: number;
  readonly benchRuns: number;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** CHROME_PATH, then the Playwright copy, then common names on PATH. */
export function findChromium(): string | undefined {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv !== undefined && fromEnv !== '' && existsSync(fromEnv)) return fromEnv;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (dir !== '' && existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

async function bundle(outDir: string): Promise<string> {
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: repoRoot,
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      write: true,
      lib: {
        entry: join(here, 'browser-entry.ts'),
        formats: ['iife'],
        name: 'airportHarness',
        fileName: () => 'harness.js',
      },
    },
  });
  return readFileSync(join(outDir, 'harness.js'), 'utf8');
}

function decodeHtml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

export async function runInBrowser(options: BrowserRunOptions, browser = findChromium()): Promise<BrowserRun> {
  if (browser === undefined) throw new Error('No Chromium or Chrome found; set CHROME_PATH');
  const work = mkdtempSync(join(tmpdir(), 'airport-harness-'));
  try {
    const script = await bundle(join(work, 'dist'));
    const html = [
      '<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre>',
      `<script>window.__HARNESS_CONFIG__ = ${JSON.stringify(options)};</script>`,
      `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`,
      '</body></html>',
    ].join('\n');
    const page = join(work, 'index.html');
    writeFileSync(page, html);
    const result = spawnSync(
      browser,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        `--user-data-dir=${join(work, 'profile')}`,
        '--dump-dom',
        pathToFileURL(page).href,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000 },
    );
    const match = /<pre id="out">([\s\S]*?)<\/pre>/.exec(result.stdout ?? '');
    if (match?.[1] === undefined) {
      throw new Error(`Chromium produced no result (exit ${result.status}): ${result.stderr?.slice(0, 2000)}`);
    }
    const parsed = JSON.parse(decodeHtml(match[1])) as
      | { ok: true; userAgent: string; hashes: string[]; benchMs: number[] }
      | { ok: false; error: string };
    if (!parsed.ok) throw new Error(`Harness failed in Chromium: ${parsed.error}`);
    return { browser, userAgent: parsed.userAgent, hashes: parsed.hashes, benchMs: parsed.benchMs };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
