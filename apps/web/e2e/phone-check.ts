/**
 * The phone check (docs/ROADMAP.md, phone UX budget), in headless Chromium
 * sized as a 360 px phone with touch. Builds nothing: run `npm run build`
 * first, then `npm run e2e --workspace web`. Not in CI (it needs a Chromium
 * binary); results are recorded in docs/PROGRESS.md.
 *
 * Checks (W8, the WMS is the game): installable; the app opens on the WMS
 * floor with the whole crew on it and the clock at the warehouse's opening
 * time; no horizontal scroll at 360 px and every button at least 44 px on
 * every page and sheet; the page tabs in the bottom third; a tap on a worker
 * on the floor opens their tasks; the Crew page lists every worker and a
 * worker's page shows what they do now and next; 60 fps on the floor with the
 * CPU slowed 4x; the plan changes in two taps and the floor shows it; the
 * speed buttons pause and step the speed (W9); the wave interval, the balance
 * plan and a move by need show on the floor (W9); the
 * testing time skip runs an hour and recaps it, and its earnings hire a
 * picker; the dock schedule shows appointments; export a file, clear site
 * data, import a busy warehouse (40 workers, 4 inbound and 6 outbound doors) and it resumes; 60 fps
 * on the busy floor; reopens offline; closed for 10 hours (the autosave's
 * clock moved back), it reopens on a CPU slowed 4x inside the 2 s budget,
 * runs only the 8-hour offline cap, and shows a three-line recap that one tap
 * collects.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { busyWarehouse } from '../../../packages/harness/src/warehouse.ts';
import { WarehouseSession, hashState } from '@warehouse/sim';

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

/** A file holding a busy warehouse (the most workers and doors, an hour in), made with the sim itself, anchored at `now`. */
function busyFile(dir: string): { path: string; hash: string } {
  const busy = busyWarehouse();
  const session = new WarehouseSession(busy);
  const game = { save: session.save({ compact: true }), anchor: Date.now() };
  const path = join(dir, 'busy.json');
  writeFileSync(path, JSON.stringify({ format: 'warehouse-idle-save', version: 1, exportedAt: Date.now(), game }));
  return { path, hash: hashState(busy) };
}

