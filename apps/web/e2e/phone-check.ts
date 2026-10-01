/**
 * The phone check (docs/ROADMAP.md, phone UX budget), in headless Chromium
 * sized as a 360 px phone with touch. Builds nothing: run `npm run build`
 * first, then `npm run e2e --workspace web`. Not in CI (it needs a Chromium
 * binary); results are recorded in docs/PROGRESS.md.
 *
 * Checks: installable; a new airport opens; no horizontal scroll at 360 px on
 * every screen and sheet; every button at least 44 px; the Upgrades button in
 * the bottom third; the first upgrade bought within 10 s; a tap rushes a gate;
 * 60 fps with eight gates animating and the CPU slowed 4x; export a file,
 * clear site data, import it and the same airport resumes; reopens offline.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { busyAirport } from '../../../packages/harness/src/airport.ts';
import { AirportSession, hashState } from '@nations/sim/airport';

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

/** Every visible button is at least 44 x 44 px. */
async function touchTargets(page: Page, where: string): Promise<void> {
  const small = (await page.evaluate(`[...document.querySelectorAll('button')]
    .map((b) => ({ b, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .filter(({ r }) => r.width < 44 || r.height < 44)
    .map(({ b, r }) => (b.getAttribute('aria-label') || b.textContent || '?').trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))`)) as string[];
  check(`touch targets at least 44 px: ${where}`, small.length === 0, small.join('; '));
}

async function cashCents(page: Page): Promise<number> {
  const text = (await page.getByTestId('cash').textContent()) ?? '';
  const m = /\$([\d.]+)([KMBT]?)/.exec(text);
  if (m === null) return NaN;
  const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2] as '' | 'K' | 'M' | 'B' | 'T'];
  return Math.round(Number(m[1]) * mult * 100);
}

/** A file holding an 8-gate airport, made with the sim itself, anchored at `now`. */
function busyFile(dir: string): { path: string; hash: string } {
  const state = busyAirport();
  const session = new AirportSession(state);
  const game = { save: session.save({ compact: true }), anchor: Date.now() };
  const path = join(dir, 'busy.json');
  writeFileSync(path, JSON.stringify({ format: 'airport-idle-save', version: 1, exportedAt: Date.now(), game }));
  return { path, hash: hashState(state) };
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'airport-phone-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const opened = Date.now();
    await page.goto(URL);
    await page.getByTestId('gate-0').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await context.newCDPSession(page);
    const installErrors = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
    check('installable (manifest + service worker)', installErrors.installabilityErrors.length === 0, JSON.stringify(installErrors.installabilityErrors));

    check('a new airport opens with one gate', (await page.locator('.gate:not(.gate-next)').count()) === 1);
    check('the next gate shows as something to aim for', (await page.getByTestId('next-gate').count()) === 1);
    check('cash shows at the top', /\$/.test((await page.getByTestId('cash').textContent()) ?? ''));
    await noHorizontalScroll(page, 'airport');
    await touchTargets(page, 'airport');
    const upgradesBox = await page.getByTestId('open-upgrades').boundingBox();
    const centre = upgradesBox === null ? -1 : upgradesBox.y + upgradesBox.height / 2;
    check('Upgrades button in the bottom third', centre >= (HEIGHT * 2) / 3, `centre at ${Math.round(centre)} of ${HEIGHT}`);

    // The first upgrade within 10 s of opening.
    await page.getByTestId('open-upgrades').tap();
    await page.getByTestId('upgrades').waitFor();
    await noHorizontalScroll(page, 'upgrade sheet');
    await touchTargets(page, 'upgrade sheet');
    const buy = page.getByTestId('buy-boarding');
    await page.waitForFunction(() => !(document.querySelector('[data-testid="buy-boarding"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 });
    await buy.tap();
    await page.getByTestId('upgrade-boarding').getByText('Lv 1').waitFor({ timeout: 2000 });
    const firstUpgradeSec = (Date.now() - opened) / 1000;
    check('first upgrade bought within 10 s', firstUpgradeSec <= 10, `${firstUpgradeSec.toFixed(1)} s from opening`);
    const sheetBox = await buy.boundingBox();
    check('buy buttons sit in the bottom sheet', sheetBox !== null && sheetBox.y > HEIGHT / 3, `y ${Math.round(sheetBox?.y ?? -1)}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();

    // A tap rushes the gate.
    await page.getByTestId('gate-0').tap();
    await page.waitForTimeout(350);
    check('a tap rushes the gate', (await page.getByTestId('gate-0').getAttribute('class'))?.includes('rushing') === true);
    const cashBefore = await cashCents(page);
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('gate-0').tap();
      await page.waitForTimeout(250);
    }
    check('flights pay as the planes leave', (await cashCents(page)) > cashBefore, `${cashBefore} -> ${await cashCents(page)} cents`);

    // Settings: export, clear site data, import a busy airport file.
    await page.getByTestId('settings').tap();
    await page.getByTestId('stats').waitFor();
    await noHorizontalScroll(page, 'settings sheet');
    await touchTargets(page, 'settings sheet');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    check('export downloads a save file', /^airport-tick-\d+\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();

    await cdp.send('Storage.clearDataForOrigin', { origin: new globalThis.URL(URL).origin, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
    await page.reload();
    await page.getByTestId('gate-0').waitFor();
    check('site data cleared: a fresh airport opens', (await page.locator('.gate:not(.gate-next)').count()) === 1);
    const busy = busyFile(profile);
    await page.getByTestId('settings').tap();
    await page.getByTestId('import-file').setInputFiles(busy.path);
    await page.getByTestId('gate-7').waitFor({ timeout: 5000 });
    check('import resumes the exported airport (8 gates)', (await page.locator('.gate:not(.gate-next)').count()) === 8);
    await noHorizontalScroll(page, 'eight gates');
    await touchTargets(page, 'eight gates');

    // 60 fps with eight gates animating and the CPU slowed 4x.
    await page.waitForTimeout(500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // A string, not a function: tsx would inject a helper the page does not have.
    const fps = (await page.evaluate(`new Promise((resolve) => {
      let frames = 0, worst = 0, last = performance.now();
      const start = last;
      const frame = (now) => {
        frames++;
        worst = Math.max(worst, now - last);
        last = now;
        if (now - start < 5000) requestAnimationFrame(frame);
        else resolve({ frames: frames / ((now - start) / 1000), worst });
      };
      requestAnimationFrame(frame);
    })`)) as { frames: number; worst: number };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps with eight gates (CPU slowed 4x)', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);

    // Offline: the installed app reopens and continues from the autosave.
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('gate-7').waitFor({ timeout: 8000 });
    check('reopens offline and continues the airport', (await page.locator('.gate:not(.gate-next)').count()) === 8);
    await context.setOffline(false);

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
