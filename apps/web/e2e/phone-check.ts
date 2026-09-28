/**
 * Phone check for prompt 04's "done when" list, in headless Chromium sized as a
 * 360 px phone with touch. Builds nothing: run `npm run build` first, then
 * `npm run e2e --workspace web`. Not in CI (needs a Chromium binary); results
 * are recorded in docs/PROGRESS.md.
 *
 * Checks: installable manifest and service worker; opens with the network off;
 * no horizontal scroll at 360 px; three sample decisions by touch with options
 * in the bottom third; why-sheet on a number; save, close, reopen offline, load
 * continues the tick count; frame rate at 4x with the CPU slowed 4x.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const WIDTH = 360;
const HEIGHT = 740;

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function noHorizontalScroll(page: Page, where: string): Promise<void> {
  const width = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  check(`no horizontal scroll: ${where}`, width <= WIDTH, `scrollWidth ${width}`);
}

async function tick(page: Page): Promise<number> {
  return Number(await page.getByTestId('tick').textContent());
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'nations-phone-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    let page = context.pages()[0] ?? (await context.newPage());
    await page.goto(URL);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    const cdp = await context.newCDPSession(page);
    const installErrors = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
    check('installable (manifest + service worker)', installErrors.installabilityErrors.length === 0, JSON.stringify(installErrors.installabilityErrors));

    await noHorizontalScroll(page, 'start screen');
    await page.getByRole('button', { name: 'New game' }).tap();
    await noHorizontalScroll(page, 'nation picker');
    await page.getByRole('button', { name: /^Japan/ }).tap();
    await page.getByRole('heading', { name: /Decisions/ }).waitFor();
    await noHorizontalScroll(page, 'decision inbox');

    // Three sample decisions, one-handed: tap card, tap option, both by touch.
    for (let i = 0; i < 3; i++) {
      await page.locator('.card').first().tap();
      const option = page.locator('.sheet .option').first();
      await option.waitFor();
      await noHorizontalScroll(page, `decision ${i + 1} sheet`);
      const box = await option.boundingBox();
      const centre = box === null ? -1 : box.y + box.height / 2;
      check(`decision ${i + 1}: options in the bottom third`, centre >= (HEIGHT * 2) / 3, `first option centre at ${Math.round(centre)} of ${HEIGHT}`);
      await option.tap();
      await page.locator('.toast').waitFor();
      await page.locator('.sheet').waitFor({ state: 'detached' });
    }
    check('three decisions answered', (await page.locator('.card').count()) === 0);
    await page.getByRole('radio', { name: 'Normal speed' }).tap();
    await page.getByText(/received your answer/).first().waitFor({ timeout: 5000 });
    check('answers reached the sim and came back as events', true);

    await page.locator('.chip').first().tap();
    check('why-sheet opens on a number', await page.getByRole('dialog', { name: /Why: Food/ }).isVisible());
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();

    await page.getByRole('button', { name: /World/ }).tap();
    await noHorizontalScroll(page, 'world map');
    check('map shows nations and trust lines', (await page.locator('.map .dot').count()) === 17 && (await page.locator('.map .tie').count()) > 0);

    // 60 fps at 4x, with the CPU slowed to roughly a mid-range phone.
    await page.getByRole('button', { name: /Decisions/ }).tap();
    await page.getByRole('radio', { name: 'Fast' }).tap();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const before = await tick(page);
    // A string, not a function: tsx would inject a helper the page does not have.
    const fps = (await page.evaluate(`new Promise((resolve) => {
      let frames = 0, worst = 0, last = performance.now();
      const start = last;
      const frame = (now) => {
        frames++;
        worst = Math.max(worst, now - last);
        last = now;
        if (now - start < 3000) requestAnimationFrame(frame);
        else resolve({ frames: frames / ((now - start) / 1000), worst });
      };
      requestAnimationFrame(frame);
    })`)) as { frames: number; worst: number };
    const after = await tick(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('4x runs about four ticks a second', after - before >= 10, `${after - before} ticks in 3 s`);
    check('60 fps at 4x (CPU slowed 4x)', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);

    // Save, close, reopen in airplane mode, load, continue.
    await page.getByRole('radio', { name: 'Pause' }).tap();
    await page.getByRole('button', { name: /Saves/ }).tap();
    await noHorizontalScroll(page, 'saves');
    await page.getByTestId('slot-slot-1').getByRole('button', { name: 'Save' }).tap();
    await page.getByText('Saved to Slot 1').waitFor();
    const savedTick = await tick(page);
    await page.close();

    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(URL);
    await page.getByRole('heading', { name: 'Nations' }).waitFor({ timeout: 5000 });
    check('opens with the network off', true);
    await page.getByRole('button', { name: 'Load a save' }).tap();
    await page.getByTestId('slot-slot-1').getByRole('button', { name: 'Load' }).tap();
    await page.getByTestId('tick').waitFor();
    check('load restores the tick count', (await tick(page)) === savedTick, `saved ${savedTick}, loaded ${await tick(page)}`);
    await page.getByRole('radio', { name: 'Normal speed' }).tap();
    await page.waitForTimeout(2200);
    const continued = await tick(page);
    check('tick count continues after load', continued > savedTick, `${savedTick} -> ${continued}`);

    await context.close();
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
