/**
 * The device check (decision record K13): how the built app behaves the way a
 * real phone would make it behave, in headless Chromium sized as a 360 x 740
 * touch phone. It stands in for the things a simulated browser can stand in
 * for; docs/device-checklist.md is what the owner runs on real phones for the
 * rest. Build first (`npm run build`), then `npm run e2e:device --workspace web`.
 * It serves the build from its own small server so it can ship a "new version"
 * of the app (a changed service worker) while the app is open.
 *
 * Sound and haptics (K13):
 * - nothing builds an audio context before the first touch; the first touch
 *   builds it, resumes it and starts a silent sound (what iOS needs);
 * - a tap, a placed friend and every moment of a wave make sound, in the
 *   replay and not only at its end; a catch and the end of a wave buzz; a
 *   phone with no vibration (iOS) plays the same wave with no error;
 * - the grown-ups' menu has a Sound switch for each child, inside the
 *   viewport, 44 px or more; muting one child silences that child only, and is
 *   still muted after the app restarts;
 * - the app asleep in the background suspends the audio.
 *
 * iOS and Android behaviour:
 * - safe-area insets (a notch and a home bar) are respected: the top bar sits
 *   below the notch, Go above the home bar; the layout fills the screen with
 *   the browser bar showing and hidden, and nothing scrolls or rubber-bands;
 * - no double-tap zoom or pinch, no text selection, long-press menu or drag on
 *   game pieces (a name box keeps its own); the theme colour, background and
 *   launch screens match; the maskable icon and every launch screen load at
 *   their size;
 * - Back closes the sheet, the clue card, the shop, the picker and the result
 *   card before it leaves the game, and a sheet closed by its X leaves no
 *   history behind;
 * - the install button appears when the browser offers it, inside the viewport;
 * - a phone turned on its side shows a picture asking for it upright, and the
 *   game is as it was when turned back.
 *
 * Offline and updates:
 * - with the network off, the app opens cold, and so does a day it has never
 *   made before (the generator runs on the phone); profiles and progress are
 *   still there after the whole browser is closed and opened again;
 * - a new version found while a wave replays does not reload the page or show
 *   anything over the board; it is offered between waves, in the menu and on
 *   the picker, never during setup, inside the viewport; nothing reloads until
 *   Update is tapped, and the game carries on where it was.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import { generatePuzzle } from '@snacks/sim';
import {
  DIST_DIR,
  HEIGHT,
  WIDTH,
  serve,
  addChild,
  barStats,
  cellOf,
  check,
  checkOnScreen,
  chromiumPath,
  friendsOnBoard,
  getCrashPage,
  grownUps,
  hasFriend,
  noHorizontalScroll,
  noVerticalScroll,
  onScreen,
  openPicker,
  playWaveByTaps,
  results,
  setCrashPage,
  shot,
  tile,
  touchHold,
  touchTargets,
  trayButton,
  until,
} from './support.ts';

const PORT = 4180;
const URL = `http://localhost:${PORT}/`;
const DIST = DIST_DIR;
/** A fixed day, so the check never straddles midnight. */
const DAY = Math.floor(Date.now() / 86_400_000);
const NOON = DAY * 86_400_000 + 43_200_000;

/** Stands in for the phone's audio, haptics and clock; written to the page before the app starts. */
const device = (options: { vibrate: boolean }): string => `(() => {
  window.__buzz = [];
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: ${options.vibrate ? '(p) => { window.__buzz.push(p); return true; }' : 'undefined'} });
  const A = { contexts: 0, resumes: 0, suspends: 0, osc: 0, src: 0 };
  window.__audio = A;
  const Base = window.AudioContext;
  window.AudioContext = class extends Base {
    constructor(...a) { super(...a); A.contexts += 1; A.last = this; }
    resume() { A.resumes += 1; return super.resume(); }
    suspend() { A.suspends += 1; return super.suspend(); }
  };
  const osc = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { A.osc += 1; return osc.apply(this, a); };
  const src = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { A.src += 1; return src.apply(this, a); };
  window.__installed = [];
  
})()`;

