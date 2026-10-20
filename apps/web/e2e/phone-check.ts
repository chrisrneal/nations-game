/**
 * The phone check (docs/ROADMAP.md, phone UX budget), in headless Chromium
 * sized as a 360 x 740 phone with touch. Builds nothing: run `npm run build`
 * first, then `npm run e2e --workspace web`. Not in CI (it needs a Chromium
 * binary); results are recorded in docs/PROGRESS.md. `SHOTS=dir` saves
 * screenshots there. `DAY=n` plays day n's daily (days since 1970-01-01)
 * instead of today's, by fixing the page's clock.
 *
 * Checks (K1, the controls pass K6):
 * - installable; opens on today's daily;
 * - during setup the board, the kids' cards, the tray (named, with a diagram,
 *   no chess symbols), Go and the selected friend's controls are all inside
 *   the 360 x 740 viewport together, not covered, and nothing scrolls;
 * - no horizontal scroll and every button at least 44 px;
 * - wave 1 is set up by taps alone (tray, square, then a tap on a lit square
 *   to aim), using the solver's setup for today worked out here in Node from
 *   the same day number, and feeds every kid;
 * - every friend shows where its next throw lands (D12);
 * - a kid's clue card opens from the board and from the cards above it, and
 *   stays open until closed;
 * - the replay holds 60 fps with the CPU slowed 4x; the result lies over the
 *   board, inside the viewport, with fed, hungry against the allowance and
 *   points;
 * - wave 2: Undo and Clear board (with its confirm step), then the setup made
 *   by touch drags alone (tray to square, square to square, off the board to
 *   the tray), aimed by taps, and it feeds every kid;
 * - reopening continues at wave 3; a practice board is generated in under a
 *   second with the CPU slowed 4x; it reopens offline.
 *
 * Profiles (K7):
 * - the top bar shows who is playing and their streak; its picture opens the
 *   picker; a quick tap on Grown-ups does nothing, a press-and-hold opens the
 *   grown-ups' menu; two profiles are added there (a Main one, a Kindy one);
 * - the second child plays wave 1; switching back finds the first child's
 *   game untouched, and switching again finds the second child's progress
 *   kept; with more than one profile a launch opens the picker;
 * - a Kindy profile opens a picture-only "coming soon" screen with a 64 px
 *   way back; deleting a profile asks first;
 * - the first child plays the rest of the daily: the done-for-today screen
 *   shows the result, the streak and a running countdown, with the bonus
 *   round and practice; it is what reopening shows; practice keeps the streak;
 * - an old save from before profiles (seeded into the browser's database)
 *   opens as the first profile at the same wave, with its finished day.
 * Every new screen and control is checked to be inside 360 x 740 and not
 * covered, not just positioned.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type CDPSession, type Locator, type Page } from 'playwright-core';
import type { FriendType, PlacedFriend, Puzzle, WaveLayout } from '@snacks/contracts';
import { GameSession, generatePuzzle, startGame, witnessCommands } from '@snacks/sim';
import { FRIEND_NAME, facingAngle, stepOf } from '../src/ui/labels.ts';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
/** The budget phone by default; `PHONE=pixel10xl` checks a Pixel 10 Pro XL (412 x 915) instead. */
const PHONE = process.env.PHONE === 'pixel10xl' ? { width: 412, height: 915, dpr: 3.25 } : { width: 360, height: 740, dpr: 2 };
const WIDTH = PHONE.width;
const HEIGHT = PHONE.height;
const SHOTS = process.env.SHOTS;
const DAY = process.env.DAY === undefined ? Math.floor(Date.now() / 86_400_000) : Number(process.env.DAY);
const CHESS = /[♔-♟]/;

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

/** Nothing on the page scrolls vertically: everything for setup is on one screen. */
async function noVerticalScroll(page: Page, where: string): Promise<void> {
  const r = (await page.evaluate(`(() => {
    const doc = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const scrollers = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.getBoundingClientRect().height > 0;
    }).map((el) => el.className);
    return { doc, scrollers };
  })()`)) as { doc: number; scrollers: string[] };
  check(`nothing to scroll: ${where}`, r.doc <= HEIGHT && r.scrollers.length === 0, `page ${r.doc} px${r.scrollers.length > 0 ? `, scrolls: ${r.scrollers.join(', ')}` : ''}`);
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

/**
 * The element is wholly inside the viewport and actually showing there: the
 * topmost element at its centre is it or inside it (not covered, not
 * clipped away, not scrolled off).
 */
async function onScreen(locator: Locator): Promise<{ ok: boolean; detail: string }> {
  const count = await locator.count();
  if (count === 0) return { ok: false, detail: 'not found' };
  const details: string[] = [];
  let ok = true;
  for (let i = 0; i < count; i++) {
    const r = await locator.nth(i).evaluate((el, [w, h]) => {
      const b = el.getBoundingClientRect();
      const inside = b.width > 0 && b.height > 0 && b.left >= -0.5 && b.top >= -0.5 && b.right <= w + 0.5 && b.bottom <= h + 0.5;
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const showing = top !== null && (top === el || el.contains(top));
      return { inside, showing, box: `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}` };
    }, [WIDTH, HEIGHT] as const);
    ok &&= r.inside && r.showing;
    details.push(`${r.box}${r.inside ? '' : ' OUTSIDE'}${r.showing ? '' : ' COVERED'}`);
  }
  return { ok, detail: details.join('; ') };
}

async function checkOnScreen(name: string, locator: Locator): Promise<boolean> {
  const r = await onScreen(locator);
  check(name, r.ok, r.detail);
  return r.ok;
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Polls until `test` holds (the host answers asynchronously), up to about 2 s. */
async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    if (await test()) return true;
    await page.waitForTimeout(20);
  }
  return false;
}

