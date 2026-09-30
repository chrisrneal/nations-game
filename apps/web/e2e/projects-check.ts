/**
 * Phone check for joint projects (100x slice 5, RULES 13), in headless
 * Chromium sized as a 360 px touch phone. Run `npm run build` first, then
 * `npm run e2e:projects --workspace web`. Not in CI (needs a Chromium binary).
 *
 * Checks: four tabs fit at 360 px; a project invitation arrives as a card and
 * resolves in 2 taps (open, join) with both options visible without scrolling;
 * the Projects screen and the host sheet have no horizontal scroll; hosting
 * from the Projects screen sends an invitation (2 taps: Host…, Invite); the end
 * screen leads with the verdict and saves a playtest file after three questions.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4181;
const WIDTH = 360;
const HEIGHT = 740;
const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const chrome = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((c) => c !== undefined && existsSync(c));
if (chrome === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: chrome });
try {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const noScroll = async (where: string): Promise<void> => {
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    check(`no horizontal scroll: ${where}`, w <= WIDTH, `scrollWidth ${w}`);
  };
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByText('New game').click();
  await page.getByText('Japan', { exact: true }).first().click();
  await page.waitForTimeout(400);
  const tabs = await page.locator('.tab').count();
  const tabBoxes = await page.locator('.tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  check('four tabs fit at 360 px', tabs === 4 && Math.max(...tabBoxes) <= WIDTH, `${tabs} tabs, right edge ${Math.max(...tabBoxes)}`);

  let invited = false;
  for (let m = 0; m < 14 && !invited; m++) {
    if ((await page.locator('.card-project').count()) > 0) {
      invited = true;
      break;
    }
    await page.locator('button:has-text("⏭")').click();
    await page.waitForTimeout(250);
  }
  check('a project invitation arrives as a card within 14 months', invited);
  if (invited) {
    await page.locator('.card-project').first().click(); // tap 1
    await page.waitForTimeout(200);
    const boxes = await page.locator('.sheet .option').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    check('invitation: join and decline both visible without scrolling', boxes.length === 2 && Math.max(...boxes) <= HEIGHT, `bottoms ${boxes.join(', ')}`);
    await noScroll('invitation sheet');
    await page.locator('.sheet .option[data-option="join"]').click(); // tap 2
    await page.waitForTimeout(200);
    const toast = (await page.locator('.toast').textContent()) ?? '';
    check('invitation resolves in 2 taps (open, join)', /^Joined /.test(toast), toast);
  }

  await page.locator('.tab:has-text("Projects")').click();
  await page.waitForTimeout(300);
  await noScroll('Projects screen');
  const hostButtons = page.locator('button:has-text("Host…")');
  if ((await hostButtons.count()) > 0) {
    await hostButtons.first().click();
    await page.waitForTimeout(200);
    await noScroll('host sheet');
    const invite = page.locator('.sheet .btn-primary');
    const enabled = await invite.isEnabled();
    check('host sheet pre-picks partners', enabled, (await invite.textContent()) ?? '');
    if (enabled) {
      await invite.click();
      await page.waitForTimeout(200);
      check('hosting sends invitations', /^Invited /.test((await page.locator('.toast').textContent()) ?? ''));
    }
  } else check('Japan can host a shield from the Projects screen', false, 'no Host… button');
  // Playtest kit (Gate 2 line 7): at month 60, three questions in taps, then the playtest file.
  await page.locator('.tab:has-text("Decisions")').click();
  for (let m = 0; m < 70 && (await page.locator('[data-testid=game-over]').count()) === 0; m++) {
    await page.locator('button:has-text("⏭")').click();
    await page.waitForTimeout(80);
  }
  check('the game reaches its end screen', (await page.locator('[data-testid=game-over]').count()) === 1);
  check('the end screen leads with the World Accord verdict', /world/i.test((await page.locator('[data-testid=outcome]').textContent()) ?? ''));
  await page.getByRole('radio', { name: 'Someone else' }).click();
  await page.getByRole('radio', { name: 'Yes' }).click();
  await page.locator('#interesting').fill('Walking out of a grid link');
  await noScroll('end screen with the playtest questions');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=save-playtest]').click()]);
  check('the playtest file is named playtest-<date>-<nation>.json', /^playtest-\d{4}-\d{2}-\d{2}-japan\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('no page errors', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