/** Taps a worker standing still on the floor (each in turn: they start walking at any moment). True if their page opened. */
async function tapWorker(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const standing = (await page.getByTestId('wms-floor-canvas').getAttribute('data-standing')) ?? '';
    const spot = standing.split(' ').filter((x) => x.length > 0)[attempt];
    if (spot === undefined) return false;
    const [, x, y] = spot.split(':').map(Number);
    const box = await page.getByTestId('wms-floor-canvas').boundingBox();
    await page.touchscreen.tap((box?.x ?? 0) + (x ?? 0), (box?.y ?? 0) + (y ?? 0));
    const opened = await page
      .getByTestId('wms-worker')
      .waitFor({ timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;
  }
  return false;
}

/** The autosave's tick, read from IndexedDB in the page. */
async function savedTick(page: Page): Promise<number> {
  return Number(
    await page.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('warehouse', 1);
      req.onsuccess = () => {
        const get = req.result.transaction('slots', 'readonly').objectStore('slots').get('autosave');
        get.onsuccess = () => resolve(get.result.tick);
      };
    })`),
  );
}

async function main(): Promise<void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'warehouse-phone-'));
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
    await page.goto(URL);
    await page.getByTestId('wms-floor').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await context.newCDPSession(page);
    const installErrors = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
    check('installable (manifest + service worker)', installErrors.installabilityErrors.length === 0, JSON.stringify(installErrors.installabilityErrors));

    // The WMS is the game (W8): it opens on the floor with the whole crew and the warehouse clock.
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-workers') ?? 0) > 0, undefined, { timeout: 5000 }).catch(() => undefined);
    const canvas = page.getByTestId('wms-floor-canvas');
    const workers = Number(await canvas.getAttribute('data-workers'));
    const pickers = Number(await canvas.getAttribute('data-pickers'));
    check('the app opens on the WMS floor, the whole crew on it', (await page.getByTestId('wms-tab-floor').getAttribute('aria-selected')) === 'true' && workers === 20 && pickers === 14, `${workers} workers, ${pickers} picking`);
    const clockText = (await page.getByTestId('clock').textContent()) ?? '';
    check('the clock shows day 1 from 06:00', /^Day 1\s*0[67]:\d\d$/.test(clockText.trim()), clockText);
    check('cash shows at the top', /\$/.test((await page.getByTestId('cash').textContent()) ?? ''));
    await noHorizontalScroll(page, 'WMS home');
    await touchTargets(page, 'WMS home');
    for (const id of ['wms-tab-floor', 'wms-tab-crew', 'wms-tab-plan']) {
      const b = await page.getByTestId(id).boundingBox();
      check(`${id} in the bottom third`, b !== null && b.y + b.height / 2 >= (HEIGHT * 2) / 3, `centre at ${Math.round((b?.y ?? 0) + (b?.height ?? 0) / 2)}`);
    }

    // A tap on a worker opens their tasks (W8).
    await page.waitForTimeout(3000);
    const tapped = await tapWorker(page);
    check('a tap on a worker on the floor opens their tasks', tapped);
    if (tapped) {
      await noHorizontalScroll(page, 'a worker’s tasks');
      await touchTargets(page, 'a worker’s tasks');
      await page.getByTestId('wms-worker-back').tap();
    }
    await page.getByTestId('wms-tab-crew').tap();
    await page.getByTestId('crew-list').waitFor();
    const rows = await page.locator('[data-testid^="crew-worker-"]').count();
    check('the Crew page lists every worker', rows === 20, `${rows} rows`);
    await noHorizontalScroll(page, 'crew');
    await touchTargets(page, 'crew');
    await page.getByTestId('crew-worker-1').tap();
    await page.getByTestId('wms-worker').waitFor();
    const workerText = (await page.getByTestId('wms-worker').textContent()) ?? '';
    check('a worker’s page shows what they do now, next and lately', /Now/.test(workerText) && /Next \(\d\)/.test(workerText) && /Done lately/.test(workerText) && /W01 · Picker/.test(workerText), workerText.slice(0, 120));
    await page.getByTestId('wms-worker-back').tap();

    // 60 fps on the floor with the CPU slowed 4x.
    await page.getByTestId('wms-tab-floor').tap();
    await page.getByTestId('wms-floor').waitFor();
    await page.waitForTimeout(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const floorFps = await measureFps(page, 4000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps on the WMS floor (CPU slowed 4x)', floorFps.frames >= 55, `${floorFps.frames.toFixed(1)} fps, worst frame ${floorFps.worst.toFixed(0)} ms`);

    // The plan (W7): two taps, and the floor shows it.
    await page.getByTestId('wms-plan-chip').tap();
    await page.getByTestId('wms-plan').waitFor();
    await noHorizontalScroll(page, 'WMS plan');
    await touchTargets(page, 'WMS plan');
    await page.getByTestId('plan-pick-nearest').tap();
    await page.getByTestId('plan-crew-more').tap();
    await page.getByTestId('wms-tab-floor').tap();
    await page.waitForFunction(() => /Nearest bin.*15 pick \/ 5 dock/.test(document.querySelector('[data-testid="wms-plan-chip"]')?.textContent ?? ''), undefined, { timeout: 4000 }).catch(() => undefined);
    const plan = (await page.getByTestId('wms-plan-chip').textContent()) ?? '';
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-pickers') ?? 0) === 15, undefined, { timeout: 4000 }).catch(() => undefined);
    check('the plan changes in two taps and the floor shows it: nearest bin, fifteen pickers', /Nearest bin.*15 pick \/ 5 dock/.test(plan) && Number(await canvas.getAttribute('data-pickers')) === 15, plan);

    // Speed (W9): 5 warehouse minutes a second by default; pause stops the clock; the speed button steps 5, 10, 1 and back.
    const clockNow = async (): Promise<string> => ((await page.getByTestId('clock').textContent()) ?? '').trim();
    check('the warehouse runs at 5 warehouse minutes a second', (await page.getByTestId('speed').textContent()) === '5×', (await page.getByTestId('speed').textContent()) ?? '');
    await page.getByTestId('pause').tap();
    await page.waitForTimeout(300);
    const paused = await clockNow();
    await page.waitForTimeout(1500);
    const stillPaused = await clockNow();
    await page.getByTestId('pause').tap();
    await page.waitForTimeout(1500);
    check('pause stops the warehouse clock and a second tap runs it again', paused === stillPaused && (await clockNow()) !== paused, `${paused} / ${stillPaused} / ${await clockNow()}`);
    const speeds: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('speed').tap();
      await page.waitForTimeout(400);
      speeds.push((await page.getByTestId('speed').textContent()) ?? '');
    }
    check('the speed button steps 10x, 1x and back to 5x', speeds.join(' ') === '10× 1× 5×', speeds.join(' '));

    // Waves and labour (W9): a 30-minute wave, the balance plan, and one person moved by need.
    await page.getByTestId('wms-plan-chip').tap();
    await page.getByTestId('wms-plan').waitFor();
    await page.getByTestId('plan-wave-120').tap();
    await page.getByTestId('plan-labor-balance').tap();
    await page.getByTestId('needs').waitFor();
    await touchTargets(page, 'WMS plan with labour');
    await page.getByTestId('need-move-receive').tap();
    await page.getByTestId('wms-tab-floor').tap();
    await page.waitForFunction(() => /30 min.*14 pick \/ 6 dock · balance/.test(document.querySelector('[data-testid="wms-plan-chip"]')?.textContent ?? ''), undefined, { timeout: 4000 }).catch(() => undefined);
    const labourPlan = (await page.getByTestId('wms-plan-chip').textContent()) ?? '';
    check('waves every 30 min, balance by need, and a picker moved to the dock in three taps', /Waves 30 min.*14 pick \/ 6 dock · balance/.test(labourPlan), labourPlan);

    // The testing time skip: an hour at once, recapped; its earnings hire a picker.
    const beforeSkip = await savedTick(page);
    await page.getByTestId('settings').tap();
    await page.getByTestId('stats').waitFor();
    await noHorizontalScroll(page, 'settings sheet');
    await touchTargets(page, 'settings sheet');
    check('sound is off by default', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'false');
    await page.getByTestId('sound').tap();
    check('sound turns on with one tap', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'true');
    await page.getByTestId('sound').tap();
    await page.getByTestId('skip-60').tap();
    await page.getByTestId('recap').waitFor({ timeout: 5000 });
    const skipLines = await page.getByTestId('recap').locator('li').allTextContents();
    await page.waitForTimeout(300);
    const afterSkip = await savedTick(page);
    check('the time skip runs an hour at once and recaps it in three lines', afterSkip - beforeSkip >= 14_400 && /skipped 1h 0m/.test(skipLines[0] ?? '') && skipLines.length === 3, `tick ${beforeSkip} -> ${afterSkip}; ${skipLines.join(' | ')}`);
    check('the recap names what shipped and earned', /shipped .* orders?, \d+% on time and in full, for \$/.test(skipLines[1] ?? ''), skipLines[1] ?? '');
    await noHorizontalScroll(page, 'away recap');
    await touchTargets(page, 'away recap');
    await page.getByTestId('collect').tap();
    await page.getByTestId('recap').waitFor({ state: 'detached', timeout: 2000 });
    const cash = await cashCents(page);
    check('an hour of shipments has earned real money', cash > 50_000, `${cash} cents`);
    await page.getByTestId('wms-tab-plan').tap();
    await page.getByTestId('plan-hire-pick').tap();
    await page.getByTestId('wms-tab-crew').tap();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="crew-worker-"]').length === 21, undefined, { timeout: 4000 }).catch(() => undefined);
    check('a hire adds a worker to the crew', (await page.locator('[data-testid^="crew-worker-"]').count()) === 21);

    // Outbound doors (W10): Out › Trucks lists each door's trailer, when it leaves and what is on it.
    await page.getByTestId('wms-tab-outbound').tap();
    await page.getByTestId('wms-trucks-tab').tap();
    await page.getByTestId('wms-trucks').waitFor();
    await noHorizontalScroll(page, 'trucks');
    await touchTargets(page, 'trucks');
    const doors = await page.locator('.truck-code').allTextContents();
    const leaves = await page.locator('.truck-leaves').allTextContents();
    check('Out › Trucks shows the three outbound doors and when each trailer leaves', doors.join(' ') === 'S1 S2 S3' && leaves.every((t) => /leaves \d\d:\d\d/.test(t)), `${doors.join(' ')}; ${leaves.join(' | ')}`);

    // Inbound: purchase orders booked into dock appointments (W8).
    await page.getByTestId('wms-tab-inbound').tap();
    await page.getByTestId('wms-inbound').waitFor();
    await noHorizontalScroll(page, 'inbound');
    await touchTargets(page, 'inbound');
    const appt = await page.locator('[data-testid="wms-inbound"] thead').textContent();
    check('the inbound grid shows each PO’s appointment', /Appt/.test(appt ?? ''), appt ?? '');
    await page.getByTestId('wms-po-schedule').tap();
    await page.getByTestId('dock-schedule').waitFor();
    await noHorizontalScroll(page, 'dock schedule');
    await touchTargets(page, 'dock schedule');
    const slots = await page.locator('.slot-time').allTextContents();
    check('the dock schedule lists appointment slots as times of day', slots.every((t) => /^(D\d+ )?\d\d:[03]0$/.test(t)), slots.slice(0, 4).join(', ') || 'none booked right now');

    // Export, clear site data, import a busy warehouse.
    await page.getByTestId('settings').tap();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    check('export downloads a save file', /^warehouse-tick-\d+\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();
    await cdp.send('Storage.clearDataForOrigin', { origin: new globalThis.URL(URL).origin, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
    await page.reload();
    await page.getByTestId('wms-floor').waitFor();
    await page.waitForTimeout(500);
    check('site data cleared: a fresh warehouse opens on day 1', /^Day 1/.test(((await page.getByTestId('clock').textContent()) ?? '').trim()));
    const busy = busyFile(profile);
    await page.getByTestId('settings').tap();
    await page.getByTestId('import-file').setInputFiles(busy.path);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-workers') ?? 0) === 40, undefined, { timeout: 5000 }).catch(() => undefined);
    check('import resumes the busy warehouse: 40 workers', Number(await canvas.getAttribute('data-workers')) === 40, `${await canvas.getAttribute('data-workers')} workers`);
    await noHorizontalScroll(page, 'busy floor');
    await touchTargets(page, 'busy floor');
    await page.waitForTimeout(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const busyFps = await measureFps(page, 5000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps on the busy floor: 40 workers, 4 inbound and 6 outbound doors (CPU slowed 4x)', busyFps.frames >= 55, `${busyFps.frames.toFixed(1)} fps, worst frame ${busyFps.worst.toFixed(0)} ms`);

    // Offline: the installed app reopens and continues from the autosave.
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('wms-floor').waitFor({ timeout: 8000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-workers') ?? 0) === 40, undefined, { timeout: 5000 }).catch(() => undefined);
    check('reopens offline and continues the warehouse', Number(await page.getByTestId('wms-floor-canvas').getAttribute('data-workers')) === 40);
    await context.setOffline(false);

    // Away for 10 hours: close the app, move the autosave's wall clock back, reopen on a slow CPU.
    const ticksBefore = await savedTick(page);
    await page.close();
    await new Promise((r) => setTimeout(r, 1500));
    const side = await context.newPage();
    await side.goto(`${URL}manifest.webmanifest`);
    const shifted = Number(
      await side.evaluate(`new Promise((resolve) => {
        const req = indexedDB.open('warehouse', 1);
        req.onsuccess = () => {
          const store = req.result.transaction('slots', 'readwrite').objectStore('slots');
          const get = store.get('autosave');
          get.onsuccess = () => {
            const record = get.result;
            record.game.anchor -= 10 * 3600 * 1000;
            store.put(record).onsuccess = () => resolve(record.tick);
          };
        };
      })`),
    );
    await side.close();
    const back = await context.newPage();
    const backCdp = await context.newCDPSession(back);
    await backCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reopened = Date.now();
    await back.goto(URL);
    await back.getByTestId('recap').waitFor({ timeout: 20_000 });
    const reopenMs = Date.now() - reopened;
    await backCdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('10 hours away: reopens to the recap inside 2 s (CPU slowed 4x)', reopenMs < 2000, `${reopenMs} ms from opening to the recap, saved at tick ${shifted} (was ${ticksBefore})`);
    const lines = await back.getByTestId('recap').locator('li').allTextContents();
    check('the recap is three lines', lines.length === 3, lines.join(' | '));
    // At 5 warehouse minutes a second (W9) the 8-hour cap's ticks are 1 h 36 m of real time: 20 warehouse days.
    check('the recap says the offline cap stopped it after 20 warehouse days', /ran for 1h 36m .*at most 20 warehouse days/.test(lines[0] ?? ''), lines[0] ?? '');
    await back.getByTestId('collect').tap();
    await back.getByTestId('recap').waitFor({ state: 'detached', timeout: 2000 });
    check('one tap collects and closes the recap', (await back.getByTestId('recap').count()) === 0);

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