const cellOf = (page: Page, cell: number): Locator => page.locator(`.board [data-cell="${cell}"]`);

/** The arrow's rotation on the friend in a square, in degrees. */
async function arrowAngle(page: Page, cell: number): Promise<number | null> {
  const arrow = cellOf(page, cell).locator('.friend-arrow');
  if ((await arrow.count()) === 0) return null;
  const m = /rotate\((-?\d+)deg\)/.exec((await arrow.getAttribute('style')) ?? '');
  return m === null ? null : Number(m[1]);
}

const hasFriend = async (page: Page, cell: number): Promise<boolean> => (await cellOf(page, cell).locator('.friend').count()) > 0;
const friendsOnBoard = (page: Page): Promise<number> => page.locator('.board .friend').count();

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box to drag from or to');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A real touch drag (touch pointer events), finger down on `from`, moved in steps, lifted over `to`. */
async function touchDrag(cdp: CDPSession, from: Locator, to: Locator): Promise<void> {
  const a = await centre(from);
  const b = await centre(to);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const trayButton = (page: Page, type: FriendType): Locator => page.getByRole('button', { name: new RegExp(`^${FRIEND_NAME[type]}, \\d+ left`) });

async function deselect(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done' });
  if ((await done.count()) > 0) await done.tap();
}

/** The square a tap aims a friend with this facing at: the first square of its throw. Null when that is off the board. */
function aimCell(puzzle: Puzzle, friend: PlacedFriend): number | null {
  const { width, height } = puzzle.board;
  const [dx, dy] = stepOf(friend.type, friend.facing);
  const x = (friend.cell % width) + dx;
  const y = Math.floor(friend.cell / width) + dy;
  return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null;
}

/**
 * Aims the friend standing on `friend.cell` by tap-to-aim: select it, check its
 * lit squares, tap the one its facing points at. Falls back to the small turn
 * button only for a facing no square stands for. Returns how it was aimed.
 */
async function aimByTap(page: Page, puzzle: Puzzle, friend: PlacedFriend): Promise<'tap' | 'turn' | 'nurse' | 'failed'> {
  await deselect(page);
  await cellOf(page, friend.cell).tap();
  if (friend.type === 'nurse') {
    const heals = await page.locator('.board .sq-heal').count();
    await deselect(page);
    return heals > 0 ? 'nurse' : 'failed';
  }
  const want = facingAngle(friend.type, friend.facing);
  const target = aimCell(puzzle, friend);
  let how: 'tap' | 'turn' = 'tap';
  if (target !== null) {
    if ((await cellOf(page, target).getAttribute('class'))?.includes('sq-aimable') !== true) return 'failed';
    await cellOf(page, target).tap();
  } else {
    how = 'turn';
    for (let i = 0; i < 8 && (await arrowAngle(page, friend.cell)) !== want; i++) {
      const before = await arrowAngle(page, friend.cell);
      await page.getByRole('button', { name: 'Turn right' }).tap();
      await until(page, async () => (await arrowAngle(page, friend.cell)) !== before);
    }
  }
  const ok = await until(page, async () => (await arrowAngle(page, friend.cell)) === want);
  await deselect(page);
  return ok ? how : 'failed';
}

/** Buys what the witness buys before this wave, through the shop sheet. */
async function buy(page: Page, types: readonly FriendType[]): Promise<boolean> {
  if (types.length === 0) return true;
  await page.locator('.tray-shop').tap();
  for (const type of types) {
    const before = (await page.locator('.sheet-title').textContent()) ?? '';
    await page.getByRole('button', { name: new RegExp(`^Buy a ${FRIEND_NAME[type]} for`) }).tap();
    if (!(await until(page, async () => ((await page.locator('.sheet-title').textContent()) ?? '') !== before))) return false;
  }
  await page.locator('.sheet-close').tap();
  return true;
}

/** Waits for the result over the board and checks it. */
async function checkResult(page: Page, wave: number, kids: number): Promise<void> {
  const overlay = page.getByRole('region', { name: 'What happened' });
  await overlay.waitFor({ timeout: 15_000 });
  const title = (await overlay.locator('h2').textContent()) ?? '';
  check(`wave ${wave} feeds every kid`, title.includes(`${kids} of ${kids} fed`), title);
  await checkOnScreen(`wave ${wave} result: the overlay is inside the viewport`, overlay.locator('.result-card'));
  const board = await page.locator('.board').boundingBox();
  const card = await overlay.locator('.result-card').boundingBox();
  const over = board !== null && card !== null && card.x < board.x + board.width && card.x + card.width > board.x && card.y < board.y + board.height && card.y + card.height > board.y;
  check(`wave ${wave} result: it lies over the board`, over);
  const hungry = (await overlay.locator('[data-row="hungry"]').textContent()) ?? '';
  const points = (await overlay.locator('[data-row="points"]').textContent()) ?? '';
  const fed = (await overlay.locator('[data-row="fed"]').textContent()) ?? '';
  check(`wave ${wave} result: fed, hungry against the allowance, points`, /Fed: [A-Z]/.test(fed) && /Hungry today: 0 of 3/.test(hungry) && points.includes(`+${kids}`), `${fed} | ${hungry} | ${points}`);
  await checkOnScreen(`wave ${wave} result: its button is inside the viewport`, overlay.getByRole('button', { name: /Set up wave/ }));
}

/** Every visible element matching is at least `min` px each way (64 px for what a 4-year-old taps). */
async function bigTargets(page: Page, selector: string, min: number, where: string): Promise<void> {
  const sizes = (await page.locator(selector).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]))) as number[][];
  check(`targets at least ${min} px: ${where}`, sizes.length > 0 && sizes.every(([w, h]) => w! >= min && h! >= min), sizes.map(([w, h]) => `${w}x${h}`).join(', '));
}

