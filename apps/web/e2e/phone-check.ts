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
 *
 * Prompt 11 (MVP on the phone): the install prompt is offered; a crisis appeal
 * card resolves in 2 taps; the policy dials (trade posture, crisis rule,
 * monthly share) reach the sim; prediction mode asks "What will they do?" and
 * the guess and answer land in the exported save, graded by the harness
 * report; a live game closed for 24 hours catches up on reopen, on a CPU
 * slowed 4x, inside the Gate 0 budget (2 s), and shows a ranked recap of at
 * most 6 lines and 150 words that one tap dismisses; the depth budget (no
 * horizontal scroll, tables of 4 columns at most) holds on every new screen.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { loadSave, scoreboard } from '@nations/sim';
import { parsePredictionFile, predictionReport } from '../../../packages/harness/src/predictions.ts';

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

async function nextMonth(page: Page, wait = 300): Promise<void> {
  await page.getByTestId('next-month').tap();
  await page.waitForTimeout(wait);
}

/** Depth budget: tables of at most 4 columns (docs/ROADMAP.md). */
async function narrowTables(page: Page, where: string): Promise<void> {
  const widest = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('table tr')].map((tr) => tr.children.length)));
  check(`tables have 4 columns at most: ${where}`, widest <= 4, `widest ${widest}`);
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
    await page.reload();
    await page.getByRole('heading', { name: 'Nations' }).waitFor();
    await page.waitForTimeout(1500);
    const install = page.getByTestId('install');
    check('install prompt offered on the start screen', (await install.count()) === 1 && (await install.getByRole('button', { name: 'Install' }).count()) === 1);
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
    // Prompt 11: the three dial groups each send a command the sim applies.
    await page.getByRole('radio', { name: 'Crisis rule: Fair share' }).tap();
    await page.getByRole('radio', { name: 'Trade posture: Hard' }).tap();
    await page.getByRole('button', { name: 'Raise monthly share' }).tap();
    const shareBefore = (await page.locator('.stepper .amount').first().textContent()) ?? '';
    await nextMonth(page);
    check(
      'policy dials reach the sim (posture, crisis rule, monthly share)',
      (await page.getByRole('radio', { name: 'Crisis rule: Fair share' }).getAttribute('aria-checked')) === 'true' &&
        (await page.getByRole('radio', { name: 'Trade posture: Hard' }).getAttribute('aria-checked')) === 'true' &&
        shareBefore !== ((await page.locator('.stepper .amount').first().textContent()) ?? ''),
      `share ${shareBefore} -> ${await page.locator('.stepper .amount').first().textContent()}`,
    );
    await page.getByRole('radio', { name: 'Trade posture: Open' }).tap();
    await noHorizontalScroll(page, 'policy dials');
    await page.getByRole('switch', { name: 'Prediction mode' }).tap();
    await page.getByText(/Prediction mode on/).first().waitFor({ timeout: 5000 });
    check('prediction mode switch in settings', (await page.getByRole('switch', { name: 'Prediction mode' }).getAttribute('aria-checked')) === 'true');

    // A crisis appeal card: open it, pay the share. Two taps.
    await page.getByRole('button', { name: /Decisions/ }).tap();
    for (let i = 0; i < 14 && (await page.locator('.card-crisis').count()) === 0; i++) await nextMonth(page);
    const crisisCards = await page.locator('.card-crisis').count();
    check('crisis appeals arrive as cards', crisisCards > 0, `${crisisCards} crisis cards by month ${await tick(page)}`);
    if (crisisCards > 0) {
      let crisisTaps = 0;
      await page.locator('.card-crisis').first().tap();
      crisisTaps++;
      await noHorizontalScroll(page, 'crisis sheet');
      const optionCount = await page.locator('.sheet .option').count();
      const reasons = (await page.locator('.sheet .reasons').textContent()) ?? '';
      const pay = page.locator('.sheet [data-option="pay"], .sheet [data-option="topup"]').first();
      const box = await pay.boundingBox();
      check('crisis card: 2-3 options, reasons shown, options in the bottom third', optionCount >= 2 && optionCount <= 3 && reasons.length > 0 && box !== null && box.y + box.height / 2 >= (HEIGHT * 2) / 3, `${optionCount} options; ${reasons.slice(0, 70)}`);
      await pay.tap();
      crisisTaps++;
      await page.getByText(/Paid .* into the/).first().waitFor({ timeout: 5000 });
      check('a crisis card resolves in 3 taps or fewer', crisisTaps <= 3, `${crisisTaps} taps`);
    }

    // Prediction mode: the player's offers get answered; a "What will they do?" card asks first.
    for (let i = 0; i < 10 && (await page.locator('.card-predict').count()) === 0; i++) {
      const buy = page.locator('.card-shortfall, .card-opportunity').first();
      if ((await buy.count()) > 0) {
        await buy.tap();
        await page.locator('.sheet .option').first().tap();
        await page.waitForTimeout(200);
      }
      await nextMonth(page);
    }
    const predictCards = await page.locator('.card-predict').count();
    check('prediction mode asks "What will they do?" before an AI answer shows', predictCards > 0, `${predictCards} questions by month ${await tick(page)}`);
    if (predictCards > 0) {
      await page.locator('.card-predict').first().tap();
      await page.locator('.sheet .option').first().tap();
      const reveal = page.getByTestId('reveal');
      await reveal.waitFor({ timeout: 5000 });
      await noHorizontalScroll(page, 'prediction reveal');
      check('guessing reveals the real answer in 2 taps', /\w/.test((await reveal.textContent()) ?? ''), (await reveal.textContent()) ?? '');
      await page.getByRole('button', { name: 'OK' }).tap();
    }
    await page.getByRole('button', { name: /Game/ }).tap();
    await page.getByTestId('slot-slot-1').getByRole('button', { name: 'Save' }).tap();
    await page.getByText('Saved to Slot 1').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    const exported = join(profile, 'export.json');
    await download.saveAs(exported);
    const savedTick = await tick(page);
    const savedPrint = await page.getByTestId('fingerprint').textContent();
    check('export writes a file', existsSync(exported), download.suggestedFilename());
    const graded = predictionReport([parsePredictionFile('export.json', readFileSync(exported, 'utf8'))]);
    check('the exported save holds guesses and answers; the harness report grades them', graded.total.guessed >= 1, `${graded.total.correct} of ${graded.total.guessed} right`);

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

    // Live clock: close the app for 24 hours (the saved anchor moved back a day), reopen on a slowed CPU.
    await page.getByRole('radio', { name: 'Live clock' }).tap();
    await page.getByText(/Live clock: a month every/).first().waitFor({ timeout: 5000 });
    const liveFrom = await tick(page);
    await page.evaluate(`(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await page.waitForTimeout(800);
    const moved = (await page.evaluate(`new Promise((resolve, reject) => {
      const req = indexedDB.open('nations', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const store = req.result.transaction('slots', 'readwrite').objectStore('slots');
        const get = store.get('autosave');
        get.onsuccess = () => {
          const record = get.result;
          if (!record || !record.game.live) return resolve(false);
          record.game.live.anchor -= 24 * 60 * 60 * 1000;
          store.put(record).onsuccess = () => resolve(true);
        };
      };
    })`)) as boolean;
    check('a live game saves its clock when the app is hidden', moved);
    await page.close();
    page = await context.newPage();
    const liveCdp = await context.newCDPSession(page);
    await page.goto(URL);
    await page.getByRole('heading', { name: 'Nations' }).waitFor({ timeout: 5000 });
    await liveCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reopened = Date.now();
    await page.getByRole('button', { name: /Continue as/ }).tap();
    const recap = page.getByTestId('recap');
    await recap.waitFor({ timeout: 10000 });
    const reopenMs = Date.now() - reopened;
    await liveCdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const liveTo = await tick(page);
    check('24 hours closed: the world moved 48 months (or to the end)', liveTo === Math.min(60, liveFrom + 48), `month ${liveFrom} -> ${liveTo}`);
    await recap.locator('.num').first().tap();
    const recapWhy = (await page.getByRole('dialog').textContent()) ?? '';
    const catchUpMs = Number(/in (\d+) ms/.exec(recapWhy)?.[1] ?? NaN);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();
    check('24-hour catch-up inside the Gate 0 budget (CPU slowed 4x)', catchUpMs < 2000, `${catchUpMs} ms stepping, ${reopenMs} ms from tap to recap`);
    const lines = await recap.locator('.recap-line').allTextContents();
    const words = lines.join(' ').split(/\s+/).filter((w) => w.length > 0).length;
    check('the away recap reads in under a minute (6 lines, 150 words at most)', lines.length > 0 && lines.length <= 6 && words <= 150, `${lines.length} lines, ${words} words: ${lines[0] ?? ''}`);
    await noHorizontalScroll(page, 'away recap');
    await page.getByTestId('recap-dismiss').tap();
    const gone = await page
      .getByTestId('recap')
      .waitFor({ state: 'detached', timeout: 3000 })
      .then(() => true, () => false);
    check('one tap dismisses the recap', gone);
    await page.getByRole('radio', { name: 'Pause' }).tap();

    // Play to the end of the game, one month at a time.
    for (let i = 0; i < 70 && (await page.getByTestId('game-over').count()) === 0; i++) {
      await page.getByTestId('next-month').tap();
      await page.waitForTimeout(120);
    }
    await page.getByTestId('game-over').waitFor({ timeout: 10000 });
    check('a full game reaches the end screen', (await tick(page)) === 60, `month ${await tick(page)}`);
    check('final table lists all 17 nations', (await page.locator('.gameover tbody tr').count()) === 17);
    await noHorizontalScroll(page, 'game over');
    await narrowTables(page, 'game over');
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
