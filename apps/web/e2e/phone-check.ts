/**
 * Phone check for the "done when" lists of prompts 04 and 07, in headless Chromium sized as a
 * 360 px phone with touch. Builds nothing: run `npm run build` first, then
 * `npm run e2e --workspace web`. Not in CI (needs a Chromium binary); results
 * are recorded in docs/PROGRESS.md.
 *
 * Checks (prompt 07): installable; no horizontal scroll at 360 px on every
 * screen and sheet; a trade offer in 3 taps or fewer from home; AI offers
 * arrive as cards and accepting one settles it; a counter-offer; a why-sheet on
 * every resource; the map and a proposed trade; 60 fps at 4x with the CPU
 * slowed 4x; policies reach the sim; export a file, clear site data, import it
 * and the same game (fingerprint) resumes; reopens offline; a full game plays
 * to the end screen. Prompt 12: an accepted offer passes only when it settles
 * ("Trade done" and the received stock changes), and the end screen's winner
 * must match the sim's own scoreboard for the exported final game.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { loadSave, scoreboard } from '@nations/sim';

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

/** A resource chip's number (store, or resilience out of 100), without the icon or separators. */
async function chip(page: Page, key: string): Promise<number> {
  const text = (await page.getByTestId(`chip-${key}`).textContent()) ?? '';
  return Number(/[\d,]+/.exec(text)?.[0]?.replace(/,/g, '') ?? NaN);
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
    await page.getByRole('button', { name: /^India/ }).tap();
    await page.getByRole('heading', { name: /Decisions/ }).waitFor();
    await noHorizontalScroll(page, 'decision inbox');
    check('resource strip shows live stocks', /\d/.test((await page.getByTestId('chip-food').textContent()) ?? ''));

    // A trade in three taps or fewer, from home: tap the card, tap the offer.
    let taps = 0;
    await page.locator('.card-shortfall, .card-opportunity').first().tap();
    taps++;
    const first = page.locator('.sheet .option').first();
    await first.waitFor();
    await noHorizontalScroll(page, 'decision sheet');
    const box = await first.boundingBox();
    const centre = box === null ? -1 : box.y + box.height / 2;
    check('options sit in the bottom third', centre >= (HEIGHT * 2) / 3, `first option centre at ${Math.round(centre)} of ${HEIGHT}`);
    await first.tap();
    taps++;
    await page.getByText(/Offer sent to/).first().waitFor({ timeout: 5000 });
    check('a trade offer in 3 taps or fewer', taps <= 3, `${taps} taps`);
    await page.getByTestId('next-month').tap();
    await page.waitForTimeout(400);

    // AI offers arrive as cards; accept one in two taps.
    let offers = 0;
    for (let i = 0; i < 10 && offers === 0; i++) {
      offers = await page.locator('.card-offer').count();
      if (offers === 0) {
        await page.getByTestId('next-month').tap();
        await page.waitForTimeout(300);
      }
    }
    check('AI offers arrive as cards in the inbox', offers > 0, `${offers} offer cards`);
    if (offers > 0) {
      await page.locator('.card-offer').first().tap();
      await page.locator('.sheet [data-option="accept"]').tap();
      await page.getByText(/Accepted/).first().waitFor({ timeout: 5000 });
      const before = { food: await chip(page, 'food'), energy: await chip(page, 'energy'), credit: await chip(page, 'credit') };
      await page.getByTestId('next-month').tap();
      // Only a settled trade passes: "failed" or "Not sent" is a failure, not a pass.
      const outcome = page.getByText(/Trade done with|failed|Not sent/).first();
      await outcome.waitFor({ timeout: 5000 });
      const text = (await outcome.textContent()) ?? '';
      const got = /you got ([\d,]+) (food|energy|credit)/.exec(text);
      const good = (got?.[2] ?? 'food') as 'food' | 'energy' | 'credit';
      const after = await chip(page, good);
      check(
        'accepting an offer settles it in the sim',
        text.startsWith('Trade done with') && got !== null && after !== before[good],
        `${text}; ${good} ${before[good]} -> ${after}`,
      );
    }

    // Counter an offer through the trade sheet, if one is open.
    await page.getByTestId('next-month').tap();
    await page.waitForTimeout(300);
    if ((await page.locator('.card-offer').count()) > 0) {
      await page.locator('.card-offer').first().tap();
      await page.locator('.sheet [data-option="counter"]').tap();
      await page.getByRole('dialog', { name: 'Counter-offer' }).waitFor();
      await noHorizontalScroll(page, 'counter-offer sheet');
      await page.getByTestId('send-offer').tap();
      await page.getByText(/Counter-offer sent/).first().waitFor({ timeout: 5000 });
      check('counter-offer sent from the trade sheet', true);
    }

    for (const key of ['food', 'energy', 'credit', 'resilience']) {
      await page.getByTestId(`chip-${key}`).tap();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const text = (await dialog.textContent()) ?? '';
      check(`why-sheet on ${key}`, /\d/.test(text), text.slice(0, 60));
      await dialog.getByRole('button', { name: 'Close' }).first().tap();
    }

    await page.getByRole('button', { name: /World/ }).tap();
    await noHorizontalScroll(page, 'world map');
    check('map shows nations and trust lines', (await page.locator('.map .dot').count()) === 17 && (await page.locator('.map .tie').count()) > 0);
    await page.locator('.rows .row').first().tap();
    await page.getByRole('button', { name: 'Propose a trade' }).tap();
    await page.getByRole('dialog', { name: 'Make an offer' }).waitFor();
    await noHorizontalScroll(page, 'trade sheet');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();

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
        if (now - start < 6000) requestAnimationFrame(frame);
        else resolve({ frames: frames / ((now - start) / 1000), worst });
      };
      requestAnimationFrame(frame);
    })`)) as { frames: number; worst: number };
    const after = await tick(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('4x advances the clock', after - before >= 2, `${after - before} months in 6 s`);
    check('60 fps at 4x (CPU slowed 4x)', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);
    await page.getByRole('radio', { name: 'Pause' }).tap();

    // Game tab: policies, a save slot, and an exported file.
    await page.getByRole('button', { name: /Game/ }).tap();
    await noHorizontalScroll(page, 'game tab');
    await page.getByRole('switch', { name: /Accept anything from partners/ }).tap();
    await page.getByText(/Policy changes/).first().waitFor({ timeout: 5000 });
    await page.getByTestId('next-month').tap();
    await page.waitForTimeout(300);
    check('policy switch reaches the sim', (await page.getByRole('switch', { name: /Accept anything from partners/ }).getAttribute('aria-checked')) === 'true');
    await page.getByTestId('slot-slot-1').getByRole('button', { name: 'Save' }).tap();
    await page.getByText('Saved to Slot 1').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    const exported = join(profile, 'export.json');
    await download.saveAs(exported);
    const savedTick = await tick(page);
    const savedPrint = await page.getByTestId('fingerprint').textContent();
    check('export writes a file', existsSync(exported), download.suggestedFilename());

    // Clear site data, reopen, import the file: the same game resumes.
    await cdp.send('Storage.clearDataForOrigin', { origin: new globalThis.URL(URL).origin, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
    await page.close();
    page = await context.newPage();
    await page.goto(URL);
    await page.getByRole('heading', { name: 'Nations' }).waitFor({ timeout: 5000 });
    check('site data cleared (no game to continue)', (await page.getByRole('button', { name: /Continue as/ }).count()) === 0);
    await page.getByRole('button', { name: 'Load a save' }).tap();
    await page.getByTestId('import-file').setInputFiles(exported);
    await page.getByTestId('tick').waitFor();
    check('import restores the month', (await tick(page)) === savedTick, `saved ${savedTick}, imported ${await tick(page)}`);
    await page.getByRole('button', { name: /Game/ }).tap();
    check('import restores the same game (fingerprint)', (await page.getByTestId('fingerprint').textContent()) === savedPrint, `${savedPrint}`);
    await page.getByRole('button', { name: /Decisions/ }).tap();
    await page.getByTestId('next-month').tap();
    await page.waitForTimeout(300);
    check('the imported game continues', (await tick(page)) === savedTick + 1);

    // Offline reopen from the autosave the import wrote.
    await page.close();
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(URL);
    await page.getByRole('heading', { name: 'Nations' }).waitFor({ timeout: 5000 });
    check('opens with the network off', true);
    await page.getByRole('button', { name: /Continue as/ }).tap();
    await page.getByTestId('tick').waitFor();
    check('offline continue restores the game', (await tick(page)) >= savedTick);

    // Play to the end of the game, one month at a time.
    for (let i = 0; i < 70 && (await page.getByTestId('game-over').count()) === 0; i++) {
      await page.getByTestId('next-month').tap();
      await page.waitForTimeout(120);
    }
    await page.getByTestId('game-over').waitFor({ timeout: 10000 });
    check('a full game reaches the end screen', (await tick(page)) === 60, `month ${await tick(page)}`);
    check('final table lists all 17 nations', (await page.locator('.gameover tbody tr').count()) === 17);
    await noHorizontalScroll(page, 'game over');
    const shownWinner = ((await page.locator('.gameover tbody tr').first().locator('td').nth(1).textContent()) ?? '').trim();

    // The end screen's winner is the sim's winner: export the finished game and score it with the sim itself.
    await page.getByRole('button', { name: /Game/ }).tap();
    const [finalDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    const finalFile = join(profile, 'final.json');
    await finalDownload.saveAs(finalFile);
    const file = JSON.parse(readFileSync(finalFile, 'utf8')) as { game: { save: unknown } };
    const finalState = loadSave(file.game.save).state;
    const board = scoreboard(finalState);
    const simTop = [...board.nations].sort((a, b) => b.finalScore - a.finalScore)[0];
    const simWinner = simTop === undefined ? '' : (finalState.nations[simTop.id]?.name ?? '');
    check("the end screen's winner is the sim's winner", shownWinner !== '' && shownWinner === simWinner, `screen ${shownWinner}, sim ${simWinner}`);

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