/** A finger held on an element for `ms`, then lifted: a grown-up's press-and-hold. */
async function touchHold(page: Page, cdp: CDPSession, target: Locator, ms: number): Promise<void> {
  const at = await centre(target);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const barStats = async (page: Page): Promise<string> => (await page.locator('.bar-stats').textContent()) ?? '';

/** The friends on the board, by square and type, read from the screen. */
async function boardFriends(page: Page): Promise<{ cell: number; type: FriendType }[]> {
  return page.locator('.board .sq:has(.friend)').evaluateAll((els) =>
    els.map((el) => ({ cell: Number(el.getAttribute('data-cell')), type: (/\bt-(\w+)/.exec(el.querySelector('.friend')?.className ?? '')?.[1] ?? '') as FriendType })),
  );
}

/**
 * Sets up one wave of the solver's plan by taps alone, from whatever is on
 * the board: buy, send friends the plan doesn't use to the tray, place the
 * rest from the tray, aim every one, press Go. True when every kid is fed.
 */
async function playWaveByTaps(page: Page, puzzle: Puzzle, layout: WaveLayout): Promise<boolean> {
  if (!(await buy(page, layout.buys))) return false;
  const todo = [...layout.friends];
  for (const friend of await boardFriends(page)) {
    const i = todo.findIndex((f) => f.cell === friend.cell && f.type === friend.type);
    if (i >= 0) {
      todo.splice(i, 1);
      continue;
    }
    await deselect(page);
    await cellOf(page, friend.cell).tap();
    await page.getByRole('button', { name: 'To tray' }).tap();
    if (!(await until(page, async () => !(await hasFriend(page, friend.cell))))) return false;
  }
  for (const f of todo) {
    await deselect(page);
    await trayButton(page, f.type).tap();
    await cellOf(page, f.cell).tap();
    if (!(await until(page, () => hasFriend(page, f.cell)))) return false;
  }
  for (const f of layout.friends) if ((await aimByTap(page, puzzle, f)) === 'failed') return false;
  await page.locator('.btn-go').tap();
  const overlay = page.getByRole('region', { name: 'What happened' });
  await overlay.waitFor({ timeout: 15_000 });
  const kids = puzzle.kids.filter((k) => k.wave === layout.wave).length;
  return ((await overlay.locator('h2').textContent()) ?? '').includes(`${kids} of ${kids} fed`);
}

async function openPicker(page: Page): Promise<void> {
  await page.locator('.bar-avatar').tap();
  await page.locator('.picker').waitFor({ timeout: 5000 });
}

const tile = (page: Page, name: string): Locator => page.getByRole('button', { name: `Play as ${name}` });

/** Opens the grown-ups' menu from the picker with a press-and-hold. */
async function grownUps(page: Page, cdp: CDPSession): Promise<Locator> {
  await touchHold(page, cdp, page.locator('.hold-btn'), 1300);
  const menu = page.getByRole('dialog', { name: 'Grown-ups' });
  await menu.waitFor({ timeout: 3000 });
  return menu;
}

/** Adds a child in the grown-ups' menu. */
async function addChild(page: Page, avatar: string, name: string, mode: 'Main' | 'Kindy', check?: (form: Locator) => Promise<void>): Promise<void> {
  await page.getByRole('dialog', { name: 'Grown-ups' }).getByRole('button', { name: /Add a child/ }).tap();
  const form = page.getByRole('dialog', { name: 'Add a child' });
  await form.waitFor();
  await form.getByRole('button', { name: avatar, exact: true }).tap();
  await form.getByRole('textbox').fill(name);
  await form.getByRole('button', { name: new RegExp(`^${mode}:`) }).tap();
  await check?.(form);
  await form.getByRole('button', { name: 'Save' }).tap();
  await page.getByRole('dialog', { name: 'Grown-ups' }).waitFor();
}

/**
 * The save of a browser from before profiles (K7, version 0): the database
 * at version 1 with slots named without a profile, and the slot being
 * played in localStorage. Yesterday's daily finished; today's at wave 2.
 */
function legacySaves(day: number): { slot: string; savedAt: number; game: unknown }[] {
  const won = new GameSession(startGame(generatePuzzle('main', 'daily', day - 1, 0)));
  for (const layout of won.state.puzzle.witness) for (const c of witnessCommands(won.state, layout)) won.submit(c);
  const today = new GameSession(startGame(generatePuzzle('main', 'daily', day, 0)));
  for (const c of witnessCommands(today.state, today.state.puzzle.witness[0]!)) today.submit(c);
  return [
    { slot: `daily-main-${day - 1}`, savedAt: 0, game: won.save() },
    { slot: `daily-main-${day}`, savedAt: 0, game: today.save() },
  ];
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
    // Midday on the day being checked; timers keep running.
    if (process.env.DAY !== undefined) await page.clock.setFixedTime(DAY * 86_400_000 + 43_200_000);
    await page.goto(URL);
    await page.locator('.board').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cdp = await context.newCDPSession(page);

    const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
    check('installable: manifest with name, icons and standalone display', manifest.name === 'Snack Attack' && manifest.display === 'standalone' && manifest.icons.length >= 2);

    const squares = await page.locator('.board .sq').count();
    check('opens on today’s daily: a 6 x 8 board', squares === 48 && (await page.locator('.bar-title').textContent())?.includes('Today') === true, `${squares} squares`);

    // ---- one screen for setup ----
    await checkOnScreen('setup: the whole board is inside the viewport', page.locator('.board'));
    await checkOnScreen('setup: every kid’s card is inside the viewport', page.locator('.clue-chip'));
    await checkOnScreen('setup: every tray button is inside the viewport', page.locator('.tray-btn'));
    const trayText = await page.locator('.tray-btn').allTextContents();
    const named = trayText.every((t) => /^(Straight|Diagonal|Short|Bouncer|Nurse)×\d+$|^Shop/.test(t.replace(/\s/g, '').replace('🛒', '')));
    const diagrams = await page.locator('.tray-btn:not(.tray-shop) svg.diagram').count();
    const friendButtons = await page.locator('.tray-btn:not(.tray-shop)').count();
    check('the tray names each friend, draws its pattern and counts what is left, no chess symbols', named && diagrams === friendButtons && !trayText.some((t) => CHESS.test(t)), trayText.join(' | '));
    const go = await page.locator('.btn-go').boundingBox();
    check('Go is on screen, in the bottom third', go !== null && go.y >= (HEIGHT * 2) / 3 && go.y + go.height <= HEIGHT, `top ${Math.round(go?.y ?? 0)} of ${HEIGHT}`);
    await checkOnScreen('setup: Go is inside the viewport', page.locator('.btn-go'));
    await noHorizontalScroll(page, 'setup');
    await noVerticalScroll(page, 'setup');
    await touchTargets(page, 'setup');
    await shot(page, '1-setup');

    const puzzle = generatePuzzle('main', 'daily', DAY, 0);

    // ---- the clue card: from the board and from the cards above it; it stays open ----
    const kid = puzzle.kids.find((k) => k.wave === 1)!;
    await cellOf(page, kid.cell).tap();
    const card = page.getByRole('dialog', { name: 'Clue card' });
    await card.waitFor({ timeout: 2000 });
    await checkOnScreen('tapping a kid opens their clue card, inside the viewport', card);
    await page.waitForTimeout(3500);
    const stillOpen = await card.isVisible();
    check('the clue card stays open until closed (no auto-hide)', stillOpen);
    await shot(page, '2-clue-card');
    await card.getByRole('button', { name: 'Got it' }).tap();
    await page.locator('.clue-chip').first().tap();
    const fromChip = await card.isVisible();
    await card.getByRole('button', { name: 'Close' }).tap();
    check('the card above the board opens the same clue card, and closes when asked', fromChip && (await card.count()) === 0);

    // ---- wave 1: placed by taps, aimed by tapping a lit square ----
    const first = puzzle.witness[0]!;
    let placedOk = true;
    const aimed: string[] = [];
    let together = false;
    for (const friend of first.friends) {
      await trayButton(page, friend.type).tap();
      await cellOf(page, friend.cell).tap();
      placedOk &&= await until(page, () => hasFriend(page, friend.cell));
      if (!together) {
        // A friend is selected: board, tray, Go and its controls all on screen at once.
        const parts = await Promise.all([onScreen(page.locator('.board')), onScreen(page.locator('.tray')), onScreen(page.locator('.btn-go')), onScreen(page.getByRole('button', { name: 'To tray' })), onScreen(page.getByRole('button', { name: 'Move' }))]);
        check('with a friend selected, the board, tray, Go and its controls are all inside the viewport', parts.every((p) => p.ok), parts.map((p) => p.detail).join(' / '));
        const lit = await page.locator('.board .sq-aimable').count();
        check('a selected friend lights the squares it can throw to', friend.type === 'nurse' ? (await page.locator('.board .sq-heal').count()) > 0 : lit > 0, `${lit} squares`);
        await noVerticalScroll(page, 'a friend selected');
        await shot(page, '3-aiming');
        together = true;
      }
      aimed.push(await aimByTap(page, puzzle, friend));
    }
    check('wave 1: friends placed from the tray by taps', placedOk, `${first.friends.length} friend(s)`);
    check('wave 1: every friend aimed by tapping a lit square', aimed.every((a) => a === 'tap' || a === 'nurse' || a === 'turn') && aimed.includes('tap'), aimed.join(', '));
    const throwers = first.friends.filter((f) => f.type !== 'nurse').length;
    const lines = await page.locator('.board-preview .throw').count();
    check('every friend shows where its next throw lands (D12)', lines === throwers, `${lines} lines for ${throwers} throwing friend(s)`);
    await touchTargets(page, 'friends placed');
    await shot(page, '4-placed');

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.locator('.btn-go').tap();
    const fps = await measureFps(page, 1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('the wave replay holds 55+ fps with the CPU slowed 4x', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);
    await checkResult(page, 1, puzzle.kids.filter((k) => k.wave === 1).length);
    await shot(page, '5-result');
    await noHorizontalScroll(page, 'result');
    await touchTargets(page, 'result');
    await page.getByRole('button', { name: /Set up wave 2/ }).tap();

    // ---- wave 2: Undo and Clear board first ----
    const second = puzzle.witness[1]!;
    check('wave 2: bought what the plan needs in the shop', await buy(page, second.buys), second.buys.join(', ') || 'nothing to buy');
    const earlier = await friendsOnBoard(page);
    const occupied = new Set([...first.friends.map((f) => f.cell), ...second.friends.map((f) => f.cell), ...puzzle.kids.map((k) => k.cell)]);
    const spare = puzzle.board.squares.map((s, cell) => (s === 'open' && !occupied.has(cell) ? cell : -1)).filter((c) => c >= 0);
    const undoBtn = page.getByRole('button', { name: /Undo/ });
    const clearBtn = page.getByRole('button', { name: 'Clear board' });
    check('Undo and Clear board start empty: earlier waves are locked in', (await undoBtn.isDisabled()) && (await clearBtn.isDisabled()));
    // Undo an aim change on a friend from wave 1.
    const old = first.friends.find((f) => f.type !== 'nurse' && aimCell(puzzle, f) !== null);
    if (old !== undefined) {
      await cellOf(page, old.cell).tap();
      const lit = page.locator('.board .sq-aimable');
      const want = await arrowAngle(page, old.cell);
      let changed = false;
      for (let i = 0; i < (await lit.count()) && !changed; i++) {
        await lit.nth(i).tap();
        changed = await until(page, async () => (await arrowAngle(page, old.cell)) !== want);
      }
      await undoBtn.tap();
      const back = await until(page, async () => (await arrowAngle(page, old.cell)) === want);
      check('Undo puts an aim change back', changed && back);
      await deselect(page);
    }
    const inTray = page.locator('.tray-btn:not(.tray-shop):not([disabled])');
    if ((await inTray.count()) > 0 && spare.length > 0) {
      await inTray.first().tap();
      await cellOf(page, spare[0]!).tap();
      await until(page, () => hasFriend(page, spare[0]!));
      await undoBtn.tap();
      const undone = await until(page, async () => !(await hasFriend(page, spare[0]!)));
      check('Undo sends a friend placed this wave back to the tray', undone);
      await inTray.first().tap();
      await cellOf(page, spare[0]!).tap();
      await until(page, () => hasFriend(page, spare[0]!));
      await deselect(page);
      await clearBtn.tap();
      const confirm = page.getByRole('dialog', { name: 'Clear the board?' });
      await checkOnScreen('Clear board asks first, inside the viewport', confirm);
      await confirm.getByRole('button', { name: 'Yes, clear the board' }).tap();
      const cleared = await until(page, async () => !(await hasFriend(page, spare[0]!)));
      check('Clear board sends back only this wave’s friends; wave 1’s stay', cleared && (await friendsOnBoard(page)) === earlier, `${await friendsOnBoard(page)} on the board, ${earlier} from wave 1`);
      await undoBtn.tap();
      check('Undo brings a cleared board back', await until(page, () => hasFriend(page, spare[0]!)));
      await clearBtn.tap();
      await page.getByRole('dialog', { name: 'Clear the board?' }).getByRole('button', { name: 'Yes, clear the board' }).tap();
      await until(page, async () => !(await hasFriend(page, spare[0]!)));
    } else {
      check('Clear board is off when nothing was placed this wave', await clearBtn.isDisabled(), 'the tray is empty');
    }

    // ---- wave 2: set up by touch drags alone ----
    const drags = { trayToBoard: 0, boardToBoard: 0, boardToTray: 0 };
    let dragOk = true;
    const board = new Map(first.friends.map((f) => [f.cell, f.type] as const));
    const todo = [...second.friends];
    const take = (cell: number, type: FriendType): void => {
      const i = todo.findIndex((f) => f.cell === cell && f.type === type);
      if (i >= 0) todo.splice(i, 1);
    };
    for (const [cell, type] of [...board]) if (todo.some((f) => f.cell === cell && f.type === type)) take(cell, type);
    const kept = new Set(second.friends.filter((f) => board.get(f.cell) === f.type).map((f) => f.cell));
    // Move wave 1's friends to where wave 2 wants that type, while those squares are free.
    for (let moved = true; moved; ) {
      moved = false;
      for (const [cell, type] of [...board]) {
        if (kept.has(cell)) continue;
        const goal = todo.find((f) => f.type === type && !board.has(f.cell));
        if (goal === undefined) continue;
        await touchDrag(cdp, cellOf(page, cell), cellOf(page, goal.cell));
        dragOk &&= await until(page, async () => (await hasFriend(page, goal.cell)) && !(await hasFriend(page, cell)));
        board.delete(cell);
        board.set(goal.cell, type);
        kept.add(goal.cell);
        take(goal.cell, type);
        drags.boardToBoard++;
        moved = true;
      }
    }
    // The rest of wave 1's friends go off the board, back to the tray.
    for (const [cell] of [...board]) {
      if (kept.has(cell)) continue;
      await touchDrag(cdp, cellOf(page, cell), page.locator('.tray'));
      dragOk &&= await until(page, async () => !(await hasFriend(page, cell)));
      board.delete(cell);
      drags.boardToTray++;
    }
    // What is still missing comes from the tray.
    for (const f of [...todo]) {
      await touchDrag(cdp, trayButton(page, f.type), cellOf(page, f.cell));
      dragOk &&= await until(page, () => hasFriend(page, f.cell));
      board.set(f.cell, f.type);
      take(f.cell, f.type);
      drags.trayToBoard++;
    }
    // Make sure every kind of drag ran: one friend out to a spare square, off the board, and back from the tray.
    const probe = second.friends[0]!;
    const spot = spare.find((c) => !board.has(c));
    if (spot !== undefined) {
      await touchDrag(cdp, cellOf(page, probe.cell), cellOf(page, spot));
      dragOk &&= await until(page, () => hasFriend(page, spot));
      drags.boardToBoard++;
      await touchDrag(cdp, cellOf(page, spot), page.locator('.tray'));
      dragOk &&= await until(page, async () => !(await hasFriend(page, spot)));
      drags.boardToTray++;
      await touchDrag(cdp, trayButton(page, probe.type), cellOf(page, probe.cell));
      dragOk &&= await until(page, () => hasFriend(page, probe.cell));
      drags.trayToBoard++;
    }
    check(
      'wave 2: set up by drags: tray to square, square to square, off the board to the tray',
      dragOk && drags.trayToBoard > 0 && drags.boardToBoard > 0 && drags.boardToTray > 0,
      `${drags.trayToBoard} from the tray, ${drags.boardToBoard} moved, ${drags.boardToTray} sent back`,
    );
    const placedRight = (await friendsOnBoard(page)) === second.friends.length && (await Promise.all(second.friends.map((f) => hasFriend(page, f.cell)))).every(Boolean);
    check('wave 2: the board matches the plan', placedRight, `${await friendsOnBoard(page)} of ${second.friends.length}`);
    const aimed2: string[] = [];
    for (const f of second.friends) aimed2.push(await aimByTap(page, puzzle, f));
    check('wave 2: every friend aimed by tapping a lit square', !aimed2.includes('failed'), aimed2.join(', '));
    await noVerticalScroll(page, 'wave 2 set up');
    await shot(page, '6-wave2');
    await page.locator('.btn-go').tap();
    await checkResult(page, 2, puzzle.kids.filter((k) => k.wave === 2).length);
    await shot(page, '7-result2');

    await page.reload();
    await page.locator('.board').waitFor();
    const wave = (await page.locator('.bar-stats').textContent()) ?? '';
    check('reopening continues at wave 3', wave.includes('3/10'), wave);

    await page.getByRole('button', { name: 'Menu' }).tap();
    await touchTargets(page, 'menu');
    await shot(page, '8-menu');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.getByRole('button', { name: 'New practice board' }).tap();
    await page.locator('.bar-title', { hasText: 'Practice' }).waitFor();
    const ms = Date.now() - t0;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('a new practice board is ready in under a second with the CPU slowed 4x', ms < 1000, `${ms} ms`);
    await noVerticalScroll(page, 'practice board');

    await page.getByRole('button', { name: 'Menu' }).tap();
    await page.getByRole('button', { name: 'How to play' }).tap();
    await noHorizontalScroll(page, 'how to play');
    await shot(page, '9-help');
    await page.getByRole('button', { name: 'Close' }).last().tap();

    // ---- profiles (K7): the top bar, the picker, the grown-ups' menu ----
    await page.getByRole('button', { name: 'Menu' }).tap();
    await page.getByRole('button', { name: 'Today’s puzzle' }).tap();
    await until(page, async () => (await barStats(page)).includes('3/10'));
    const streak0 = (await page.locator('.bar-streak').textContent()) ?? '';
    check('the top bar shows who is playing and their streak', streak0.includes('🔥 0') && (await page.locator('.bar-avatar .avatar').count()) === 1, streak0);
    await checkOnScreen('the top bar: the player’s picture is inside the viewport', page.locator('.bar-avatar'));
    await checkOnScreen('the top bar: the streak is inside the viewport', page.locator('.bar-streak'));
    await noHorizontalScroll(page, 'the top bar with a picture and a streak');

    await openPicker(page);
    check('one profile: the picker shows one picture', (await page.locator('.picker-tile').count()) === 1);
    await checkOnScreen('the picker: the picture is inside the viewport', page.locator('.picker-tile'));
    await checkOnScreen('the picker: the grown-ups button is inside the viewport', page.locator('.hold-btn'));
    await page.locator('.hold-btn').tap();
    await page.waitForTimeout(400);
    check('a quick tap on Grown-ups does not open the menu, and says to hold it', (await page.getByRole('dialog', { name: 'Grown-ups' }).count()) === 0 && (await page.locator('.toast').count()) === 1);
    await page.locator('.toast').waitFor({ state: 'detached', timeout: 5000 });
    const menu = await grownUps(page, cdp);
    await checkOnScreen('a press-and-hold opens the grown-ups’ menu; Add a child is inside the viewport', menu.getByRole('button', { name: /Add a child/ }));
    await addChild(page, 'Cat', 'Sam', 'Main', async (form) => {
      await checkOnScreen('add a child: every picture is inside the viewport', form.locator('.avatar-choice'));
      await checkOnScreen('add a child: the name box is inside the viewport', form.getByRole('textbox'));
      await checkOnScreen('add a child: Main and Kindy are inside the viewport', form.locator('.mode-choice'));
      await checkOnScreen('add a child: Save is inside the viewport', form.getByRole('button', { name: 'Save' }));
      check('add a child: a picture already taken can’t be picked', await form.getByRole('button', { name: 'Dog', exact: true }).isDisabled());
      await touchTargets(page, 'add a child');
      await shot(page, '10-add-child');
    });
    await addChild(page, 'Frog', 'Pip', 'Kindy');
    const listed = await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.parent-list li').count();
    check('the grown-ups’ menu lists the three profiles', listed === 3, `${listed}`);
    await checkOnScreen('the grown-ups’ menu: every Change and Delete is inside the viewport', page.getByRole('dialog', { name: 'Grown-ups' }).locator('.parent-list .btn'));
    await touchTargets(page, 'the grown-ups’ menu');
    await shot(page, '11-grown-ups');
    await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.sheet-close').tap();
    check('the picker shows the three pictures', (await page.locator('.picker-tile').count()) === 3);
    await checkOnScreen('the picker: every picture is inside the viewport', page.locator('.picker-tile'));
    await bigTargets(page, '.picker-tile', 64, 'the picker’s pictures');
    await noHorizontalScroll(page, 'the picker');
    await noVerticalScroll(page, 'the picker');
    await touchTargets(page, 'the picker');
    await shot(page, '12-picker');

    // ---- two children, one phone: each keeps their own game ----
    await tile(page, 'Sam').tap();
    await page.locator('.board').waitFor();
    const samStart = await barStats(page);
    check('Sam’s daily opens at wave 1 with nothing on the board', samStart.includes('1/10') && (await friendsOnBoard(page)) === 0 && (await page.locator('.bar-avatar').getAttribute('aria-label'))?.startsWith('Sam') === true, samStart);
    check('Sam plays wave 1 by taps and feeds every kid', await playWaveByTaps(page, puzzle, first));
    await page.getByRole('button', { name: /Set up wave 2/ }).tap();
    await openPicker(page);
    await tile(page, 'Dog').tap();
    await until(page, async () => (await barStats(page)).includes('3/10'));
    check('switching back: the first child’s daily is untouched, at wave 3 with wave 2’s friends', (await barStats(page)).includes('3/10') && (await friendsOnBoard(page)) === second.friends.length, `${await barStats(page)}, ${await friendsOnBoard(page)} friends`);
    await openPicker(page);
    await tile(page, 'Sam').tap();
    await until(page, async () => (await barStats(page)).includes('2/10'));
    check('switching again: Sam’s progress is kept, at wave 2 with wave 1’s friends', (await barStats(page)).includes('2/10') && (await friendsOnBoard(page)) === first.friends.length, `${await barStats(page)}, ${await friendsOnBoard(page)} friends`);
    await page.reload();
    await page.locator('.picker').waitFor();
    check('with more than one profile, a launch opens the picker', (await page.locator('.board').count()) === 0 && (await page.locator('.picker-tile').count()) === 3);
    await checkOnScreen('after a launch: every picture is inside the viewport', page.locator('.picker-tile'));

    // ---- a Kindy profile: coming soon, in pictures ----
    await tile(page, 'Pip').tap();
    const soon = page.getByRole('region', { name: 'Kindy mode is coming soon' });
    await soon.waitFor();
    const words = (await soon.innerText()).replace(/[^A-Za-z]/g, '');
    check('a Kindy profile opens a coming-soon screen with no words on it', words === '' && (await page.locator('.board').count()) === 0, words);
    await checkOnScreen('coming soon: the way back is inside the viewport', soon.getByRole('button', { name: 'Back to the pictures' }));
    await bigTargets(page, '.kindy-back', 64, 'coming soon’s way back');
    await noVerticalScroll(page, 'coming soon');
    await shot(page, '13-kindy-soon');
    await soon.getByRole('button', { name: 'Back to the pictures' }).tap();
    await page.locator('.picker').waitFor();

    // ---- deleting asks first ----
    await grownUps(page, cdp);
    await page.getByRole('button', { name: 'Delete Pip' }).tap();
    const confirm = page.getByRole('dialog', { name: 'Delete Pip?' });
    await checkOnScreen('deleting a profile asks first, inside the viewport', confirm.getByRole('button', { name: 'Yes, delete Pip' }));
    await checkOnScreen('deleting a profile: Keep is inside the viewport', confirm.getByRole('button', { name: 'Keep Pip' }));
    await shot(page, '14-delete');
    await confirm.getByRole('button', { name: 'Yes, delete Pip' }).tap();
    await until(page, async () => (await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.parent-list li').count()) === 2);
    await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.sheet-close').tap();
    check('a deleted profile is gone from the picker', (await page.locator('.picker-tile').count()) === 2 && (await tile(page, 'Pip').count()) === 0);

    // ---- the first child finishes the daily: done for today ----
    await tile(page, 'Dog').tap();
    await until(page, async () => (await barStats(page)).includes('3/10'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rest: string[] = [];
    for (const layout of puzzle.witness.slice(2)) {
      const fed = await playWaveByTaps(page, puzzle, layout);
      rest.push(`${layout.wave}${fed ? '' : ' NOT FED'}`);
      if (layout.wave < puzzle.waves) await page.getByRole('button', { name: new RegExp(`Set up wave ${layout.wave + 1}`) }).tap();
    }
    check('waves 3-10 played by taps, every kid fed', rest.every((r) => !r.includes('NOT')), rest.join(', '));
    await page.getByRole('button', { name: 'See today’s result' }).tap();
    const doneScreen = page.getByRole('region', { name: 'Done for today' });
    await doneScreen.waitFor();
    const doneText = await doneScreen.innerText();
    check('done for today: the result, the streak, a countdown', /Kids fed: \d+/.test(doneText) && /Went home hungry: 0 of 3/.test(doneText) && /first go/.test(doneText) && /Streak: 1 day/.test(doneText) && /Next puzzle in \d+:\d\d:\d\d/.test(doneText), doneText.replace(/\s+/g, ' '));
    const clock1 = (await doneScreen.locator('.done-clock').textContent()) ?? '';
    // With DAY set the page's clock is fixed at midday: move it on instead of waiting.
    if (process.env.DAY !== undefined) await page.clock.setFixedTime(DAY * 86_400_000 + 43_205_000);
    await page.waitForTimeout(2100);
    const clock2 = (await doneScreen.locator('.done-clock').textContent()) ?? '';
    check('the countdown runs', clock1 !== clock2, `${clock1} then ${clock2}`);
    for (const part of ['.done-title', '.done-rows', '.week', '.done-next']) await checkOnScreen(`done for today: ${part.slice(1)} is inside the viewport`, doneScreen.locator(part));
    const bonusBtn = doneScreen.getByRole('button', { name: 'Play the bonus round' });
    await checkOnScreen('done for today: the bonus round is inside the viewport', bonusBtn);
    await checkOnScreen('done for today: practice is inside the viewport', doneScreen.getByRole('button', { name: 'Practice board' }));
    const bonusBox = await bonusBtn.boundingBox();
    check('done for today: its buttons are in the bottom third', bonusBox !== null && bonusBox.y >= (HEIGHT * 2) / 3, `top ${Math.round(bonusBox?.y ?? 0)}`);
    check('the top bar’s streak is 1', ((await page.locator('.bar-streak').textContent()) ?? '').includes('🔥 1'));
    await noVerticalScroll(page, 'done for today');
    await noHorizontalScroll(page, 'done for today');
    await touchTargets(page, 'done for today');
    await shot(page, '15-done');
    await page.reload();
    await page.locator('.picker').waitFor();
    check('the picker shows the first child’s streak, not Sam’s', (await tile(page, 'Dog').locator('.picker-streak').count()) === 1 && (await tile(page, 'Sam').locator('.picker-streak').count()) === 0);
    await tile(page, 'Dog').tap();
    await doneScreen.waitFor();
    check('reopening a finished daily shows done for today, not the board', (await page.locator('.board').count()) === 0);
    await doneScreen.getByRole('button', { name: 'Practice board' }).tap();
    await page.locator('.bar-title', { hasText: 'Practice' }).waitFor();
    check('practice is still there after the daily, and keeps the streak', ((await page.locator('.bar-streak').textContent()) ?? '').includes('🔥 1'));
    await page.emulateMedia({ reducedMotion: null });

    await context.setOffline(true);
    await page.reload();
    await page.locator('.picker').waitFor({ timeout: 10_000 });
    await tile(page, 'Dog').tap();
    await page.locator('.board').waitFor({ timeout: 10_000 });
    check('reopens offline', (await page.locator('.board .sq').count()) === 48);
    await context.close();

    // ---- an old save from before profiles (K7) ----
    const oldProfile = mkdtempSync(join(tmpdir(), 'snacks-legacy-'));
    try {
      const old = await chromium.launchPersistentContext(oldProfile, { executablePath: chromiumPath(), viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
      const oldPage = old.pages()[0] ?? (await old.newPage());
      if (process.env.DAY !== undefined) await oldPage.clock.setFixedTime(DAY * 86_400_000 + 43_200_000);
      // Before the app's first script: the version-1 database with the old slots, and the old active slot.
      await oldPage.addInitScript(`(() => {
        if (localStorage.getItem('seeded') === '1') return;
        localStorage.setItem('seeded', '1');
        localStorage.setItem('snacks-active-slot', 'daily-main-${DAY}');
        const req = indexedDB.open('snacks', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('slots', { keyPath: 'slot' });
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('slots', 'readwrite');
          for (const record of ${JSON.stringify(legacySaves(DAY))}) tx.objectStore('slots').put(record);
          tx.oncomplete = () => db.close();
        };
      })()`);
      await oldPage.goto(URL);
      await oldPage.locator('.board').waitFor({ timeout: 10_000 });
      const stats = await barStats(oldPage);
      const oldStreak = (await oldPage.locator('.bar-streak').textContent()) ?? '';
      check('an old save opens as the first profile, at the same wave, with its finished day', stats.includes('2/10') && (await friendsOnBoard(oldPage)) === first.friends.length && oldStreak.includes('🔥 1'), `${stats}, ${oldStreak}`);
      await old.close();
    } finally {
      rmSync(oldProfile, { recursive: true, force: true });
    }
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
