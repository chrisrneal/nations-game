/**
 * WMS slice 9 performance check (docs/wms-plan.md): a warehouse with 300 open
 * orders and 2,000 lines is imported on the 360 x 740 phone, the WMS grid is
 * opened, and with the CPU slowed 4x the grid is scrolled down and sideways
 * for 5 s while the WMS keeps updating once a second. Reports fps and the
 * worst frame (budget: 55 fps, as the phone check), the rows in the DOM and
 * the time to open the screen. Run `npm run build` first, then
 * `npx tsx e2e/wms-perf.ts` from apps/web (PROFILE=out.cpuprofile also saves a
 * CPU profile of the scroll). Not in CI (needs Chromium).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { wmsUnderLoad } from '../../../packages/harness/src/wms-load.ts';
import { WarehouseSession } from '@warehouse/sim';

const PORT = 4185;
const URL = `http://localhost:${PORT}/`;

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'warehouse-wms-perf-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(URL);
    await page.getByTestId('dock-0').waitFor();
    const session = new WarehouseSession(wmsUnderLoad());
    const path = join(profile, 'load.json');
    writeFileSync(path, JSON.stringify({ format: 'warehouse-idle-save', version: 1, exportedAt: Date.now(), game: { save: session.save({ compact: true }), anchor: Date.now() } }));
    await page.getByTestId('settings').tap();
    await page.getByTestId('import-file').setInputFiles(path);
    await page.getByTestId('dock-7').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(3000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // The same warehouse's floor, for comparison: what this machine manages before the WMS opens.
    const floor = (await page.evaluate(`new Promise((resolve) => {
      let frames = 0, last = performance.now();
      const start = last;
      const frame = (now) => {
        frames++;
        last = now;
        if (now - start < 3000) requestAnimationFrame(frame);
        else resolve(frames / ((now - start) / 1000));
      };
      requestAnimationFrame(frame);
    })`)) as number;
    console.log(`the floor of the same warehouse, CPU slowed 4x: ${floor.toFixed(1)} fps`);
    const opened = Date.now();
    await page.getByTestId('open-wms').tap();
    await page.locator('[data-testid="wms-grid"] tbody tr').first().waitFor();
    const openMs = Date.now() - opened;
    const rows = await page.locator('[data-testid="wms-grid"] tbody tr').count();
    await page.waitForTimeout(1500);
    if (process.env.PROFILE !== undefined) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    // A string, not a function: tsx would inject a helper the page does not have.
    const fps = (await page.evaluate(`new Promise((resolve) => {
      const grid = document.querySelector('[data-testid="wms-grid"]');
      let frames = 0, worst = 0, last = performance.now();
      const start = last;
      const frame = (now) => {
        frames++;
        worst = Math.max(worst, now - last);
        last = now;
        const t = (now - start) / 5000;
        grid.scrollTop = (grid.scrollHeight - grid.clientHeight) * (t < 0.5 ? t * 2 : 2 - t * 2);
        grid.scrollLeft = (grid.scrollWidth - grid.clientWidth) * Math.abs(Math.sin(t * 6));
        if (now - start < 5000) requestAnimationFrame(frame);
        else resolve({ frames: frames / ((now - start) / 1000), worst });
      };
      requestAnimationFrame(frame);
    })`)) as { frames: number; worst: number };
    if (process.env.PROFILE !== undefined) {
      const { profile: cpu } = await cdp.send('Profiler.stop');
      writeFileSync(process.env.PROFILE, JSON.stringify(cpu));
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`rows in the grid: ${rows}; WMS opened in ${openMs} ms (CPU slowed 4x)`);
    console.log(`scrolling 300 orders / 2,000 lines, CPU slowed 4x: ${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);
    console.log(`page scrolls sideways: ${sideways}`);
    const failed = fps.frames < 55 || sideways;
    console.log(failed ? 'FAIL' : 'PASS');
    process.exitCode = failed ? 1 : 0;
    await context.close();
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
