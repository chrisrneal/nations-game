/**
 * The visual check (K9): four screens at 360 x 740, photographed and compared
 * with the pictures committed in `e2e/visual/`: the main board, the Kindy
 * board, the shop and the result over the board. Like the phone check it
 * needs a build and a Chromium (`npm run build`, then `npm run visual
 * --workspace web`), so it is not in CI; results go in docs/PROGRESS.md.
 *
 * Everything that could change between runs is fixed: the day (DAY, default
 * 20746), the time zone, reduced motion, and CSS animations and transitions
 * switched off. A screen passes when at most 1% of its pixels differ by more
 * than a little (font smoothing). `UPDATE=1` writes new pictures after an
 * intended change of the art; review them before committing.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import type { Puzzle } from '@snacks/contracts';
import { generatePuzzle } from '@snacks/sim';
import { FRIEND_NAME, stepOf } from '../src/ui/labels.ts';

const PORT = 4181;
const APP = `http://localhost:${PORT}/`;
const DAY = Number(process.env.DAY ?? 20746);
const UPDATE = process.env.UPDATE === '1';
const BASE = new URL('./visual/', import.meta.url).pathname;
const OUT = process.env.VISUAL_OUT ?? mkdtempSync(join(tmpdir(), 'snacks-visual-'));
/** Pixels that may differ before a screen fails. */
const MAX_DIFF = 0.01;

const QUIET = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`;

function chromiumPath(): string {
  const found = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

const results: { name: string; ok: boolean; detail: string }[] = [];

/** Fraction of pixels that differ, worked out in the page from two PNGs. A string, not a function: tsx would inject a helper the page does not have. */
async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const urls = JSON.stringify([`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
  return (await page.evaluate(`(async () => {
    const load = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, img.width, img.height);
    };
    const [p, q] = await Promise.all(${urls}.map(load));
    if (p.width !== q.width || p.height !== q.height) return 1;
    let off = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      const d = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2]));
      if (d > 48) off++;
    }
    return off / (p.width * p.height);
  })()`)) as number;
}

async function compare(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  const shot = await page.screenshot();
  writeFileSync(join(OUT, `${name}.png`), shot);
  const file = join(BASE, `${name}.png`);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(BASE, { recursive: true });
    writeFileSync(file, shot);
    results.push({ name, ok: true, detail: 'picture written' });
    console.log(`WROTE ${name}`);
    return;
  }
  const diff = await difference(page, shot, readFileSync(file));
  const ok = diff <= MAX_DIFF;
  results.push({ name, ok, detail: `${(diff * 100).toFixed(2)}% of pixels differ` });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${(diff * 100).toFixed(2)}% of pixels differ; new picture in ${OUT})`);
}

const cell = (page: Page, c: number): Locator => page.locator(`.board [data-cell="${c}"]`);

/** Sets up wave 1 of the day's stored solution by taps (as the phone check does), so Go feeds every kid. */
async function setUpWave1(page: Page, puzzle: Puzzle): Promise<void> {
  const { width, height } = puzzle.board;
  for (const f of puzzle.witness[0]!.friends) {
    await page.getByRole('button', { name: new RegExp(`^${FRIEND_NAME[f.type]}, \\d+ left`) }).tap();
    await cell(page, f.cell).tap();
    await cell(page, f.cell).locator('.friend').waitFor();
    if (f.type !== 'nurse') {
      const [dx, dy] = stepOf(f.type, f.facing);
      const x = (f.cell % width) + dx;
      const y = Math.floor(f.cell / width) + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) await cell(page, y * width + x).tap();
      else {
        const want = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
        for (let i = 0; i < 8; i++) {
          const style = (await cell(page, f.cell).locator('.friend-arrow').getAttribute('style')) ?? '';
          if (style.includes(`rotate(${want}deg)`)) break;
          await page.getByRole('button', { name: 'Turn right' }).tap();
          await page.waitForTimeout(80);
        }
      }
    }
    const done = page.getByRole('button', { name: 'Done' });
    if ((await done.count()) > 0) await done.tap();
  }
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'snacks-visual-profile-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.clock.setFixedTime(DAY * 86_400_000 + 43_200_000);
    await page.addInitScript(`addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(QUIET)}; document.head.appendChild(s); })`);
    await page.goto(APP);
    await page.locator('.board').waitFor();
    const cdp = await context.newCDPSession(page);

    // 1. The main board, as the day opens.
    await compare(page, 'main-board');

    // 2. The shop.
    await page.locator('.tray-shop').tap();
    await page.locator('.sheet').waitFor();
    await compare(page, 'shop');
    await page.locator('.sheet-close').tap();

    // 3. The result over the board after wave 1.
    const puzzle = generatePuzzle('main', 'daily', DAY, 0);
    await setUpWave1(page, puzzle);
    await page.locator('.btn-go').tap();
    await page.getByRole('region', { name: 'What happened' }).waitFor({ timeout: 15_000 });
    await compare(page, 'result');

    // 4. The Kindy board: a Kindy child added by a grown-up's press-and-hold.
    await page.locator('.bar-avatar').tap();
    await page.locator('.picker').waitFor();
    const hold = await page.locator('.hold-btn').boundingBox();
    if (hold === null) throw new Error('no Grown-ups button');
    const at = { x: hold.x + hold.width / 2, y: hold.y + hold.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(1300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const menu = page.getByRole('dialog', { name: 'Grown-ups' });
    await menu.getByRole('button', { name: /Add a child/ }).tap();
    const form = page.getByRole('dialog', { name: 'Add a child' });
    await form.getByRole('button', { name: 'Frog', exact: true }).tap();
    await form.getByRole('textbox').fill('Pip');
    await form.getByRole('button', { name: /^Kindy:/ }).tap();
    await form.getByRole('button', { name: 'Save' }).tap();
    await menu.locator('.sheet-close').tap();
    await page.getByRole('button', { name: 'Play as Pip' }).tap();
    await page.locator('.kindy-game .board').waitFor();
    await compare(page, 'kindy-board');
    await context.close();
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} screens match`);
  if (failed.length > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