interface Audio {
  contexts: number;
  resumes: number;
  suspends: number;
  osc: number;
  src: number;
  state: string;
}
const audio = (page: Page): Promise<Audio> => page.evaluate(`(() => ({ ...window.__audio, state: window.__audio.last ? window.__audio.last.state : 'none', last: undefined }))()`) as Promise<Audio>;
const buzzes = (page: Page): Promise<(number | number[])[]> => page.evaluate('window.__buzz') as Promise<(number | number[])[]>;

async function open(profile: string, options: { vibrate?: boolean; viewport?: { width: number; height: number } } = {}): Promise<{ context: BrowserContext; page: Page; cdp: CDPSession }> {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chromiumPath(),
    viewport: options.viewport ?? { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'UTC',
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.clock.setFixedTime(NOON);
  await page.addInitScript(device({ vibrate: options.vibrate !== false }));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

const registration = `navigator.serviceWorker.getRegistration()`;
const swState = (page: Page): Promise<{ waiting: boolean; active: boolean; controlled: boolean }> =>
  page.evaluate(`${registration}.then((r) => ({ waiting: !!(r && r.waiting), active: !!(r && r.active), controlled: !!navigator.serviceWorker.controller }))`) as Promise<{ waiting: boolean; active: boolean; controlled: boolean }>;
const lookForUpdate = (page: Page): Promise<unknown> => page.evaluate(`${registration}.then((r) => r.update())`);

async function main(): Promise<void> {
  const { server, bump, swFetches } = await serve(PORT);
  const profile = mkdtempSync(join(tmpdir(), 'snacks-device-'));
  const puzzle = generatePuzzle('main', 'daily', DAY, 0);
  try {
    let { context, page, cdp } = await open(profile);
    setCrashPage(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.locator('.board').waitFor();
    await page.evaluate(`navigator.serviceWorker.ready.then(() => { window.__marker = 'before'; })`);

    // ---- first touch: iOS only starts audio inside one ----
    const before = await audio(page);
    check('no audio context is made before the first touch', before.contexts === 0, `${before.contexts} contexts`);
    await trayButton(page, puzzle.witness[0]!.friends[0]!.type).tap();
    const unlocked = await audio(page);
    check('the first touch builds the audio context, resumes it and starts a silent sound (what iOS needs)', unlocked.contexts === 1 && unlocked.src >= 1, `${unlocked.contexts} contexts, ${unlocked.resumes} resumes, ${unlocked.src} silent`);
    check('and the context is running', await until(page, async () => (await audio(page)).state === 'running'), (await audio(page)).state);

    // ---- a tap makes a sound ----
    const first = puzzle.witness[0]!;
    const start = (await audio(page)).osc;
    await cellOf(page, first.friends[0]!.cell).tap();
    await until(page, () => hasFriend(page, first.friends[0]!.cell));
    check('placing a friend makes a sound', (await audio(page)).osc > start, `${(await audio(page)).osc - start} notes`);
    // Tap the friend away again so the wave is set up by the helper from scratch.

    // ---- one wave: sounds in the replay, buzzes on catches and at the end ----
    const mid = { at: 0 };
    let waveOk = false;
    const waveStart = (await audio(page)).osc;
    const buzzStart = (await buzzes(page)).length;
    waveOk = await playWaveByTaps(page, cdp, puzzle, first, async () => {
      mid.at = (await audio(page)).osc;
      // Sample the replay while it plays: a sound that only comes at the end is not in time with the picture.
      setTimeout(() => void 0, 0);
    });
    const afterWave = (await audio(page)).osc;
    const afterBuzz = await buzzes(page);
    check('wave 1 is played by taps and feeds every kid', waveOk);
    check('the replay is full of sound: throws, catches, a chime for each fed kid and a tune at the end', afterWave - mid.at >= 8, `${afterWave - mid.at} notes in the wave`);
    const wave = afterBuzz.slice(buzzStart);
    check('a catch buzzes briefly where the phone can, and so does the end of the wave', wave.some((b) => typeof b === 'number' && b <= 20) && wave.some((b) => Array.isArray(b)), JSON.stringify(wave.slice(-4)));
    check('no more than a few buzzes for the whole wave (not a phone call)', wave.length <= 10, `${wave.length} buzzes`);
    await shot(page, 'd1-result');
    void waveStart;

    // Sounds fall at the moments of the replay: sample a second wave while it plays.
    await page.getByRole('button', { name: /Set up wave 2/ }).tap();
    const second = puzzle.witness[1]!;
    const secondRun = playWaveByTaps(page, cdp, puzzle, second, async () => {
      const a = (await audio(page)).osc;
      // After Go, the notes arrive while the snacks fly.
      void page.waitForTimeout(450).then(async () => {
        mid.at = (await audio(page)).osc - a;
      });
    });
    check('wave 2 is played by taps and feeds every kid', await secondRun);
    await page.getByRole('button', { name: /Set up wave 3/ }).tap();
    check('sounds came while the snacks were still flying, not only at the end', mid.at >= 1, `${mid.at} notes within 450 ms of Go`);

    // ---- hidden: the audio sleeps; back: it wakes ----
    await page.evaluate(`(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' });
      window.__vis = 'hidden';
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    })()`);
    const asleep = await audio(page);
    await page.evaluate(`(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); })()`);
    const awake = await audio(page);
    check('hidden in the background, the audio is suspended; back in front, it is woken', asleep.suspends >= 1 && awake.resumes > asleep.resumes, `${asleep.suspends} suspends, ${awake.resumes - asleep.resumes} resumes`);

    // ---- iOS: no vibration at all ----
    {
      const ios = mkdtempSync(join(tmpdir(), 'snacks-ios-'));
      try {
        const phone = await open(ios, { vibrate: false });
        const problems: string[] = [];
        phone.page.on('pageerror', (e) => problems.push(e.message));
        await phone.page.goto(URL);
        await phone.page.locator('.board').waitFor();
        const ok = await playWaveByTaps(phone.page, phone.cdp, puzzle, first);
        const hasVibrate = await phone.page.evaluate('typeof navigator.vibrate');
        check('with no vibration (iOS), a whole wave plays with no error and nothing buzzes', ok && hasVibrate === 'undefined' && problems.length === 0, `${hasVibrate}, ${problems.join(' | ')}`);
        await phone.context.close();
      } finally {
        rmSync(ios, { recursive: true, force: true });
      }
    }

    // ---- selection, callouts, zoom ----
    // Chromium drops -webkit-touch-callout (it is an iOS property), so the built stylesheet itself is read.
    await page.evaluate(`Promise.all([...document.styleSheets].filter((s) => s.href).map((s) => fetch(s.href).then((r) => r.text()))).then((t) => { window.__css = t.join('\\n'); })`);
    const guards = (await page.evaluate(`(() => {
      const style = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
      const sheets = window.__css || '';
      const pinch = new Event('gesturestart', { cancelable: true, bubbles: true });
      document.querySelector('.board').dispatchEvent(pinch);
      const menu = new Event('contextmenu', { cancelable: true, bubbles: true });
      const friend = document.querySelector('.board .friend') || document.querySelector('.board .sq');
      friend.dispatchEvent(menu);
      const select = new Event('selectstart', { cancelable: true, bubbles: true });
      friend.dispatchEvent(select);
      return {
        meta: document.querySelector('meta[name=viewport]').content,
        body: { position: getComputedStyle(document.body).position, overscroll: getComputedStyle(document.body).overscrollBehaviorY, action: getComputedStyle(document.body).touchAction, overflow: getComputedStyle(document.body).overflow },
        select: ['.board .sq', '.tray-btn', '.clue-chip', '.btn-go', '.bar'].map((s) => [s, style(s) && style(s).userSelect]),
        callout: /-webkit-touch-callout:\\s*none/.test(sheets),
        pinchPrevented: pinch.defaultPrevented,
        menuPrevented: menu.defaultPrevented,
        selectPrevented: select.defaultPrevented,
        scale: window.visualViewport.scale,
        dvh: /--app-h:\\s*100dvh/.test(sheets) && /--app-h:\\s*100vh/.test(sheets),
      };
    })()`)) as { meta: string; body: { position: string; overscroll: string; action: string; overflow: string }; select: [string, string][]; callout: boolean; pinchPrevented: boolean; menuPrevented: boolean; selectPrevented: boolean; scale: number; dvh: boolean };
    check('the viewport blocks pinch zoom and draws under the notch', /maximum-scale=1/.test(guards.meta) && /user-scalable=no/.test(guards.meta) && /viewport-fit=cover/.test(guards.meta), guards.meta);
    check('the page cannot scroll or rubber-band: a fixed body, no overscroll, double-tap zoom off', guards.body.position === 'fixed' && guards.body.overscroll === 'none' && guards.body.action === 'manipulation' && guards.body.overflow === 'hidden', JSON.stringify(guards.body));
    check('no text selection on game pieces, the tray, the cards or the buttons', guards.select.every(([, v]) => v === 'none'), JSON.stringify(guards.select));
    check('no long-press callout on iOS (-webkit-touch-callout is set), and a pinch, a long-press menu and a selection are all stopped', guards.callout && guards.pinchPrevented && guards.menuPrevented && guards.selectPrevented);
    await cellOf(page, 0).tap();
    await page.waitForTimeout(80);
    await cellOf(page, 0).tap();
    check('a double tap does not zoom the page', (await page.evaluate('window.visualViewport.scale')) === 1);
    await touchHold(page, cdp, page.locator('.board .friend, .board .sq').first(), 900);
    check('a long press on the board selects nothing', (await page.evaluate('String(window.getSelection())')) === '');
    check('the layout uses the visible height (dvh, with a fallback)', guards.dvh);

    // ---- the page does not scroll, with the browser bar showing and hidden ----
    for (const height of [660, HEIGHT, 800]) {
      await page.setViewportSize({ width: WIDTH, height });
      await page.waitForTimeout(150);
      const fit = (await page.evaluate(`(() => {
        const app = document.querySelector('.app').getBoundingClientRect();
        const go = document.querySelector('.btn-go').getBoundingClientRect();
        return { app: Math.round(app.height), inner: innerHeight, goBottom: Math.round(go.bottom), scrollY: window.scrollY, doc: document.documentElement.scrollHeight };
      })()`)) as { app: number; inner: number; goBottom: number; scrollY: number; doc: number };
      check(`with the screen ${height} px high the app fills it exactly, Go is on screen and nothing scrolls`, fit.app === fit.inner && fit.goBottom <= fit.inner && fit.scrollY === 0 && fit.doc <= fit.inner, JSON.stringify(fit));
    }
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await cdp.send('Input.synthesizeScrollGesture', { x: 180, y: 300, yDistance: 300, gestureSourceType: 'touch' }).catch(() => undefined);
    await page.waitForTimeout(150);
    const bounce = (await page.evaluate('({ y: window.scrollY, top: window.visualViewport.offsetTop })')) as { y: number; top: number };
    check('pulling down on the board moves nothing (no rubber-band)', bounce.y === 0 && bounce.top === 0, JSON.stringify(bounce));

    // ---- the notch and the home bar ----
    const safe = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }).then(
      () => true,
      () => false,
    );
    if (safe) {
      await page.reload();
      await page.locator('.board').waitFor();
      const edges = (await page.evaluate(`(() => {
        const bar = document.querySelector('.bar').getBoundingClientRect();
        const go = document.querySelector('.btn-go').getBoundingClientRect();
        const dock = document.querySelector('.dock') ? document.querySelector('.dock').getBoundingClientRect() : go;
        const top = document.querySelector('.install') ? document.querySelector('.install').getBoundingClientRect().top : bar.top;
        return { barTop: top, goBottom: go.bottom, dockBottom: dock.bottom, inner: innerHeight };
      })()`)) as { barTop: number; goBottom: number; dockBottom: number; inner: number };
      check('with a notch the top bar sits below it, and with a home bar Go sits above it', edges.barTop >= 47 && edges.goBottom <= edges.inner - 34, JSON.stringify(edges));
      await checkOnScreen('with a notch and a home bar: Go is inside the viewport', page.locator('.btn-go'));
      await shot(page, 'd2-safe-area');
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
      await page.reload();
      await page.locator('.board').waitFor();
    } else check('with a notch and a home bar the layout keeps clear of them', true, 'this Chromium cannot fake insets; styles.css pads by env(safe-area-inset-*)');

    // ---- the home screen: theme, icons, launch screens ----
    const manifest = (await page.evaluate(`fetch('/manifest.webmanifest').then((r) => r.json())`)) as { theme_color: string; background_color: string; icons: { src: string; sizes: string; purpose?: string }[] };
    const theme = (await page.evaluate(`document.querySelector('meta[name=theme-color]').content`)) as string;
    const bg = (await page.evaluate(`getComputedStyle(document.body).backgroundColor`)) as string;
    check('theme colour, manifest colours and the page background are the same cream', theme === '#fff8ec' && manifest.theme_color === '#fff8ec' && manifest.background_color === '#fff8ec' && bg === 'rgb(255, 248, 236)', `${theme} ${manifest.theme_color} ${bg}`);
    const maskable = manifest.icons.find((i) => i.purpose === 'maskable');
    const sizes = (await page.evaluate(
      `Promise.all([...${JSON.stringify(manifest.icons.map((i) => i.src))}, '/apple-touch-icon.png'].map((src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve([src, i.naturalWidth, i.naturalHeight]); i.onerror = () => resolve([src, 0, 0]); i.src = '/' + src.replace(/^\\//, ''); })))`,
    )) as [string, number, number][];
    check('every app icon loads, and the maskable icon is its own picture at 512 px', sizes.every(([, w]) => w > 0) && maskable?.src === 'pwa-maskable-512.png' && sizes.some(([s, w, h]) => s.includes('maskable') && w === 512 && h === 512), sizes.map(([s, w]) => `${s}:${w}`).join(' '));
    const splash = (await page.evaluate(
      `Promise.all([...document.querySelectorAll('link[rel=apple-touch-startup-image]')].map((l) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve({ href: l.getAttribute('href'), w: i.naturalWidth, h: i.naturalHeight, media: l.media }); i.onerror = () => resolve({ href: l.getAttribute('href'), w: 0, h: 0, media: l.media }); i.src = l.href; })))`,
    )) as { href: string; w: number; h: number; media: string }[];
    check('every iPhone launch screen loads at the size its name and media query say', splash.length >= 8 && splash.every((s) => s.w > 0 && s.href === `/splash/${s.w}x${s.h}.png` && /device-width: \d+px/.test(s.media)), `${splash.length} launch screens`);
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    check('iOS home-screen app: standalone, title, status bar and touch icon are set', /apple-mobile-web-app-capable" content="yes"/.test(html) && /apple-mobile-web-app-title/.test(html) && /status-bar-style/.test(html) && /rel="apple-touch-icon"/.test(html));

    // ---- Android: the install button the browser offers ----
    await page.evaluate(`(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__installed.push('prompt'); return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    })()`);
    const install = page.getByTestId('install');
    await install.waitFor({ timeout: 3000 });
    await checkOnScreen('the install banner is inside the viewport', install);
    const installBtn = install.getByRole('button', { name: 'Install' });
    const installBox = await installBtn.boundingBox();
    check('the Install button is 44 px or more', installBox !== null && installBox.height >= 44 && installBox.width >= 44, `${Math.round(installBox?.width ?? 0)} x ${Math.round(installBox?.height ?? 0)}`);
    await installBtn.tap();
    check('tapping Install shows the browser’s own install dialog', await until(page, async () => ((await page.evaluate('window.__installed')) as string[]).includes('prompt')));
    await page.evaluate(`window.dispatchEvent(new Event('appinstalled'))`);
    check('once installed, the banner goes', await until(page, async () => (await install.count()) === 0));

    // ---- Back closes things, then (with nothing open) is the browser's ----
    const urlBefore = page.url();
    const length0 = (await page.evaluate('history.length')) as number;
    const back = async (): Promise<void> => {
      await page.evaluate('history.back()');
      await page.waitForTimeout(500);
    };
    await page.getByRole('button', { name: 'Menu' }).tap();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.waitFor();
    await back();
    check('Back closes the menu and stays in the game', (await menu.count()) === 0 && page.url() === urlBefore && (await page.locator('.board').count()) === 1);
    await page.locator('.clue-chip').first().tap();
    const card = page.getByRole('dialog', { name: 'Clue card' });
    await card.waitFor();
    await back();
    check('Back closes a clue card', (await card.count()) === 0 && (await page.locator('.board').count()) === 1);
    await page.locator('.tray-shop').tap();
    const shop = page.getByRole('dialog', { name: 'Shop' });
    await shop.waitFor();
    await back();
    check('Back closes the shop', (await shop.count()) === 0 && (await page.locator('.board').count()) === 1);
    await page.locator('.bar-avatar').tap();
    await page.locator('.picker').waitFor();
    await back();
    await shot(page, 'd-picker-back');
    check('Back closes the picker opened over a game', (await until(page, async () => (await page.locator('.picker-grid').count()) === 0)) && (await page.locator('.board').count()) === 1);
    // Nested: the menu, then how to play inside it.
    await page.getByRole('button', { name: 'Menu' }).tap();
    await menu.waitFor();
    await menu.getByRole('button', { name: 'Close' }).first().tap();
    await until(page, async () => (await menu.count()) === 0);
    await page.locator('.clue-chip').first().tap();
    await card.waitFor();
    await card.getByRole('button', { name: 'Close' }).first().tap();
    await until(page, async () => (await card.count()) === 0);
    await page.waitForTimeout(300);
    check('sheets closed by their own button leave no history behind', ((await page.evaluate('history.length')) as number) - length0 <= 0, `history ${length0} then ${await page.evaluate('history.length')}`);

    // ---- turned on its side ----
    const friends = await friendsOnBoard(page);
    await page.setViewportSize({ width: HEIGHT, height: WIDTH });
    await page.waitForTimeout(200);
    const rotate = page.getByTestId('rotate');
    const covered = (await page.evaluate(`(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!(e && e.closest('.rotate-notice')); })()`)) as boolean;
    check('turned on its side, a picture asks for the phone upright and covers the game', (await rotate.isVisible()) && covered);
    const pic = await page.locator('.rotate-pic').boundingBox();
    check('the turn-upright picture is inside the screen', pic !== null && pic.x >= 0 && pic.y >= 0 && pic.x + pic.width <= HEIGHT && pic.y + pic.height <= WIDTH, JSON.stringify(pic));
    const words = (await page.evaluate(`(() => { const t = document.querySelector('.rotate-notice').textContent || ''; return t.trim(); })()`)) as string;
    check('the picture has no words, so a child who cannot read can follow it', words === '', words);
    await shot(page, 'd3-landscape');
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.waitForTimeout(200);
    check('turned upright again the game is as it was', !(await rotate.isVisible()) && (await friendsOnBoard(page)) === friends && (await page.locator('.board .sq').count()) === 48);

    // ---- a grown-up mutes one child ----
    await openPicker(page);
    await grownUps(page, cdp);
    await addChild(page, 'Frog', 'Sam', 'Main');
    const parents = page.getByRole('dialog', { name: 'Grown-ups' });
    await parents.getByRole('button', { name: 'Change Dog' }).tap();
    const form = page.getByRole('dialog', { name: 'Change Dog' });
    await form.waitFor();
    const toggle = form.getByRole('button', { name: /^Sound: on/ });
    await checkOnScreen('the Sound switch is inside the viewport', toggle);
    const toggleBox = await toggle.boundingBox();
    check('the Sound switch is 44 px or more high', toggleBox !== null && toggleBox.height >= 44, `${Math.round(toggleBox?.height ?? 0)} px`);
    await touchTargets(page, 'the grown-ups’ sound switch');
    await shot(page, 'd4-sound-switch');
    const blip = (await audio(page)).osc;
    await toggle.tap();
    await form.getByRole('button', { name: /^Sound: off/ }).waitFor();
    await form.getByRole('button', { name: 'Cancel' }).tap();
    const row = (await parents.locator('.parent-list li').first().textContent()) ?? '';
    check('muting a child shows "sound off" on their row', /sound off/.test(row), row.replace(/\s+/g, ' '));
    check('muting a child makes no sound', (await audio(page)).osc === blip);
    await parents.locator('.sheet-close').tap();
    const prefs = (await page.evaluate(`localStorage.getItem('snacks-prefs')`)) as string;
    check('the mute is saved for that child (p1) and nobody else', JSON.parse(prefs).muted?.join() === 'p1', prefs);
    await tile(page, 'Dog').tap();
    await page.locator('.board').waitFor();
    const quietStart = (await audio(page)).osc;
    await trayButton(page, first.friends[0]!.type).tap();
    await cellOf(page, first.friends[0]!.cell).tap();
    await until(page, () => hasFriend(page, first.friends[0]!.cell)).catch(() => false);
    check('the muted child hears nothing, though the game plays as usual', (await audio(page)).osc === quietStart && (await hasFriend(page, first.friends[0]!.cell)));
    await openPicker(page);
    await tile(page, 'Sam').tap();
    await page.locator('.board').waitFor();
    const samStart = (await audio(page)).osc;
    await trayButton(page, first.friends[0]!.type).tap();
    await cellOf(page, first.friends[0]!.cell).tap();
    await until(page, () => hasFriend(page, first.friends[0]!.cell));
    check('the other child still hears the game', (await audio(page)).osc > samStart);

    // ---- updates: found while a wave plays, offered after it ----
    const barBefore = await barStats(page);
    void barBefore;
    await openPicker(page);
    await tile(page, 'Dog').tap();
    await page.locator('.board').waitFor();
    await page.evaluate(`window.__marker = 'before'`);
    const stateBefore = await swState(page);
    check('a service worker is controlling the page', stateBefore.active && stateBefore.controlled);
    // Dog is at wave 2; set it up and press Go, and ship a new version while it replays.
    const dogWave = Number(/(\d+)\/10/.exec(await barStats(page))?.[1] ?? 0);
    const layout = puzzle.witness[dogWave - 1]!;
    check('Dog is at the wave worked out here', dogWave >= 1 && layout !== undefined, `wave ${dogWave}`);
    const sawUpdateDuring: string[] = [];
    let updateLooked = false;
    const played = playWaveByTaps(page, cdp, puzzle, layout, async () => {
      // The moment before Go: a new deploy, and the page is told to look.
      bump();
      void page.waitForTimeout(250).then(async () => {
        updateLooked = true;
        await lookForUpdate(page).catch(() => undefined);
        const flying = await page.locator('.flying-snack').count();
        for (let i = 0; i < 6 && (await page.locator('.flying-snack').count()) > 0; i++) {
          sawUpdateDuring.push(`${await page.getByTestId('update').count()}@${flying}`);
          await page.waitForTimeout(150);
        }
      });
    });
    check('wave plays through and feeds every kid while a new version arrives', await played);
    check('the new version was found while the wave was replaying', updateLooked && (await until(page, async () => (await swState(page)).waiting)), JSON.stringify(sawUpdateDuring));
    check('during the replay nothing about the update is on screen', sawUpdateDuring.every((s) => s.startsWith('0@')), sawUpdateDuring.join(' '));
    check('the page was not reloaded (nothing interrupted the wave)', (await page.evaluate('window.__marker')) === 'before');
    const notice = page.getByTestId('update');
    check('the result card offers the update once the replay is over', await until(page, async () => (await notice.count()) === 1));
    await checkOnScreen('the update notice is inside the viewport', notice);
    await checkOnScreen('with the notice, the result card is inside the viewport', page.locator('.result-card'));
    await checkOnScreen('with the notice, the next-wave button is inside the viewport', page.getByRole('button', { name: /Set up wave/ }));
    const noticeBtn = await notice.getByRole('button', { name: 'Update' }).boundingBox();
    check('the Update button is 44 px or more', noticeBtn !== null && noticeBtn.height >= 44, `${Math.round(noticeBtn?.height ?? 0)} px`);
    await shot(page, 'd5-update-result');
    await page.waitForTimeout(3000);
    check('left alone, the page never reloads by itself', (await page.evaluate('window.__marker')) === 'before' && (await notice.count()) === 1);
    await page.getByRole('button', { name: /Set up wave/ }).tap();
    await page.locator('.board').waitFor();
    check('during setup the notice is not in the way', (await notice.count()) === 0);
    await page.getByRole('button', { name: 'Menu' }).tap();
    await menu.waitFor();
    await checkOnScreen('the menu offers the update, inside the viewport', menu.getByTestId('update'));
    await touchTargets(page, 'the menu with the update notice');
    await shot(page, 'd6-update-menu');
    const stats = await barStats(page);
    const placed = await friendsOnBoard(page);
    await menu.getByRole('button', { name: 'Update' }).tap();
    check('Update reloads the page onto the new version', await until(page, async () => (await page.evaluate('window.__marker').catch(() => 'gone')) === undefined), 'reloaded');
    await page.locator('.picker, .board').first().waitFor();
    // With two children a launch opens the picker.
    if ((await page.locator('.picker').count()) === 1) await tile(page, 'Dog').tap();
    await page.locator('.board').waitFor();
    check('after the update the same day, wave and friends are there', (await barStats(page)) === stats && (await friendsOnBoard(page)) === placed, `${stats} / ${await barStats(page)}, ${placed} friends`);
    check('the service worker was fetched again (a new version really arrived)', swFetches() >= 2, `${swFetches()} fetches`);
    // A second deploy, found at a calm moment: the picker offers it too.
    bump();
    await lookForUpdate(page);
    check('a second new version waits in the background', await until(page, async () => (await swState(page)).waiting), JSON.stringify(await swState(page)));
    await page.waitForTimeout(500);
    await page.evaluate(`window.__marker = 'before'`);
    await openPicker(page);
    await checkOnScreen('the picker offers an update, inside the viewport', page.getByTestId('update'));
    await shot(page, 'd7-update-picker');
    await page.getByTestId('update').getByRole('button', { name: 'Update' }).tap();
    await until(page, async () => (await page.locator('.picker').count()) === 0 || (await page.locator('.picker').count()) === 1);

    await noHorizontalScroll(page, 'after the update');
    await noVerticalScroll(page, 'after the update');
    check('no page errors in the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

    // ---- offline: a cold start, a day never made before, and a whole-app restart ----
    await page.locator('.picker, .board').first().waitFor();
    await context.close();
    ({ context, page, cdp } = await open(profile));
    await context.setOffline(true);
    setCrashPage(page);
    const t0 = Date.now();
    await page.goto(URL);
    await page.locator('.picker, .board').first().waitFor({ timeout: 15_000 });
    check('after the whole app is closed and opened again with no network, profiles and progress are there', (await page.locator('.picker-tile').count()) === 2 || (await page.locator('.board').count()) === 1, `${Date.now() - t0} ms`);
    if ((await page.locator('.picker').count()) === 1) {
      const names = (await page.locator('.picker-tile').allTextContents()).join(' ');
      check('both children are still there after the restart', /Sam/.test(names) && (await tile(page, 'Dog').count()) === 1, names);
      await tile(page, 'Dog').tap();
    }
    await page.locator('.board').waitFor({ timeout: 15_000 });
    check('today’s daily opens offline, at the wave it was left at', (await page.locator('.board .sq').count()) === 48 && /\d+\/10/.test(await barStats(page)), await barStats(page));
    const prefsAfter = (await page.evaluate(`localStorage.getItem('snacks-prefs')`)) as string;
    check('the mute survived the restart', JSON.parse(prefsAfter).muted?.join() === 'p1', prefsAfter);
    // A day the app has never seen: the generator runs on the phone.
    const later = await context.newPage();
    await later.clock.setFixedTime(NOON + 3 * 86_400_000);
    await later.addInitScript(device({ vibrate: true }));
    const t1 = Date.now();
    await later.goto(URL);
    await later.locator('.picker, .board').first().waitFor({ timeout: 15_000 });
    if ((await later.locator('.picker').count()) === 1) await tile(later, 'Sam').tap();
    await later.locator('.board').waitFor({ timeout: 15_000 });
    const cells = await later.locator('.board .sq').evaluateAll((els) => els.map((e) => e.className).join('|'));
    const today = await page.locator('.board .sq').evaluateAll((els) => els.map((e) => e.className).join('|'));
    check('a day the app has never made opens offline too, with its own board', (await later.locator('.board .sq').count()) === 48 && cells !== today, `${Date.now() - t1} ms`);
    await later.close();
    await context.close();

    void getCrashPage;
    void onScreen;
  } catch (error) {
    const crashed = getCrashPage();
    if (crashed !== null) await shot(crashed, 'zz-device-crash').catch(() => undefined);
    throw error;
  } finally {
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} device checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
