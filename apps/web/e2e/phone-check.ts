/**
 * The phone check (docs/ROADMAP.md, phone UX budget), in headless Chromium
 * sized as a 360 px phone with touch. Builds nothing: run `npm run build`
 * first, then `npm run e2e --workspace web`. Not in CI (it needs a Chromium
 * binary); results are recorded in docs/PROGRESS.md.
 *
 * Checks: installable; a new warehouse opens; no horizontal scroll at 360 px on
 * every screen and sheet; every button at least 44 px; the Upgrades button in
 * the bottom third; the first upgrade bought within 10 s; a tap rushes a dock;
 * 60 fps with eight docks animating and the CPU slowed 4x; export a file,
 * clear site data, import it and the same warehouse resumes; reopens offline.
 * Slice 4: closed for 3 hours (the autosave's clock moved back), it reopens on
 * a CPU slowed 4x inside the 2 s budget, runs only the 2-hour offline cap, and
 * shows a three-line recap that one tap collects.
 * Slice 5: a warehouse worth stars sells from the bottom bar in two taps and
 * opens Port Calder with its twist and the stars.
 * Star perks (RULES 10a): the stars button opens the perks, marking the two the
 * sale unlocks; the sell sheet names them; Port Calder opens with two docks.
 * The floor: a new warehouse shows the inbound dock, quality check, the
 * storage racks (floor pick and reserve), the order desk, picking and the
 * staging lanes with goods moving through them, and the dashboard; reach
 * trucks replenish the floor pick locations in the busy warehouse;
 * cross-border contracts add export paperwork, overseas ones customs; the 60
 * fps check runs with the goods moving.
 * The backlog: a new warehouse has none; picking is a big tap target and a
 * tap sends extra pickers; the busy warehouse's real backlog waits on the
 * order board, its six pickers shown, and the bottleneck names it. The inbound dock
 * is a tap target too and a tap sends extra hands. The testing time skip runs
 * an hour at once and recaps it.
 * The WMS is home (W7): the app opens on the live floor with every picker
 * on it, Docks and Upgrades in the bottom third, the plan one tap away and
 * a change to it applied by the sim, 60 fps on the floor with the CPU
 * slowed 4x; the checks of the docks screen follow from the Docks button.
 * Boosts: a new warehouse has Flash sale ready and the other two locked, in
 * the bottom third; a tap starts Flash sale with a countdown; the eight-dock
 * warehouse runs All hands (every dock glows) and Peak rates (boosted
 * income in gold) during the 60 fps check.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { busyWarehouse } from '../../../packages/harness/src/warehouse.ts';
import { WAREHOUSE_TUNABLES, WarehouseSession, hashState } from '@warehouse/sim';

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

/** From the WMS home (W7) to the docks screen. */
async function toDocks(page: Page, first = 'dock-0'): Promise<void> {
  await page.getByTestId('open-docks').tap();
  await page.getByTestId(first).waitFor({ timeout: 8000 });
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

/** A file holding an 8-dock warehouse, made with the sim itself, anchored at `now`. */
function busyFile(dir: string, earned = 0): { path: string; hash: string } {
  const busy = busyWarehouse();
  // A test fixture: a warehouse that has earned enough to be worth stars.
  const state = earned === 0 ? busy : { ...busy, run: { ...busy.run, earned }, life: { ...busy.life, earned } };
  const session = new WarehouseSession(state);
  const game = { save: session.save({ compact: true }), anchor: Date.now() };
  const path = join(dir, `busy-${earned}.json`);
  writeFileSync(path, JSON.stringify({ format: 'warehouse-idle-save', version: 1, exportedAt: Date.now(), game }));
  return { path, hash: hashState(state) };
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
    const opened = Date.now();
    await page.goto(URL);
    await page.getByTestId('wms-floor').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await context.newCDPSession(page);
    const installErrors = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
    check('installable (manifest + service worker)', installErrors.installabilityErrors.length === 0, JSON.stringify(installErrors.installabilityErrors));

    // The WMS is home (W7).
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-pickers') ?? 0) > 0, undefined, { timeout: 5000 }).catch(() => undefined);
    const pickers = Number(await page.getByTestId('wms-floor-canvas').getAttribute('data-pickers'));
    check('the app opens on the WMS floor, every picker on it', (await page.getByTestId('wms-tab-floor').getAttribute('aria-selected')) === 'true' && pickers === 6, `${pickers} pickers`);
    await noHorizontalScroll(page, 'WMS home');
    await touchTargets(page, 'WMS home');
    for (const id of ['open-docks', 'open-upgrades']) {
      const b = await page.getByTestId(id).boundingBox();
      check(`${id} in the bottom third of the WMS home`, b !== null && b.y + b.height / 2 >= (HEIGHT * 2) / 3, `centre at ${Math.round((b?.y ?? 0) + (b?.height ?? 0) / 2)}`);
    }
    await toDocks(page);

    check('a new warehouse opens with one dock', (await page.locator('.dock:not(.dock-next)').count()) === 1);
    check('the next dock shows as something to aim for', (await page.getByTestId('next-dock').count()) === 1);
    check('cash shows at the top', /\$/.test((await page.getByTestId('cash').textContent()) ?? ''));
    const outbound = (await page.getByTestId('picking').textContent()) ?? '';
    const inbound = (await page.getByTestId('lane-inbound').textContent()) ?? '';
    check('the floor shows the inbound dock through QC, the racks, picking from the order desk, and a staging lane per dock', /Picking.*Orders.*Floor pick.*Reserve/.test(outbound) && /PO.*QC/.test(inbound) && (await page.locator('.rack').count()) === 3 && (await page.locator('.stage-lane').count()) === 1 && (await page.locator('[data-booth="export"]').count()) === 0, `${outbound} | ${inbound}`);
    check('a new warehouse has no backlog', ((await page.getByTestId('backlog').textContent()) ?? '') === 'No backlog', (await page.getByTestId('backlog').textContent()) ?? '');
    check('the first PO is at the inbound dock and the racks are half full', /^PO #1 · /.test((await page.getByTestId('po').textContent()) ?? '') && /^\d+\/144$/.test((await page.getByTestId('stock').textContent()) ?? ''), `${await page.getByTestId('po').textContent()} | ${await page.getByTestId('stock').textContent()}`);
    const tiles = await page.getByTestId('dashboard').locator('dt').allTextContents();
    check('the dashboard shows shipped, per minute, backlog and stock', tiles.join(',') === 'Shipped,Per min,Backlog,Stock' && /%$/.test((await page.getByTestId('kpi-stock').locator('dd').textContent()) ?? ''), tiles.join(','));
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="flow-dots"]')?.getAttribute('data-dots') ?? 0) > 0, undefined, { timeout: 5000 }).catch(() => undefined);
    const walking = Number(await page.getByTestId('flow-dots').getAttribute('data-dots'));
    check('goods move across the floor', walking > 0, `${walking} moving`);
    await noHorizontalScroll(page, 'warehouse');
    await touchTargets(page, 'warehouse');
    const upgradesBox = await page.getByTestId('open-upgrades').boundingBox();
    const centre = upgradesBox === null ? -1 : upgradesBox.y + upgradesBox.height / 2;
    check('Upgrades button in the bottom third', centre >= (HEIGHT * 2) / 3, `centre at ${Math.round(centre)} of ${HEIGHT}`);

    // The first upgrade within 10 s of opening.
    await page.getByTestId('open-upgrades').tap();
    await page.getByTestId('upgrades').waitFor();
    await noHorizontalScroll(page, 'upgrade sheet');
    await touchTargets(page, 'upgrade sheet');
    const buy = page.getByTestId('buy-loading');
    await page.waitForFunction(() => !(document.querySelector('[data-testid="buy-loading"]') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 });
    await buy.tap();
    await page.getByTestId('upgrade-loading').getByText('Lv 1').waitFor({ timeout: 2000 });
    const firstUpgradeSec = (Date.now() - opened) / 1000;
    check('first upgrade bought within 10 s', firstUpgradeSec <= 10, `${firstUpgradeSec.toFixed(1)} s from opening`);
    const sheetBox = await buy.boundingBox();
    check('buy buttons sit in the bottom sheet', sheetBox !== null && sheetBox.y > HEIGHT / 3, `y ${Math.round(sheetBox?.y ?? -1)}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();

    // A tap rushes the dock.
    await page.getByTestId('dock-0').tap();
    await page.waitForTimeout(350);
    check('a tap rushes the dock', (await page.getByTestId('dock-0').getAttribute('class'))?.includes('rushing') === true);
    const cashBefore = await cashCents(page);
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('dock-0').tap();
      await page.waitForTimeout(250);
    }
    check('shipments pay as the trucks leave', (await cashCents(page)) > cashBefore, `${cashBefore} -> ${await cashCents(page)} cents`);

    // The backlog (RULES 3, 6): a big tap target in the middle of the screen; a tap sends extra pickers.
    const secBox = await page.getByTestId('picking').boundingBox();
    check('picking (the board and the racks) is a big tap target', secBox !== null && secBox.height >= 60 && secBox.width >= 300, `${Math.round(secBox?.width ?? 0)}x${Math.round(secBox?.height ?? 0)}`);
    await page.getByTestId('picking').tap();
    await page.waitForTimeout(350);
    check('a tap on picking sends extra pickers', ((await page.getByTestId('picking').getAttribute('class')) ?? '').includes('rushed') && (await page.locator('.picker-extra').isVisible()));

    // Receiving (RULES 3a, 6): a tap target across the screen; a tap sends extra hands.
    const inBox = await page.getByTestId('receiving').boundingBox();
    check('the inbound dock is a tap target', inBox !== null && inBox.height >= 44 && inBox.width >= 300, `${Math.round(inBox?.width ?? 0)}x${Math.round(inBox?.height ?? 0)}`);
    await page.getByTestId('receiving').tap();
    await page.waitForTimeout(350);
    check('a tap on receiving sends extra hands', ((await page.getByTestId('receiving').getAttribute('class')) ?? '').includes('rushed'));

    // Boosts (RULES 15): Flash sale ready from the start, the others locked; one tap starts it.
    const boostClass = async (id: string): Promise<string> => (await page.getByTestId(`boost-${id}`).getAttribute('class')) ?? '';
    check('Flash sale is ready, All hands and Peak rates are locked', (await boostClass('flashSale')).includes('boost-ready') && (await boostClass('allHands')).includes('boost-locked') && (await boostClass('surge')).includes('boost-locked'));
    const boostBox = await page.getByTestId('boost-flashSale').boundingBox();
    check('boosts in the bottom third', boostBox !== null && boostBox.y >= HEIGHT / 2 && boostBox.y + boostBox.height / 2 >= (HEIGHT * 2) / 3, `centre at ${Math.round((boostBox?.y ?? 0) + (boostBox?.height ?? 0) / 2)}`);
    await page.getByTestId('boost-flashSale').tap();
    await page.waitForTimeout(600);
    const rushStatus = (await page.getByTestId('boost-flashSale').locator('.boost-status').textContent()) ?? '';
    check('a tap starts Flash sale, counting down from a minute', (await boostClass('flashSale')).includes('boost-running') && /^(1m 0s|5\ds)$/.test(rushStatus), rushStatus);
    check('starting a boost says what it does', /Flash sale! 3x orders/.test((await page.locator('.toast').textContent()) ?? ''));

    // Settings: export, clear site data, import a busy warehouse file.
    await page.getByTestId('settings').tap();
    await page.getByTestId('stats').waitFor();
    await noHorizontalScroll(page, 'settings sheet');
    await touchTargets(page, 'settings sheet');
    check('sound is off by default', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'false');
    await page.getByTestId('sound').tap();
    check('sound turns on with one tap', (await page.getByTestId('sound').getAttribute('aria-checked')) === 'true');
    await page.getByTestId('sound').tap();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').tap()]);
    check('export downloads a save file', /^warehouse-tick-\d+\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();

    // Back on the WMS home: its floor runs at 60 fps, and the plan is one tap away (W7).
    await page.getByTestId('open-wms').tap();
    await page.getByTestId('wms-floor').waitFor();
    await page.waitForTimeout(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const floorFps = await measureFps(page, 4000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps on the WMS floor (CPU slowed 4x)', floorFps.frames >= 55, `${floorFps.frames.toFixed(1)} fps, worst frame ${floorFps.worst.toFixed(0)} ms`);
    await page.getByTestId('wms-plan-chip').tap();
    await page.getByTestId('wms-plan').waitFor();
    await noHorizontalScroll(page, 'WMS plan');
    await touchTargets(page, 'WMS plan');
    await page.getByTestId('plan-pick-nearest').tap();
    await page.getByTestId('plan-crew-more').tap();
    await page.getByTestId('wms-tab-floor').tap();
    await page.waitForFunction(() => /Nearest bin.*7 pick \/ 2 receive/.test(document.querySelector('[data-testid="wms-plan-chip"]')?.textContent ?? ''), undefined, { timeout: 4000 }).catch(() => undefined);
    const plan = (await page.getByTestId('wms-plan-chip').textContent()) ?? '';
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="wms-floor-canvas"]')?.getAttribute('data-pickers') ?? 0) === 7, undefined, { timeout: 4000 }).catch(() => undefined);
    check('the plan changes in two taps and the floor shows it: nearest bin, seven pickers', /Nearest bin.*7 pick \/ 2 receive/.test(plan) && Number(await page.getByTestId('wms-floor-canvas').getAttribute('data-pickers')) === 7, plan);

    await cdp.send('Storage.clearDataForOrigin', { origin: new globalThis.URL(URL).origin, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
    await page.reload();
    await page.getByTestId('wms-floor').waitFor();
    await toDocks(page);
    check('site data cleared: a fresh warehouse opens', (await page.locator('.dock:not(.dock-next)').count()) === 1);
    const busy = busyFile(profile);
    await page.getByTestId('settings').tap();
    await page.getByTestId('import-file').setInputFiles(busy.path);
    await page.getByTestId('dock-7').waitFor({ timeout: 5000 });
    check('import resumes the exported warehouse (8 docks)', (await page.locator('.dock:not(.dock-next)').count()) === 8);
    check('a cross-border contract adds export paperwork', (await page.locator('.staging [data-booth="export"]').count()) === 1 && (await page.locator('[data-booth="customs"]').count()) === 0);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="flow-dots"]')?.getAttribute('data-queued') ?? 0) > 5, undefined, { timeout: 5000 }).catch(() => undefined);
    const lineText = (await page.getByTestId('backlog').textContent()) ?? '';
    const queued = Number(await page.getByTestId('flow-dots').getAttribute('data-queued'));
    check('the busy warehouse queues at picking: the real backlog waits on the order board', /waiting/.test(lineText) && queued > 5 && /picking/.test(((await page.getByTestId('bottleneck').textContent()) ?? '').toLowerCase()), `${lineText}, ${queued} tickets on the board`);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="flow-dots"]')?.getAttribute('data-replens') ?? 0) > 0, undefined, { timeout: 8000 }).catch(() => undefined);
    const replens = Number(await page.getByTestId('flow-dots').getAttribute('data-replens'));
    check('reach trucks replenish the floor pick locations from reserve', replens > 0, `${replens} out`);
    check('pickers show as picker figures, and staging has a lane per dock', (await page.locator('.picker:not(.picker-extra)').count()) === 6 && (await page.locator('.stage-lane').count()) === 8);
    await noHorizontalScroll(page, 'eight docks');
    await touchTargets(page, 'eight docks');
    await page.getByTestId('boost-allHands').tap();
    await page.getByTestId('boost-surge').tap();
    await page.waitForTimeout(400);
    const glowing = await page.locator('.dock.rushing').count();
    check('All hands rushes every dock with no taps', glowing === 8, `${glowing} of 8 docks rushing`);
    const income = page.getByTestId('income');
    check('Peak rates shows the boosted income in gold', ((await income.getAttribute('class')) ?? '').includes('income-boosted') && /⚡/.test((await income.textContent()) ?? ''), (await income.textContent()) ?? '');

    // 60 fps with eight docks animating, departures, pops and a thumb tapping, the CPU slowed 4x.
    await page.waitForTimeout(500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const tapping = (async () => {
      for (let i = 0; i < 12; i++) {
        await page.getByTestId(`dock-${i % 8}`).tap();
        await page.waitForTimeout(300);
      }
    })();
    const fps = await measureFps(page, 5000);
    await tapping;
    const crowd = Number(await page.getByTestId('flow-dots').getAttribute('data-dots'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('60 fps with eight docks, goods moving, two boosts running, tapping (CPU slowed 4x)', fps.frames >= 55 && crowd > 0, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms, ${crowd} dots moving`);

    // Offline: the installed app reopens and continues from the autosave.
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('wms-floor').waitFor({ timeout: 8000 });
    await toDocks(page, 'dock-7');
    check('reopens offline and continues the warehouse', (await page.locator('.dock:not(.dock-next)').count()) === 8);
    await context.setOffline(false);

    // Away for 3 hours: close the app, move the autosave's wall clock back, reopen on a slow CPU.
    const ticksBefore = Number(await page.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('warehouse', 1);
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
      const req = indexedDB.open('warehouse', 1);
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
      const req = indexedDB.open('warehouse', 1);
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

    // Selling: a warehouse that has earned 9 star units ($5.4M) is worth 3 stars.
    const worth = busyFile(profile, 9 * WAREHOUSE_TUNABLES.starUnitCents.value);
    await back.getByTestId('settings').tap();
    await back.getByTestId('import-file').setInputFiles(worth.path);
    await back.getByTestId('open-sell').waitFor({ timeout: 5000 });
    // The warehouse before the import may already offer a sale of its own: wait for the imported one's.
    await back.waitForFunction(() => (document.querySelector('[data-testid="open-sell"]')?.textContent ?? '').includes('+3'), undefined, { timeout: 5000 }).catch(() => undefined);
    check('the bottom bar offers the sale', ((await back.getByTestId('open-sell').textContent()) ?? '').includes('+3'), (await back.getByTestId('open-sell').textContent()) ?? '');
    await touchTargets(back, 'bottom bar with sell');
    await noHorizontalScroll(back, 'bottom bar with sell');
    await back.getByTestId('open-stars').tap();
    await back.getByTestId('perks').waitFor();
    await noHorizontalScroll(back, 'stars sheet');
    await touchTargets(back, 'stars sheet');
    const soon = await back.locator('.perk.soon').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    check('the stars sheet lists five perks and marks the two the sale unlocks', (await back.locator('.perk').count()) === 5 && soon.join(',') === 'perk-headStart,perk-secondDock', soon.join(','));
    await back.getByTestId('stars-sell').tap();
    await back.getByTestId('sell-worth').waitFor();
    await noHorizontalScroll(back, 'sell sheet');
    await touchTargets(back, 'sell sheet');
    check('the sell sheet names the next site', ((await back.getByTestId('next-site').textContent()) ?? '') === 'Port Calder Docks');
    check('the sell sheet names the perks it unlocks', /Head start.*Second dock/.test((await back.getByTestId('sell-perks').textContent()) ?? ''), (await back.getByTestId('sell-perks').textContent()) ?? '');
    await back.getByTestId('confirm-sell').tap();
    await back.getByTestId('site-twist').waitFor({ timeout: 3000 });
    check('Port Calder opens with its twist', /Narrow yard/.test((await back.getByTestId('site-twist').textContent()) ?? ''));
    await back.getByTestId('open-site').tap();
    await toDocks(back);
    const owned = (await back.getByTestId('open-stars').textContent()) ?? '';
    check('the new warehouse has the stars, two docks (Second dock) and cash (Head start)', /Port Calder Docks/.test((await back.getByTestId('site').textContent()) ?? '') && owned.trim() === '★ 3' && (await back.locator('.dock:not(.dock-next)').count()) === 2 && (await cashCents(back)) >= WAREHOUSE_TUNABLES.perkHeadStartCents.value, owned);

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
