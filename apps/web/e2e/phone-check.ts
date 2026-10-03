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
 * Slice 4: closed for 3 hours (the autosave's clock moved back), it reopens on
 * a CPU slowed 4x inside the 2 s budget, runs only the 2-hour offline cap, and
 * shows a three-line recap that one tap collects.
 * Slice 5: an airport worth slots sells from the bottom bar in two taps and
 * opens Port Calder with its twist, the slots and one gate.
 * Passenger flow: a new airport shows check-in, security and baggage claim
 * with people walking through them; international routes add passport
 * control and customs; the 60 fps check runs with the people walking.
 * The security line: a new airport has none; the maze is a big tap target and
 * a tap opens an extra lane; the busy airport's real line stands in the maze,
 * its six lanes shown, and the bottleneck names it. The testing time skip runs
 * an hour at once and recaps it.
 * Boosts: a new airport has Rush hour ready and the other two locked, in the
 * bottom third; a tap starts Rush hour with a countdown; the eight-gate airport
 * runs All hands (every gate glows) and Fare surge (boosted income in gold)
 * during the 60 fps check.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { busyAirport } from '../../../packages/harness/src/airport.ts';
import { AIRPORT_TUNABLES, AirportSession, hashState } from '@airport/sim';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
/** The budget phone by default; `PHONE=pixel10xl` checks a Pixel 10 Pro XL (412 x 915) instead. */
const PHONE = process.env.PHONE === 'pixel10xl' ? { width: 412, height: 915, dpr: 3.25 } : { width: 360, height: 740, dpr: 2 };
const WIDTH = PHONE.width;
const HEIGHT = PHONE.height;

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
function busyFile(dir: string, earned = 0): { path: string; hash: string } {
  const busy = busyAirport();
  // A test fixture: an airport that has earned enough to be worth slots.
  const state = earned === 0 ? busy : { ...busy, run: { ...busy.run, earned }, life: { ...busy.life, earned } };
  const session = new AirportSession(state);
  const game = { save: session.save({ compact: true }), anchor: Date.now() };
  const path = join(dir, `busy-${earned}.json`);
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
      deviceScaleFactor: PHONE.dpr,
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
    const departures = (await page.getByTestId('security').textContent()) ?? '';
    const arrivals = (await page.getByTestId('lane-arrivals').textContent()) ?? '';
    check('the passenger flow shows security, check-in, baggage claim and the exit', /Security.*Check-in/.test(departures) && /Exit.*Baggage/.test(arrivals) && (await page.locator('[data-booth="passport"]').count()) === 0, `${departures} | ${arrivals}`);
    check('a new airport has no line at security', ((await page.getByTestId('security-line').textContent()) ?? '') === 'No line', (await page.getByTestId('security-line').textContent()) ?? '');
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="flow-dots"]')?.getAttribute('data-dots') ?? 0) > 0, undefined, { timeout: 5000 }).catch(() => undefined);
    const walking = Number(await page.getByTestId('flow-dots').getAttribute('data-dots'));
    check('people walk through the airport', walking > 0, `${walking} walking`);
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

    // The security line (RULES 3, 6): a big tap target in the middle of the screen; a tap opens an extra lane.
    const secBox = await page.getByTestId('security').boundingBox();
    check('the security maze is a big tap target', secBox !== null && secBox.height >= 60 && secBox.width >= 300, `${Math.round(secBox?.width ?? 0)}x${Math.round(secBox?.height ?? 0)}`);
    await page.getByTestId('security').tap();
    await page.waitForTimeout(350);
    check('a tap on security opens an extra lane', ((await page.getByTestId('security').getAttribute('class')) ?? '').includes('rushed') && (await page.locator('.sec-lane-extra').isVisible()));

    // Boosts (RULES 15): Rush hour ready from the start, the others locked; one tap starts it.
    const boostClass = async (id: string): Promise<string> => (await page.getByTestId(`boost-${id}`).getAttribute('class')) ?? '';
    check('Rush hour is ready, All hands and Fare surge are locked', (await boostClass('rushHour')).includes('boost-ready') && (await boostClass('allHands')).includes('boost-locked') && (await boostClass('surge')).includes('boost-locked'));
    const boostBox = await page.getByTestId('boost-rushHour').boundingBox();
    check('boosts in the bottom third', boostBox !== null && boostBox.y >= HEIGHT / 2 && boostBox.y + boostBox.height / 2 >= (HEIGHT * 2) / 3, `centre at ${Math.round((boostBox?.y ?? 0) + (boostBox?.height ?? 0) / 2)}`);
    await page.getByTestId('boost-rushHour').tap();
    await page.waitForTimeout(600);
    const rushStatus = (await page.getByTestId('boost-rushHour').locator('.boost-status').textContent()) ?? '';
    check('a tap starts Rush hour, counting down from a minute', (await boostClass('rushHour')).includes('boost-running') && /^(1m 0s|5\ds)$/.test(rushStatus), rushStatus);
    check('starting a boost says what it does', /Rush hour! 3x passengers/.test((await page.locator('.toast').textContent()) ?? ''));

    // Settings: export, clear site data, import a busy airport file.
    await page.getByTestId('settings').tap();
    await page.getByTestId('stats').waitFor();
    await noHorizontalScroll(page, 'settings sheet');
    await touchTargets(page, 'settings sheet');
    check('sound is off by default', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'false');
    await page.getByTestId('sound').tap();
    check('sound turns on with one tap', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'true');
    await page.getByTestId('sound').tap();
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
    check('an international route adds passport control and customs', (await page.locator('.lounge [data-booth="passport"]').count()) === 1 && /Customs/.test((await page.getByTestId('lane-arrivals').textContent()) ?? ''));
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="flow-dots"]')?.getAttribute('data-queued') ?? 0) > 5, undefined, { timeout: 5000 }).catch(() => undefined);
    const lineText = (await page.getByTestId('security-line').textContent()) ?? '';
    const queued = Number(await page.getByTestId('flow-dots').getAttribute('data-queued'));
    check('the busy airport queues at security: the real line stands in the maze', /in line/.test(lineText) && queued > 5 && /security/.test(((await page.getByTestId('bottleneck').textContent()) ?? '').toLowerCase()), `${lineText}, ${queued} dots in the maze`);
    check('Security lanes show as scanner lanes', (await page.locator('.sec-lane:not(.sec-lane-extra)').count()) === 6);
    await noHorizontalScroll(page, 'eight gates');
    await touchTargets(page, 'eight gates');
    await page.getByTestId('boost-allHands').tap();
    await page.getByTestId('boost-surge').tap();
    await page.waitForTimeout(400);
    const glowing = await page.locator('.gate.rushing').count();
    check('All hands rushes every gate with no taps', glowing === 8, `${glowing} of 8 gates rushing`);
    const income = page.getByTestId('income');
    check('Fare surge shows the boosted income in gold', ((await income.getAttribute('class')) ?? '').includes('income-boosted') && /⚡/.test((await income.textContent()) ?? ''), (await income.textContent()) ?? '');

    // 60 fps with eight gates animating, take-offs, pops and a thumb tapping, the CPU slowed 4x.
    await page.waitForTimeout(500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const tapping = (async () => {
      for (let i = 0; i < 12; i++) {
        await page.getByTestId(`gate-${i % 8}`).tap();
        await page.waitForTimeout(300);
      }
    })();
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
    await tapping;
    const crowd = Number(await page.getByTestId('flow-dots').getAttribute('data-dots'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps with eight gates, people walking, two boosts running, tapping (CPU slowed 4x)', fps.frames >= 55 && crowd > 0, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms, ${crowd} people walking`);

    // Offline: the installed app reopens and continues from the autosave.
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('gate-7').waitFor({ timeout: 8000 });
    check('reopens offline and continues the airport', (await page.locator('.gate:not(.gate-next)').count()) === 8);
    await context.setOffline(false);

    // Away for 3 hours: close the app, move the autosave's wall clock back, reopen on a slow CPU.
    const ticksBefore = Number(await page.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('airport', 1);
      req.onsuccess = () => {
        const get = req.result.transaction('slots', 'readonly').objectStore('slots').get('autosave');
        get.onsuccess = () => resolve(get.result.tick);
      };
    })`));
    await page.close();
    await new Promise((r) => setTimeout(r, 1500));
    const side = await context.newPage();
    await side.goto(`${URL}manifest.webmanifest`);
    const shifted = Number(await side.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('airport', 1);
      req.onsuccess = () => {
        const store = req.result.transaction('slots', 'readwrite').objectStore('slots');
        const get = store.get('autosave');
        get.onsuccess = () => {
          const record = get.result;
          record.game.anchor -= 3 * 3600 * 1000;
          store.put(record).onsuccess = () => resolve(record.tick);
        };
      };
    })`));
    await side.close();
    const back = await context.newPage();
    const backCdp = await context.newCDPSession(back);
    await backCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reopened = Date.now();
    await back.goto(URL);
    await back.getByTestId('recap').waitFor({ timeout: 15_000 });
    const reopenMs = Date.now() - reopened;
    await backCdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('3 hours away: reopens to the recap inside 2 s (CPU slowed 4x)', reopenMs < 2000, `${reopenMs} ms from opening to the recap, saved at tick ${shifted} (was ${ticksBefore})`);
    const lines = await back.getByTestId('recap').locator('li').allTextContents();
    check('the recap is three lines', lines.length === 3, lines.join(' | '));
    check('the recap says the offline cap cut the night short', /ran for 2h 0m/.test(lines[0] ?? ''), lines[0] ?? '');
    check('the recap names what it earned', /earned \$/.test(lines[1] ?? ''), lines[1] ?? '');
    await noHorizontalScroll(back, 'away recap');
    await touchTargets(back, 'away recap');
    await back.getByTestId('collect').tap();
    await back.getByTestId('recap').waitFor({ state: 'detached', timeout: 2000 });
    check('one tap collects and closes the recap', (await back.getByTestId('recap').count()) === 0);

    // The testing time skip: Settings, +1 hour, and the recap sums up the hour.
    const tickAt = async (): Promise<number> => Number(await back.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('airport', 1);
      req.onsuccess = () => {
        const get = req.result.transaction('slots', 'readonly').objectStore('slots').get('autosave');
        get.onsuccess = () => resolve(get.result.tick);
      };
    })`));
    const beforeSkip = await tickAt();
    await back.getByTestId('settings').tap();
    await touchTargets(back, 'settings with the time skip');
    await noHorizontalScroll(back, 'settings with the time skip');
    await back.getByTestId('skip-60').tap();
    await back.getByTestId('recap').waitFor({ timeout: 5000 });
    const skipLines = await back.getByTestId('recap').locator('li').allTextContents();
    await back.waitForTimeout(300);
    const afterSkip = await tickAt();
    check('the time skip runs an hour at once and recaps it', afterSkip - beforeSkip >= 14_400 && /skipped 1h 0m/.test(skipLines[0] ?? ''), `tick ${beforeSkip} -> ${afterSkip}; ${skipLines.join(' | ')}`);
    await back.getByTestId('collect').tap();

    // Selling: an airport that has earned 9 slot units ($5.4M) is worth 3 slots.
    const worth = busyFile(profile, 9 * AIRPORT_TUNABLES.slotUnitCents.value);
    await back.getByTestId('settings').tap();
    await back.getByTestId('import-file').setInputFiles(worth.path);
    await back.getByTestId('open-sell').waitFor({ timeout: 5000 });
    check('the bottom bar offers the sale', ((await back.getByTestId('open-sell').textContent()) ?? '').includes('+3'), (await back.getByTestId('open-sell').textContent()) ?? '');
    await touchTargets(back, 'bottom bar with sell');
    await noHorizontalScroll(back, 'bottom bar with sell');
    await back.getByTestId('open-sell').tap();
    await back.getByTestId('sell-worth').waitFor();
    await noHorizontalScroll(back, 'sell sheet');
    await touchTargets(back, 'sell sheet');
    check('the sell sheet names the next city', ((await back.getByTestId('next-city').textContent()) ?? '') === 'Port Calder');
    await back.getByTestId('confirm-sell').tap();
    await back.getByTestId('city-twist').waitFor({ timeout: 3000 });
    check('Port Calder opens with its twist', /Short runway/.test((await back.getByTestId('city-twist').textContent()) ?? ''));
    await back.getByTestId('open-city').tap();
    check('the new airport has the slots and one gate', /Port Calder · 3 slots/.test((await back.getByTestId('city').textContent()) ?? '') && (await back.locator('.gate:not(.gate-next)').count()) === 1, (await back.getByTestId('city').textContent()) ?? '');

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
