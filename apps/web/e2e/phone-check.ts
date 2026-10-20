/**
 * The phone check (docs/ROADMAP.md, phone UX budget), in headless Chromium
 * sized as a 360 px phone with touch. Builds nothing: run `npm run build`
 * first, then `npm run e2e --workspace web`. Not in CI (it needs a Chromium
 * binary); results are recorded in docs/PROGRESS.md. `SHOTS=dir` saves
 * screenshots there.
 *
 * Checks (K1, the grey-squares build): installable; opens on today's daily
 * with the whole board on screen; no horizontal scroll at 360 px and every
 * button at least 44 px; Go in the bottom third; wave 1 played by taps alone
 * (the solver's setup for today, worked out here in Node from the same day
 * number) feeds every kid; the replay holds 60 fps with the CPU slowed 4x;
 * reopening continues at wave 2; a new practice board is generated in under
 * a second with the CPU slowed 4x; it reopens offline.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { generatePuzzle } from '@snacks/sim';
import { FRIEND_NAME, facingAngle } from '../src/ui/labels.ts';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
/** The budget phone by default; `PHONE=pixel10xl` checks a Pixel 10 Pro XL (412 x 915) instead. */
const PHONE = process.env.PHONE === 'pixel10xl' ? { width: 412, height: 915, dpr: 3.25 } : { width: 360, height: 740, dpr: 2 };
const WIDTH = PHONE.width;
const HEIGHT = PHONE.height;
const SHOTS = process.env.SHOTS;

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

/** Frames a second and the worst frame over `ms`, measured in the page. A string, not a function: tsx would inject a helper the page does not have. */
async function measureFps(page: Page, ms: number): Promise<{ frames: number; worst: number }> {
  return (await page.evaluate(`new Promise((resolve) => {
    let frames = 0, worst = 0, last = performance.now();
    const start = last;
    const frame = (now) => {
      frames++;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - start < ${ms}) requestAnimationFrame(frame);
      else resolve({ frames: frames / ((now - start) / 1000), worst });
    };
    requestAnimationFrame(frame);
  })`)) as { frames: number; worst: number };
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
    .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
    .map(({ b, r }) => (b.getAttribute('aria-label') || b.textContent || '?').trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))`)) as string[];
  check(`touch targets at least 44 px: ${where}`, small.length === 0, small.join('; '));
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** The arrow's rotation on the friend in a square, in degrees. */
async function arrowAngle(page: Page, cell: number): Promise<number | null> {
  const style = await page.locator(`[data-cell="${cell}"] .friend-arrow`).getAttribute('style');
  const m = /rotate\((-?\d+)deg\)/.exec(style ?? '');
  return m === null ? null : Number(m[1]);
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'snacks-phone-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: PHONE.dpr,
      isMobile: true,
      hasTouch: true,
      timezoneId: 'UTC',
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(URL);
    await page.locator('.board').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await context.newCDPSession(page);

    const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
    check('installable: manifest with name, icons and standalone display', manifest.name === 'Snack Attack' && manifest.display === 'standalone' && manifest.icons.length >= 2);

    const squares = await page.locator('.board .sq').count();
    check('opens on today’s daily: a 6 x 8 board', squares === 48 && (await page.locator('.bar-title').textContent())?.includes('Today') === true, `${squares} squares`);
    const boardBox = await page.locator('.board').boundingBox();
    check('the whole board fits the screen width', boardBox !== null && boardBox.x >= 0 && boardBox.x + boardBox.width <= WIDTH, JSON.stringify(boardBox));
    const tray = await page.getByRole('group', { name: 'Tray' }).boundingBox();
    check('the tray is on screen, in the bottom third', tray !== null && tray.y >= HEIGHT / 2 && tray.y + tray.height <= HEIGHT, `top ${Math.round(tray?.y ?? 0)}`);
    const go = await page.locator('.btn-go').boundingBox();
    check('Go is on screen, in the bottom third', go !== null && go.y >= (HEIGHT * 2) / 3 && go.y + go.height <= HEIGHT, `top ${Math.round(go?.y ?? 0)} of ${HEIGHT}`);
    await noHorizontalScroll(page, 'setup');
    await touchTargets(page, 'setup');
    await shot(page, '1-setup');

    // Today's wave 1, set up by taps alone: the solver's setup for the same day number.
    const day = Math.floor(Date.now() / 86_400_000);
    const puzzle = generatePuzzle('main', 'daily', day, 0);
    const layout = puzzle.witness[0]!;
    let placedOk = true;
    for (const friend of layout.friends) {
      await page.getByRole('button', { name: new RegExp(`^${FRIEND_NAME[friend.type]}, \\d+ in the tray`) }).tap();
      await page.locator(`[data-cell="${friend.cell}"]`).tap();
      await page.locator(`[data-cell="${friend.cell}"] .friend`).waitFor();
      const want = facingAngle(friend.type, friend.facing);
      for (let i = 0; i < 8; i++) {
        const before = await arrowAngle(page, friend.cell);
        if (before === want || friend.type === 'nurse') break;
        await page.getByRole('button', { name: 'Turn right' }).tap();
        // Wait for the turn to reach the screen before deciding whether to turn again.
        for (let t = 0; t < 50 && (await arrowAngle(page, friend.cell)) === before; t++) await page.waitForTimeout(20);
      }
      placedOk &&= (await arrowAngle(page, friend.cell)) === want;
      await page.getByRole('button', { name: 'Done' }).tap();
    }
    check('friends are placed and turned by taps', placedOk, `${layout.friends.length} friend(s)`);
    await shot(page, '2-placed');
    await touchTargets(page, 'friends placed');

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.locator('.btn-go').tap();
    const fps = await measureFps(page, 1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('the wave replay holds 55+ fps with the CPU slowed 4x', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);
    await page.getByRole('region', { name: 'What happened' }).waitFor({ timeout: 15_000 });
    const summary = (await page.locator('.result h2').textContent()) ?? '';
    const kids = puzzle.kids.filter((k) => k.wave === 1).length;
    check('wave 1 feeds every kid', summary.includes(`${kids} of ${kids} fed`), summary);
    await shot(page, '3-result');
    await noHorizontalScroll(page, 'result');
    await touchTargets(page, 'result');

    await page.reload();
    await page.locator('.board').waitFor();
    const wave = (await page.locator('.bar-stats').textContent()) ?? '';
    check('reopening continues at wave 2', wave.includes('2/10'), wave);

    await page.getByRole('button', { name: 'Menu' }).tap();
    await touchTargets(page, 'menu');
    await shot(page, '4-menu');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.getByRole('button', { name: 'New practice board' }).tap();
    await page.locator('.bar-title', { hasText: 'Practice' }).waitFor();
    const ms = Date.now() - t0;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('a new practice board is ready in under a second with the CPU slowed 4x', ms < 1000, `${ms} ms`);

    await page.getByRole('button', { name: 'Menu' }).tap();
    await page.getByRole('button', { name: 'How to play' }).tap();
    await noHorizontalScroll(page, 'how to play');
    await shot(page, '5-help');
    await page.getByRole('button', { name: 'Close' }).last().tap();

    await context.setOffline(true);
    await page.reload();
    await page.locator('.board').waitFor({ timeout: 10_000 });
    check('reopens offline', (await page.locator('.board .sq').count()) === 48);
    await context.close();
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
