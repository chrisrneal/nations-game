/**
 * The performance check (decision record K12): a budget phone is a mid-range
 * Android, so Chromium's CPU is slowed 4x (CDP `Emulation.setCPUThrottlingRate`).
 *
 * - time to interactive: from navigation start until the board is drawn and a
 *   tap on a tray friend is answered, cold (nothing cached) and warm (the
 *   service worker has the app), the median of 3 each;
 * - a whole 10-wave day played by taps from the solver's plan: for every wave's
 *   replay the frames a second (and the worst frame), and the memory after
 *   the wave (the JS heap after a forced garbage collection) so growth
 *   from wave to wave shows;
 * - budgets: every replay 50+ fps, the heap after wave 10 within 12 MB of
 *   after wave 2, a cold start inside 5 s and a warm one inside 3 s (at 4x).
 * `PERF_OUT=file.json` also writes the numbers (docs/PROGRESS.md quotes them).
 * Build first, then `npm run perf --workspace web`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { generatePuzzle } from '@snacks/sim';
import { HEIGHT, WIDTH, check, checkOnScreen, chromiumPath, measureFps, playWaveByTaps, results, serve, shot, trayButton } from './support.ts';

const PORT = 4181;
const URL = `http://localhost:${PORT}/`;
const DAY = Math.floor(Date.now() / 86_400_000);
const NOON = DAY * 86_400_000 + 43_200_000;
const THROTTLE = Number(process.env.THROTTLE ?? 4);
process.env.SLOW = String(THROTTLE);

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main(): Promise<void> {
  const { server } = await serve(PORT);
  const dirs: string[] = [];
  const launch = async (): Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>> => {
    const dir = mkdtempSync(join(tmpdir(), 'snacks-perf-'));
    dirs.push(dir);
    return chromium.launchPersistentContext(dir, { executablePath: chromiumPath(), viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'UTC', args: ['--enable-precise-memory-info'] });
  };
  const report: Record<string, unknown> = {};
  try {
    // ---- time to interactive ----
    const startUp = async (warmUp: boolean): Promise<number> => {
      const context = await launch();
      const page = context.pages()[0] ?? (await context.newPage());
      await page.clock.setFixedTime(NOON);
      const cdp = await context.newCDPSession(page);
      if (warmUp) {
        await page.goto(URL);
        await page.locator('.board').waitFor();
        await page.evaluate(`navigator.serviceWorker.ready.then(() => undefined)`);
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const t0 = Date.now();
      await page.goto(URL, { waitUntil: 'commit' });
      await page.locator('.board .sq').first().waitFor();
      // Interactive: a tap on a tray friend is answered (the friend is selected).
      const friend = page.locator('.tray-btn:not(.tray-shop)').first();
      await friend.tap();
      await page.locator('.tray-btn[aria-pressed="true"], .tray-btn.on, .tray-btn.selected').first().waitFor({ timeout: 5000 }).catch(() => undefined);
      const ms = Date.now() - t0;
      await context.close();
      return ms;
    };
    const cold = [await startUp(false), await startUp(false), await startUp(false)];
    const warm = [await startUp(true), await startUp(true), await startUp(true)];
    report.coldMs = cold;
    report.warmMs = warm;
    check('time to interactive, cold, CPU slowed 4x', median(cold) <= 5000, `${cold.join(', ')} ms, median ${median(cold)}`);
    check('time to interactive, warm (installed, cached), CPU slowed 4x', median(warm) <= 3000, `${warm.join(', ')} ms, median ${median(warm)}`);

    // ---- a whole day ----
    const context = await launch();
    const page = context.pages()[0] ?? (await context.newPage());
    await page.clock.setFixedTime(NOON);
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await page.goto(URL);
    await page.locator('.board').waitFor();
    const puzzle = generatePuzzle('main', 'daily', DAY, 0);
    // Setup is tapped at full speed (tapping a slow phone is the player's patience, not the game's frame rate); each replay runs with the CPU slowed.
    const heap = async (): Promise<number> => {
      await cdp.send('HeapProfiler.collectGarbage');
      const usage = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
      return usage.usedSize / 1_048_576;
    };
    const rows: { wave: number; fps: number; worst: number; heapMb: number; nodes: number; friends: number }[] = [];
    const base = await heap();
    for (const layout of puzzle.witness) {
      let sample: Promise<{ frames: number; worst: number }> | null = null;
      const fed = await playWaveByTaps(page, cdp, puzzle, layout, async () => {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
        sample = page.waitForTimeout(150).then(() => measureFps(page, 1800));
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      if (sample === null) {
        check(`wave ${layout.wave} is set up by taps`, false, `setup did not finish; ${await page.locator('.board .friend').count()} of ${layout.friends.length} friends on the board`);
        await shot(page, 'zz-perf-setup');
        break;
      }
      const fps = await (sample as Promise<{ frames: number; worst: number }>);
      const nodes = (await page.evaluate('document.getElementsByTagName("*").length')) as number;
      const heapMb = await heap();
      rows.push({ wave: layout.wave, fps: fps.frames, worst: fps.worst, heapMb, nodes, friends: layout.friends.length });
      check(`wave ${layout.wave} is fed`, fed);
      if (layout.wave === 1) await checkOnScreen('the result card is inside the viewport', page.locator('.result-card'));
      if (layout.wave < puzzle.waves) await page.getByRole('button', { name: new RegExp(`Set up wave ${layout.wave + 1}`) }).tap();
    }
    report.base = base;
    report.waves = rows;
    console.log('\nwave  fps   worst ms  friends  heap MB  DOM nodes');
    for (const r of rows) console.log(`${String(r.wave).padStart(4)}  ${r.fps.toFixed(1).padStart(5)}  ${r.worst.toFixed(0).padStart(8)}  ${String(r.friends).padStart(7)}  ${r.heapMb.toFixed(1).padStart(7)}  ${String(r.nodes).padStart(9)}`);
    console.log(`heap at start: ${base.toFixed(1)} MB\n`);
    const lowest = Math.min(...rows.map((r) => r.fps));
    check('every wave replays at 50+ fps with the CPU slowed 4x', lowest >= 50, `lowest ${lowest.toFixed(1)} fps over ${rows.length} waves`);
    const grew = rows[rows.length - 1]!.heapMb - rows[1]!.heapMb;
    check('memory over the 10 waves stays flat (heap after wave 10 within 12 MB of after wave 2)', grew <= 12, `${rows[1]!.heapMb.toFixed(1)} -> ${rows[rows.length - 1]!.heapMb.toFixed(1)} MB`);
    const nodesGrew = rows[rows.length - 1]!.nodes - rows[1]!.nodes;
    check('no pile-up of page elements across the day (flying snacks and sparkles are cleaned up)', nodesGrew <= 150, `${nodesGrew} more elements`);
    void trayButton;
    await context.close();
  } finally {
    server.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  if (process.env.PERF_OUT !== undefined) writeFileSync(process.env.PERF_OUT, JSON.stringify(report, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} performance checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
