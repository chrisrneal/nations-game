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
 * The shop (RULES 8, K9):
 * - its button in the tray shows the points and is off while a wave plays;
 * - the shop is a bottom sheet with nothing to scroll: every card (picture,
 *   name, pattern diagram, one line on what it does, how many you have, the
 *   price) and every button inside 360 x 740; with no points every card is
 *   off and says how many more are needed; it closes with its close button;
 * - on the first wave whose plan buys a friend (points earned in earlier
 *   waves): buy it, the tray under the sheet counts it at once; give it back,
 *   the points return; buy it again; close the sheet with a swipe down; the
 *   new friend is placed from the tray and the wave feeds every kid.
 *
 * Profiles (K7):
 * - the top bar shows who is playing and their streak; its picture opens the
 *   picker; a quick tap on Grown-ups does nothing, a press-and-hold opens the
 *   grown-ups' menu; two profiles are added there (a Main one, a Kindy one);
 * - the second child plays wave 1; switching back finds the first child's
 *   game untouched, and switching again finds the second child's progress
 *   kept; with more than one profile a launch opens the picker;
 * - deleting a profile asks first;
 * - the first child plays the rest of the daily: the done-for-today screen
 *   shows the result, the streak and a running countdown, with the bonus
 *   round and practice; it is what reopening shows; practice keeps the streak;
 * - an old save from before profiles (seeded into the browser's database)
 *   opens as the first profile at the same wave, with its finished day.
 *
 * Kindy mode (RULES 11, K8), played by the Kindy profile:
 * - its own 4 x 4 daily, the board as wide as the phone, the tray, basket,
 *   help and the green Go all inside 360 x 740, every target 64 px or more,
 *   Go in the bottom third, nothing to scroll;
 * - no text at all on the page anywhere in the child's Kindy flow (setup,
 *   hints, the replay, the party, done for today, practice): no visible text
 *   node, and no picture drawn by CSS that is a letter or digit;
 * - left alone for the idle time, the hint's hand shows itself; the first
 *   tap unlocks the voice (a stand-in for speechSynthesis records what it
 *   says), and a hint is then said out loud;
 * - a wrong snack (worked out here in Node) bounces off: the kid shakes their
 *   head, waits, the board stays as it was and the next kid arrives;
 * - the rest of the day is played by following the hand alone, tapping only
 *   what it points at (each 64 px or more), until every kid is fed; then the
 *   party, and done for today with the sleeping sun, the moon on its way to
 *   the sunrise, a face per kid fed and the week's stars; reopening shows it
 *   again; practice gives a new Kindy board;
 * - turning the voice off in the grown-ups' menu keeps the hand and stops
 *   the voice.
 *
 * The art and the replay (K10):
 * - every picture (lunchboxes with their snack and tag, kids, friends,
 *   obstacles, tables, the top bar, each card's clue pictures, the clue
 *   card's snack key with a picture for each trait, the result's rows, the
 *   shop, Kindy's bubbles and friends) is inside 360 x 740 and showing; no
 *   emoji on any main screen; no Kindy bubble cut off by the board's edge;
 * - the replay flies every snack as its picture, a fed kid smiles, snacks
 *   rise into an arc, and only transform and opacity are animated (every
 *   Web Animation is recorded); the busiest wave of the day also holds 55+
 *   fps with the CPU slowed 4x; with reduced motion there are no arcs,
 *   spins, dances, wobbles or sparkles.
 *
 * Hints in main mode (RULES 8b, K11), by the second child on wave 1:
 * - the Hint button is inside 360 x 740, in the bottom third, 44 px or more;
 * - tier 1 lights the kid and their card and names what the card is about;
 *   their clue card then lights those traits; tier 2 lights the lunchbox of
 *   the snack they want; tier 3 puts the stored solution's friend out,
 *   aimed; Undo takes it back and Hint puts it out again;
 * - the result card counts the wave's hints and the day's; the first child
 *   uses a hint on wave 3, and done for today counts it with the streak
 *   still 1 (hints never break it).
 * Every new screen and control is checked to be inside 360 x 740 and not
 * covered, not just positioned. The four screens' looks are checked by the
 * visual check (visual-check.ts).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type CDPSession, type Locator, type Page } from 'playwright-core';
import type { FriendType, PlacedFriend, Puzzle, WaveLayout } from '@snacks/contracts';
import { GameSession, SNACK_TUNABLES, gameView, generatePuzzle, resolveSnacks, startGame, step, witnessCommands } from '@snacks/sim';
import { lineEnds } from '../src/ui/aim.ts';
import { HINT_LINES } from '../src/ui/kindy.ts';
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

/** How many of a type the tray shows as left; 0 when the type has no tray button. */
async function trayLeft(page: Page, type: FriendType): Promise<number> {
  const button = trayButton(page, type);
  if ((await button.count()) === 0) return 0;
  const m = /, (\d+) left/.exec((await button.getAttribute('aria-label')) ?? '');
  return m === null ? -1 : Number(m[1]);
}

const shopSheet = (page: Page): Locator => page.getByRole('dialog', { name: 'Shop' });
const shopCardOf = (page: Page, type: FriendType): Locator => shopSheet(page).locator(`.shop-card[data-type="${type}"]`);
const shopPoints = async (page: Page): Promise<number> => Number(/(\d+) points?/.exec((await shopSheet(page).locator('.sheet-title').textContent()) ?? '')?.[1] ?? -1);

/** A finger pulls `from` down by `dy` px and lets go: a swipe down. */
async function swipeDown(cdp: CDPSession, from: Locator, dy: number): Promise<void> {
  const a = await centre(from);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y + (dy * i) / 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Every card of the open shop, its parts and its buttons are inside the viewport, and nothing scrolls. */
async function shopOnScreen(page: Page, where: string): Promise<void> {
  const sheet = shopSheet(page);
  await checkOnScreen(`shop (${where}): the sheet is inside the viewport`, sheet.locator('.sheet-head'));
  await checkOnScreen(`shop (${where}): every card is inside the viewport`, sheet.locator('.shop-card'));
  await checkOnScreen(`shop (${where}): every picture is inside the viewport`, sheet.locator('.shop-pic'));
  await checkOnScreen(`shop (${where}): every buy button is inside the viewport`, sheet.locator('.shop-buy'));
  await checkOnScreen(`shop (${where}): the close button is inside the viewport`, sheet.locator('.sheet-close'));
  if ((await sheet.locator('.shop-refund').count()) > 0) await checkOnScreen(`shop (${where}): every Give back is inside the viewport`, sheet.locator('.shop-refund'));
  await noVerticalScroll(page, `the shop, ${where}`);
  await noHorizontalScroll(page, `the shop, ${where}`);
  await touchTargets(page, `the shop, ${where}`);
}

/** The wave whose plan first buys a friend runs the whole shop flow (K9); what it bought, once it has. */
let shopFlow: { wave: number; type: FriendType } | null = null;

/**
 * Buys what the witness buys before this wave, through the shop sheet. The
 * first time there is something to buy, it also gives the first friend back
 * and buys it again, checking the tray and the points each time, and closes
 * the sheet with a swipe down instead of its close button.
 */
async function buy(page: Page, cdp: CDPSession, wave: number, types: readonly FriendType[]): Promise<boolean> {
  if (types.length === 0) return true;
  const full = shopFlow === null;
  await page.locator('.tray-shop').tap();
  await shopSheet(page).waitFor({ timeout: 3000 });
  if (full) {
    const type = types[0]!;
    const card = shopCardOf(page, type);
    const points0 = await shopPoints(page);
    const tray0 = await trayLeft(page, type);
    const owned0 = (await card.locator('.shop-owned').textContent()) ?? '';
    check(`shop, wave ${wave}: points earned in earlier waves to spend`, points0 > 0 && (await page.locator('.tray-shop').getAttribute('aria-label'))?.includes(`${points0} point`) === true, `${points0} points`);
    await shopOnScreen(page, 'with points');
    await shot(page, '5b-shop');
    await card.locator('.shop-buy').tap();
    const bought = await until(page, async () => (await shopPoints(page)) < points0);
    const points1 = await shopPoints(page);
    const owned1 = (await card.locator('.shop-owned').textContent()) ?? '';
    const tray1 = await trayLeft(page, type);
    check(`shop: buying a ${FRIEND_NAME[type]} takes its points and puts it straight in the tray`, bought && tray1 === tray0 + 1 && owned1 !== owned0, `⭐ ${points0} → ${points1}, tray ${tray0} → ${tray1}, ${owned0} → ${owned1}`);
    const giveBack = card.locator('.shop-refund');
    await checkOnScreen('shop: a friend bought this setup can be given back; the button is inside the viewport', giveBack);
    await shot(page, '5c-shop-bought');
    await giveBack.tap();
    const back = await until(page, async () => (await shopPoints(page)) === points0);
    check('shop: giving it back returns every point and takes it out of the tray', back && (await trayLeft(page, type)) === tray0 && (await card.locator('.shop-refund').count()) === 0 && ((await card.locator('.shop-owned').textContent()) ?? '') === owned0, `⭐ ${await shopPoints(page)}, tray ${await trayLeft(page, type)}`);
    await card.locator('.shop-buy').tap();
    const again = await until(page, async () => (await shopPoints(page)) === points1);
    check('shop: bought again after giving it back', again && (await trayLeft(page, type)) === tray0 + 1);
  }
  for (const type of full ? types.slice(1) : types) {
    const before = await shopPoints(page);
    await shopCardOf(page, type).locator('.shop-buy').tap();
    if (!(await until(page, async () => (await shopPoints(page)) !== before))) return false;
  }
  if (full) {
    await swipeDown(cdp, shopSheet(page).locator('.sheet-title'), 220);
    const closed = await until(page, async () => (await shopSheet(page).count()) === 0);
    check('shop: a swipe down closes it, and the tray shows what was bought', closed && (await trayLeft(page, types[0]!)) > 0, `${FRIEND_NAME[types[0]!]} ×${await trayLeft(page, types[0]!)} in the tray`);
    shopFlow = { wave, type: types[0]! };
  } else {
    await shopSheet(page).locator('.sheet-close').tap();
  }
  return until(page, async () => (await shopSheet(page).count()) === 0);
}

/** After the wave that ran the shop flow: the friend bought was on the board and every kid was fed. */
function shopFlowPlayed(wave: number, fed: boolean, onBoard: readonly { type: FriendType }[]): void {
  if (shopFlow === null || shopFlow.wave !== wave) return;
  const type = shopFlow.type;
  check(`shop: the ${FRIEND_NAME[type]} bought for wave ${wave} was placed from the tray and the wave fed every kid`, fed && onBoard.some((f) => f.type === type));
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
  await checkOnScreen(`wave ${wave} result: each row’s picture is inside the viewport`, overlay.locator('.result-rows .row-icon'));
  await noEmoji(page, `wave ${wave} result`);
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
async function playWaveByTaps(page: Page, cdp: CDPSession, puzzle: Puzzle, layout: WaveLayout, beforeGo?: () => Promise<void>): Promise<boolean> {
  if (!(await buy(page, cdp, layout.wave, layout.buys))) return false;
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
  const onBoard = await boardFriends(page);
  await beforeGo?.();
  await page.locator('.btn-go').tap();
  const overlay = page.getByRole('region', { name: 'What happened' });
  await overlay.waitFor({ timeout: 15_000 });
  const kids = puzzle.kids.filter((k) => k.wave === layout.wave).length;
  const fed = ((await overlay.locator('h2').textContent()) ?? '').includes(`${kids} of ${kids} fed`);
  shopFlowPlayed(layout.wave, fed, onBoard);
  return fed;
}


/**
 * Kindy has no text (RULES 11): no visible text node anywhere on the page,
 * and no picture that holds text (an SVG `<text>`, `<title>` or `<desc>`).
 */
async function noText(page: Page, where: string): Promise<void> {
  const r = (await page.evaluate(`(() => {
    const text = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (el === null || n.textContent.trim() === '') continue;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') text.push(n.textContent.trim().slice(0, 30));
    }
    const pics = [...document.querySelectorAll('svg text, svg title, svg desc')].map((e) => e.tagName + ': ' + (e.textContent ?? '').slice(0, 20));
    return { text, pics, kindy: document.querySelector('.kindy-game') !== null };
  })()`)) as { text: string[]; pics: string[]; kindy: boolean };
  check(`no text anywhere on the page: ${where}`, r.kindy && r.text.length === 0 && r.pics.length === 0, [...r.text, ...r.pics].join(' | '));
}

/** What the stand-in voice has said, without the silent line that unlocks it. */
const spoken = async (page: Page): Promise<string[]> => ((await page.evaluate('window.__spoken ?? []')) as string[]).filter((t) => t.trim() !== '');

/** Waits until a Kindy wave has played out: Go is back, or the party is on. */
async function kindyWaveDone(page: Page): Promise<boolean> {
  for (let i = 0; i < 150; i++) {
    if ((await page.locator('.kindy-party').count()) > 0) return true;
    if (await page.locator('.kindy-go').isEnabled().catch(() => false)) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * One step of a Kindy hint, as a 4-year-old would follow it: tap the help
 * button if the hand isn't showing, then tap what the hand points at, first
 * the friend (when it starts there) and then where it goes. Returns what was
 * tapped, its size, and whether it was Go; null when no hand showed.
 */
async function followHand(page: Page): Promise<{ sizes: number[]; go: boolean } | null> {
  const to = page.locator('[data-hint="to"]');
  if ((await to.count()) === 0) {
    await page.locator('.kindy-ask').tap();
    if (!(await until(page, async () => (await to.count()) > 0))) return null;
  }
  const sizes: number[] = [];
  const from = page.locator('[data-hint="from"]');
  if ((await from.count()) > 0) {
    const b = await from.boundingBox();
    sizes.push(Math.min(b?.width ?? 0, b?.height ?? 0));
    await from.tap();
    await page.waitForTimeout(120);
  }
  const b = await to.boundingBox();
  sizes.push(Math.min(b?.width ?? 0, b?.height ?? 0));
  const go = (await to.getAttribute('class'))?.includes('kindy-go') === true;
  await to.tap();
  await page.waitForTimeout(150);
  return { sizes, go };
}

/**
 * Friends to put out for Kindy wave 1 (one, else two) so that a wrong snack
 * reaches the kid and nothing feeds them, worked out in Node. Each comes with
 * the square to tap to aim it, found the way the screen finds it: placed
 * facing the way the last one was aimed (up at first), then aimed. Null if
 * this day has no such setup.
 */
function wrongThrow(puzzle: Puzzle): { cell: number; facing: number; aimAt: number | null }[] | null {
  const kid = puzzle.kids.find((k) => k.wave === 1)!;
  const kids = [{ id: kid.id, cell: kid.cell, wants: kid.wants }];
  const open = puzzle.board.squares.flatMap((sq, c) => (sq === 'open' ? [c] : []));
  const spots = open.flatMap((cell) => [0, 2, 4, 6].map((facing) => ({ cell, facing })));
  const plans = [...spots.map((a) => [a]), ...spots.flatMap((a) => spots.filter((b) => b.cell !== a.cell).map((b) => [a, b]))].filter((p) => p.length <= puzzle.tray.length);
  for (const plan of plans) {
    const friends = plan.map((f, i) => ({ id: i + 1, type: 'straight' as const, ...f }));
    const r = resolveSnacks({ board: puzzle.board, friends, kids, mode: 'kindy' });
    if (r.fed.size > 0 || !r.snacks.some((t) => t.end === 'bounced' && t.kid === kid.id)) continue;
    let state = startGame(puzzle);
    let last = 0;
    const out: { cell: number; facing: number; aimAt: number | null }[] = [];
    let ok = true;
    plan.forEach((f, i) => {
      const placed = step(state, { type: 'place', friend: i + 1, cell: f.cell, facing: last });
      if (placed.error !== null) {
        ok = false;
        return;
      }
      const view = gameView(placed.state);
      const aimAt = f.facing === last ? null : ([...lineEnds(view, view.friends[i]!)].find(([, facing]) => facing === f.facing)?.[0] ?? -1);
      if (aimAt === -1) ok = false;
      state = step(placed.state, { type: 'turn', friend: i + 1, facing: f.facing }).state;
      last = f.facing;
      out.push({ ...f, aimAt });
    });
    if (ok) return out;
  }
  return null;
}

/**
 * Writes down every Web Animation the page starts (K10): what it moves, on
 * what, and the transforms it goes through, so the check can prove the
 * replay moves only transform and opacity, and that the calm version has no
 * arcs, spins or dances. Also counts the flying snacks and kids' faces.
 */
const RECORDER = `(() => {
  window.__anims = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const list = Array.isArray(frames) ? frames : [];
    window.__anims.push({
      cls: this.getAttribute('class') || '',
      props: [...new Set(list.flatMap((f) => Object.keys(f)))],
      transforms: list.map((f) => f.transform || '').join(' | '),
    });
    return animate.call(this, frames, options);
  };
})()`;

interface Recorded {
  cls: string;
  props: string[];
  transforms: string;
}
const recorded = async (page: Page): Promise<Recorded[]> => (await page.evaluate('window.__anims ?? []')) as Recorded[];
const resetRecorder = (page: Page): Promise<unknown> => page.evaluate('window.__anims = []');

/** No emoji anywhere on the page (the art replaced them, K10): they look different on every phone. */
async function noEmoji(page: Page, where: string): Promise<void> {
  const found = (await page.evaluate(`(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) if (/\\p{Extended_Pictographic}/u.test(n.textContent) && n.parentElement && n.parentElement.getBoundingClientRect().width > 0) out.push(n.textContent.trim().slice(0, 30));
    return out;
  })()`)) as string[];
  check(`no emoji on the page, only the art: ${where}`, found.length === 0, found.join(' | '));
}

/** Running CSS animations by name, so a still reveal (reduced motion) and a popping one (full motion) can be told apart. */
const runningAnimations = async (page: Page, name: string): Promise<number> =>
  Number(await page.evaluate(`document.getAnimations().filter((a) => a.animationName === '${name}' && a.playState === 'running').length`));

/**
 * The reveal (RULES 9a, K12): the overlay, every item, the head and the skip
 * line are wholly inside the viewport and showing, not covered. One page
 * round trip, so it is measured before the reveal puts itself away.
 */
async function revealOnScreen(page: Page, where: string): Promise<void> {
  const r = (await page.evaluate(`(() => {
    const bad = [];
    for (const sel of ['.reveal', '.reveal-item', '.reveal-sticker', '.reveal-head', '.reveal-skip', '.reveal-name']) {
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        const inside = b.width > 0 && b.height > 0 && b.left >= -0.5 && b.top >= -0.5 && b.right <= ${WIDTH} + 0.5 && b.bottom <= ${HEIGHT} + 0.5;
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const showing = top !== null && (el === top || el.contains(top));
        if (!inside || !showing) bad.push(sel + ' ' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + (inside ? '' : ' OUTSIDE') + (showing ? '' : ' COVERED'));
      }
    }
    return { bad, items: document.querySelectorAll('.reveal-item').length };
  })()`)) as { bad: string[]; items: number };
  check(`${where}: every part is inside the viewport and showing`, r.items > 0 && r.bad.length === 0, r.bad.length > 0 ? r.bad.join('; ') : `${r.items} item(s)`);
}

/** Wholly inside the viewport by its box alone: for a layer that lets taps through (pointer-events: none), which elementFromPoint skips. */
async function insideViewport(name: string, locator: Locator): Promise<void> {
  const box = await locator.first().boundingBox();
  const ok = box !== null && box.width > 0 && box.height > 0 && box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= WIDTH + 0.5 && box.y + box.height <= HEIGHT + 0.5;
  check(name, ok, box === null ? 'not found' : `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
}

/** Polls (up to about 2 s) for something the host answers asynchronously, such as a button's pressed state. */
const settled = (page: Page, test: () => Promise<boolean>): Promise<boolean> => until(page, test);

/** The reveal puts itself away (up to 6 s), without a tap. */
const revealGone = async (page: Page): Promise<boolean> =>
  page.waitForSelector('.reveal', { state: 'detached', timeout: 6000 }).then(
    () => true,
    () => false,
  );

/** The open sticker book's parts, wholly inside the viewport and showing, with nothing to scroll (RULES 9a, K12). */
async function bookOnScreen(page: Page, where: string, kindy: boolean): Promise<void> {
  const book = page.getByRole('dialog', { name: 'Sticker book' });
  for (const part of ['.book-bar', '.book-me', '.book-pager', '.book-grid', '.book-wardrobe']) await checkOnScreen(`${where}: ${part.slice(1)} is inside the viewport`, book.locator(part));
  await checkOnScreen(`${where}: every sticker slot is inside the viewport`, book.locator('.book-grid .sticker'));
  await checkOnScreen(`${where}: every hat and outfit slot is inside the viewport`, book.locator('.book-wear > li'));
  await checkOnScreen(`${where}: the back button is inside the viewport`, book.locator('.book-back'));
  await checkOnScreen(`${where}: both page arrows are inside the viewport`, book.locator('.book-turn'));
  const over = await book.evaluate((el) => el.scrollHeight - el.clientHeight);
  check(`${where}: the book itself has nothing to scroll`, over <= 1, `${over} px over`);
  await noVerticalScroll(page, where);
  await noHorizontalScroll(page, where);
  if (kindy) await bigTargets(page, '.book-kindy button', 64, where);
  else await touchTargets(page, where);
}

/** Turns through every page of the open book and counts what is in colour and what is a silhouette. */
async function countBook(page: Page, pages: number): Promise<{ earned: number; locked: number; slots: number; names: string[] }> {
  const book = page.getByRole('dialog', { name: 'Sticker book' });
  let earned = 0;
  let locked = 0;
  let slots = 0;
  const names: string[] = [];
  for (let i = 0; i < pages; i++) {
    earned += await book.locator('.book-grid li[data-earned="yes"]').count();
    locked += await book.locator('.book-grid li[data-earned="no"] .sticker-locked').count();
    slots += await book.locator('.book-grid li').count();
    for (const li of await book.locator('.book-grid li[data-earned="yes"]').all()) names.push((await li.getAttribute('data-sticker-slot')) ?? '?');
    await book.getByRole('button', { name: 'Next page' }).tap();
  }
  return { earned, locked, slots, names };
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

/** The main page, for a picture when a step throws. */
let crashPage: Page | null = null;

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
    crashPage = page;
    // Midday on the day being checked; timers keep running.
    if (process.env.DAY !== undefined) await page.clock.setFixedTime(DAY * 86_400_000 + 43_200_000);
    // A stand-in for the phone's voice (headless Chromium has none): it writes down what it is asked to say.
    await page.addInitScript(`(() => {
      window.__spoken = [];
      function Utterance(text) { this.text = text; }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => window.__spoken.push(u.text), cancel: () => {} }, configurable: true });
    })()`);
    await page.addInitScript(RECORDER);
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
    const named = trayText.every((t) => /^(Straight|Diagonal|Short|Bouncer|Nurse)×\d+$|^Shop/.test(t.replace(/\s/g, '')));
    const diagrams = await page.locator('.tray-btn:not(.tray-shop) svg.diagram').count();
    const friendButtons = await page.locator('.tray-btn:not(.tray-shop)').count();
    check('the tray names each friend, draws its pattern and counts what is left, no chess symbols', named && diagrams === friendButtons && !trayText.some((t) => CHESS.test(t)), trayText.join(' | '));
    const go = await page.locator('.btn-go').boundingBox();
    check('Go is on screen, in the bottom third', go !== null && go.y >= (HEIGHT * 2) / 3 && go.y + go.height <= HEIGHT, `top ${Math.round(go?.y ?? 0)} of ${HEIGHT}`);
    await checkOnScreen('setup: Go is inside the viewport', page.locator('.btn-go'));
    await checkOnScreen('setup: the Hint button is inside the viewport', page.locator('.btn-hint'));
    const hintBox = await page.locator('.btn-hint').boundingBox();
    check('the Hint button is in the bottom third', hintBox !== null && hintBox.y >= (HEIGHT * 2) / 3 && hintBox.y + hintBox.height <= HEIGHT, `top ${Math.round(hintBox?.y ?? 0)} of ${HEIGHT}`);
    await noHorizontalScroll(page, 'setup');
    await noVerticalScroll(page, 'setup');
    await touchTargets(page, 'setup');
    await shot(page, '1-setup');

    const puzzle = generatePuzzle('main', 'daily', DAY, 0);

    // ---- the art (K10): every picture is drawn, and inside the viewport ----
    const squaresOf = (kind: string): number => puzzle.board.squares.filter((k) => k === kind).length;
    check('art: every lunchbox shows its snack and its colour’s mark', (await page.locator('.board .sq-lunchbox .art-lunchbox .art-snack').count()) === puzzle.board.lunchboxes.length, `${puzzle.board.lunchboxes.length} lunchboxes`);
    await checkOnScreen('art: every lunchbox is inside the viewport', page.locator('.board .art-lunchbox'));
    check('art: every obstacle and parents’ table is drawn', (await page.locator('.board .sq-obstacle .art-obstacle').count()) === squaresOf('obstacle') && (await page.locator('.board .sq-table .art-table').count()) === squaresOf('table'), `${squaresOf('obstacle')} obstacles, ${squaresOf('table')} tables`);
    await checkOnScreen('art: every kid on the board is drawn, inside the viewport', page.locator('.board .kid .art-kid'));
    await checkOnScreen('art: each kid’s card shows its clue as pictures, inside the viewport', page.locator('.clue-chip .facts'));
    await checkOnScreen('art: each kid’s card shows the kid as on the board, inside the viewport', page.locator('.clue-chip .clue-kid .art-kid'));
    await checkOnScreen('art: the tray shows each friend’s picture, inside the viewport', page.locator('.tray-btn:not(.tray-shop) .art-friend'));
    await checkOnScreen('art: the top bar’s pictures are inside the viewport', page.locator('.bar .art'));
    await noEmoji(page, 'setup');

    // ---- the clue card: from the board and from the cards above it; it stays open ----
    const kid = puzzle.kids.find((k) => k.wave === 1)!;
    await cellOf(page, kid.cell).tap();
    const card = page.getByRole('dialog', { name: 'Clue card' });
    await card.waitFor({ timeout: 2000 });
    await checkOnScreen('tapping a kid opens their clue card, inside the viewport', card);
    await page.waitForTimeout(3500);
    const stillOpen = await card.isVisible();
    check('the clue card stays open until closed (no auto-hide)', stillOpen);
    const keyed = await card.locator('.snacks li').count();
    check('art: the clue card shows each of today’s snacks with a picture for each of its four traits', keyed === puzzle.snacks.length && (await card.locator('.snacks .trait .art').count()) === 4 * keyed && (await card.locator('.snacks .snack-pic').count()) === keyed, `${keyed} snacks`);
    await checkOnScreen('art: the clue card’s snack pictures are inside the viewport', card.locator('.snacks .snack-pic'));
    await checkOnScreen('art: the clue card’s trait pictures are inside the viewport', card.locator('.snacks .trait .art'));
    await checkOnScreen('art: the clue card shows the clue as pictures, inside the viewport', card.locator('.facts.big'));
    await noEmoji(page, 'the clue card');
    await shot(page, '2-clue-card');
    await card.getByRole('button', { name: 'Got it' }).tap();
    await page.locator('.clue-chip').first().tap();
    const fromChip = await card.isVisible();
    await card.getByRole('button', { name: 'Close' }).tap();
    check('the card above the board opens the same clue card, and closes when asked', fromChip && (await card.count()) === 0);

    // ---- the shop before any points: every card off, each saying how many more are needed ----
    const shopBtn = page.locator('.tray-shop');
    await checkOnScreen('the shop button is in the tray, inside the viewport', shopBtn);
    check('the shop button shows the points to spend', ((await shopBtn.textContent()) ?? '').replace(/\s/g, '').includes('Shop0') && (await shopBtn.locator('.icon-star').count()) === 1 && (await shopBtn.getAttribute('aria-label')) === 'Shop: 0 points to spend', (await shopBtn.textContent()) ?? '');
    await shopBtn.tap();
    await shopSheet(page).waitFor({ timeout: 3000 });
    await shopOnScreen(page, 'no points yet');
    const cards = await shopSheet(page).locator('.shop-card').evaluateAll((els) =>
      els.map((el) => ({
        pic: el.querySelector('.shop-pic svg.art-friend')?.getAttribute('aria-label') ?? '',
        name: el.querySelector('.shop-name')?.textContent ?? '',
        diagram: el.querySelector('svg.diagram') !== null,
        blurb: el.querySelector('.shop-blurb')?.textContent ?? '',
        owned: el.querySelector('.shop-owned')?.textContent ?? '',
        buy: el.querySelector('.shop-buy')?.textContent ?? '',
        off: (el.querySelector('.shop-buy') as HTMLButtonElement | null)?.disabled === true && el.classList.contains('short'),
      })),
    );
    check(
      'the shop: a card per friend with a picture, name, pattern diagram, one line on what it does and how many you have',
      cards.length === puzzle.shop.length && cards.every((c) => c.pic !== '' && /^(Straight|Diagonal|Short|Bouncer|Nurse)$/.test(c.name) && c.diagram && c.blurb.length > 10 && /^You have \d+$/.test(c.owned)),
      cards.map((c) => `${c.pic} ${c.name}: ${c.owned}`).join(' | '),
    );
    const prices: Record<string, number> = { Short: 1, Straight: 2, Diagonal: 2, Bouncer: 3, Nurse: 3 };
    check('with no points every card is off and says how many more points it needs', cards.every((c) => c.off && c.buy === `Need ${prices[c.name]} more`), cards.map((c) => c.buy).join(' | '));
    await shot(page, '2b-shop-empty');
    await shopSheet(page).locator('.sheet-close').tap();
    check('the shop closes with its close button', await until(page, async () => (await shopSheet(page).count()) === 0));

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
    await checkOnScreen('art: every friend placed is drawn, inside the viewport', page.locator('.board .friend .art-friend'));
    await shot(page, '4-placed');
    await resetRecorder(page);
    await page.evaluate(`(() => {
      const r = (window.__replay = { snacks: 0, pictured: 0, moods: [] });
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('flying-snack')) { r.snacks++; if (n.querySelector('svg.art-snack')) r.pictured++; }
          if (m.type === 'attributes' && m.target.dataset.mood) r.moods.push(m.target.dataset.mood);
        }
      }).observe(document.querySelector('.board-wrap'), { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mood'] });
    })()`);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.locator('.btn-go').tap();
    const shopDuringWave = await page.locator('.tray-shop').isDisabled();
    const fps = await measureFps(page, 1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('the wave replay holds 55+ fps with the CPU slowed 4x', fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms`);
    check('the shop can’t be opened while a wave plays', shopDuringWave);
    await checkResult(page, 1, puzzle.kids.filter((k) => k.wave === 1).length);
    const replay = (await page.evaluate('window.__replay')) as { snacks: number; pictured: number; moods: string[] };
    const pickers = resolveSnacks({ board: puzzle.board, friends: first.friends.map((f, i) => ({ id: i + 1, ...f })), kids: puzzle.kids.filter((k) => k.wave === 1), mode: 'main' }).snacks.length;
    check('the replay flies every snack as its picture, and a fed kid smiles', replay.snacks === pickers && replay.pictured === pickers && replay.moods.includes('yum'), `${replay.snacks} snacks (${pickers} pickers), faces: ${replay.moods.join(', ')}`);
    const moved = [...new Set((await recorded(page)).flatMap((a) => a.props))];
    check('the replay moves only transform and opacity (P7)', moved.length > 0 && moved.every((p) => ['offset', 'transform', 'opacity', 'easing', 'composite'].includes(p)), moved.join(', '));
    const arcs = (await recorded(page)).filter((a) => a.cls === 'fly-lift' && /translateY\(-[1-9]/.test(a.transforms)).length;
    check('the snacks arc through the air (they rise above the ground)', arcs > 0, `${arcs} arcing snacks`);
    await shot(page, '5-result');
    await noHorizontalScroll(page, 'result');
    await touchTargets(page, 'result');
    await page.getByRole('button', { name: /Set up wave 2/ }).tap();
    if ((await page.locator('.tray-shop').count()) > 0) {
      await page.locator('.tray-shop').tap();
      const sheet = page.locator('.sheet');
      await sheet.waitFor();
      await checkOnScreen('art: the shop shows each friend’s picture, inside the viewport', sheet.locator('.shop-pic .art-friend'));
      await checkOnScreen('art: the shop’s awning is inside the viewport', sheet.locator('.shop-awning'));
      await checkOnScreen('art: the shop’s prices are inside the viewport', sheet.locator('.shop-buy'));
      await touchTargets(page, 'the shop');
      await noEmoji(page, 'the shop');
      await shot(page, '5d-shop-art');
      await page.locator('.sheet-close').tap();
    }

    // ---- wave 2: Undo and Clear board first ----
    const second = puzzle.witness[1]!;
    check('wave 2: bought what the plan needs in the shop', await buy(page, cdp, 2, second.buys), second.buys.join(', ') || 'nothing to buy');
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
    const onBoard2 = await boardFriends(page);
    await page.locator('.btn-go').tap();
    await checkResult(page, 2, puzzle.kids.filter((k) => k.wave === 2).length);
    const title2 = (await page.getByRole('region', { name: 'What happened' }).locator('h2').textContent()) ?? '';
    const kids2 = puzzle.kids.filter((k) => k.wave === 2).length;
    shopFlowPlayed(2, title2.includes(`${kids2} of ${kids2} fed`), onBoard2);
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
    check('the top bar shows who is playing and their streak', streak0.trim() === '0' && (await page.locator('.bar-streak .icon-flame').count()) === 1 && (await page.locator('.bar-avatar .avatar .art-avatar').count()) === 1, streak0);
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

    // ---- hints (RULES 8b): Sam asks for all three tiers on wave 1 ----
    const hintBtn = page.locator('.btn-hint');
    const hintLine = page.locator('.dock-hint.hint-line');
    const hintKid = puzzle.kids.find((k) => k.wave === 1)!;
    const hintLetter = String.fromCharCode(64 + hintKid.id);
    await hintBtn.tap();
    await until(page, async () => (await hintLine.count()) === 1);
    const line1 = (await hintLine.textContent()) ?? '';
    check('hint 1: names the kid whose card to solve and what it is about', line1.includes(`Kid ${hintLetter} next`) && /is about|points at/.test(line1), line1);
    await checkOnScreen('hint 1: the hint line is inside the viewport', hintLine);
    await checkOnScreen('hint 1: the kid’s card is lit, inside the viewport', page.locator('.clue-chip.hinted'));
    check('hint 1: the kid’s square is lit, and no lunchbox yet', (await cellOf(page, hintKid.cell).getAttribute('class'))?.includes('sq-hint') === true && (await page.locator('.board .sq-lunchbox.sq-hint').count()) === 0);
    check('hint 1: the Hint button counts the wave’s hints', ((await hintBtn.getAttribute('aria-label')) ?? '').includes('1 hint this wave'), (await hintBtn.getAttribute('aria-label')) ?? '');
    await page.locator('.clue-chip.hinted').tap();
    const hintCard = page.getByRole('dialog', { name: 'Clue card' });
    await hintCard.waitFor();
    const traitsOnCard = hintKid.clue!.facts.some((f) => f.kind === 'is' || f.kind === 'not');
    check('hint 1: the kid’s clue card lights the traits their card is about', !traitsOnCard || (await hintCard.locator('.trait-hint').count()) > 0, `${await hintCard.locator('.trait-hint').count()} lit`);
    await checkOnScreen('hint 1: the clue card is inside the viewport', hintCard.getByRole('button', { name: 'Got it' }));
    await shot(page, '12a-hint-card');
    await hintCard.getByRole('button', { name: 'Got it' }).tap();
    await shot(page, '12b-hint-1');
    await hintBtn.tap();
    const box = puzzle.board.lunchboxes.find((l) => l.snack === hintKid.wants)!;
    const boxLit = await until(page, async () => (await cellOf(page, box.cell).getAttribute('class'))?.includes('sq-hint') === true);
    check('hint 2: the lunchbox that feeds the kid lights up, and only that one', boxLit && (await page.locator('.board .sq-lunchbox.sq-hint').count()) === 1, (await hintLine.textContent()) ?? '');
    await checkOnScreen('hint 2: the lit lunchbox is inside the viewport', cellOf(page, box.cell));
    await shot(page, '12c-hint-2');
    await hintBtn.tap();
    const firstFriend = first.friends[0]!;
    const placedByHint = await until(page, async () => (await hasFriend(page, firstFriend.cell)) && (await arrowAngle(page, firstFriend.cell)) === facingAngle(firstFriend.type, firstFriend.facing));
    check('hint 3: a friend goes out on the planned square, aimed the right way', placedByHint, (await hintLine.textContent()) ?? '');
    await checkOnScreen('hint 3: the friend it put out is inside the viewport', cellOf(page, firstFriend.cell));
    await shot(page, '12d-hint-3');
    await page.getByRole('button', { name: /Undo/ }).tap();
    const undoneHint = await until(page, async () => !(await hasFriend(page, firstFriend.cell)));
    await hintBtn.tap();
    const again = await until(page, () => hasFriend(page, firstFriend.cell));
    check('Undo takes back the friend a hint put out; Hint puts it out again', undoneHint && again);
    await noVerticalScroll(page, 'a hint showing');
    await noHorizontalScroll(page, 'a hint showing');
    await touchTargets(page, 'a hint showing');
    check('Sam plays wave 1 by taps and feeds every kid', await playWaveByTaps(page, cdp, puzzle, first));
    const hintRow = page.getByRole('region', { name: 'What happened' }).locator('[data-row="hints"]');
    const hintRowText = (await hintRow.textContent()) ?? '';
    check('the result counts the wave’s hints and the day’s', hintRowText.includes('4 hints this wave') && hintRowText.includes('4 hints today'), hintRowText);
    await checkOnScreen('the result: the hints row is inside the viewport', hintRow);
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

    // ---- Kindy mode (RULES 11): a whole day by taps on big pictures, no text ----
    await tile(page, 'Pip').tap();
    const kindy = page.getByRole('region', { name: 'Kindy' });
    await kindy.locator('.board').waitFor();
    const kp = generatePuzzle('kindy', 'daily', DAY, 0);
    const kSquares = await kindy.locator('.board .sq').count();
    const kBoard = await kindy.locator('.board').boundingBox();
    check('a Kindy profile opens its own Kindy daily: a 4 x 4 board as wide as the phone', kSquares === 16 && kBoard !== null && kBoard.width >= WIDTH - 40, `${kSquares} squares, ${Math.round(kBoard?.width ?? 0)} px wide`);
    const wantsShown = await kindy.locator('.kid-wants').count();
    check('the snack each kid wants is a picture over their head', wantsShown === kp.kids.filter((k) => k.wave === 1).length && (await kindy.locator('.kid-wants .art-snack').count()) === wantsShown);
    await checkOnScreen('Kindy art: the wanted-snack bubble over each kid is inside the viewport', kindy.locator('.kid-wants'));
    await checkOnScreen('Kindy art: each kid is drawn, inside the viewport', kindy.locator('.board .kid .art-kid'));
    await checkOnScreen('Kindy art: the friends in the tray are drawn, inside the viewport', kindy.locator('.kindy-friend .art-friend'));
    await checkOnScreen('Kindy art: every lunchbox is drawn with its snack, inside the viewport', kindy.locator('.board .art-lunchbox'));
    const bubbleClear = await kindy.locator('.kid-wants').evaluateAll((els) => {
      const board = document.querySelector('.board')!.getBoundingClientRect();
      return els.every((el) => {
        const b = el.getBoundingClientRect();
        return b.top >= board.top - 0.5 && b.left >= board.left - 0.5 && b.right <= board.right + 0.5;
      });
    });
    check('Kindy art: no wanted-snack bubble is cut off by the edge of the board', bubbleClear);
    for (const part of ['.board', '.kindy-tray', '.kindy-basket', '.kindy-go', '.kindy-ask', '.kindy-avatar', '.kindy-slots']) await checkOnScreen(`Kindy setup: ${part.slice(1)} is inside the viewport`, kindy.locator(part));
    const kGo = await kindy.locator('.kindy-go').boundingBox();
    check('Kindy: the big green Go is in the bottom third', kGo !== null && kGo.y >= (HEIGHT * 2) / 3 && kGo.width >= 80, `top ${Math.round(kGo?.y ?? 0)}, ${Math.round(kGo?.width ?? 0)} px`);
    await bigTargets(page, '.kindy-game button', 64, 'Kindy setup, every button');
    await bigTargets(page, '.kindy-game .board .sq', 64, 'Kindy setup, every square');
    await noText(page, 'Kindy setup');
    await noHorizontalScroll(page, 'Kindy setup');
    await noVerticalScroll(page, 'Kindy setup');
    await shot(page, '13-kindy-setup');

    // Left alone: the hand shows itself. Nothing is said yet: no tap has unlocked the voice.
    const idleMs = SNACK_TUNABLES.kindyHintIdle.value * 1000;
    await page.waitForTimeout(idleMs - 1500);
    const tooSoon = await kindy.locator('[data-hint="to"]').count();
    await page.waitForTimeout(2500);
    const hand = await page.locator('.kindy-hand').getAttribute('data-on');
    check(`left alone for ${idleMs / 1000} s, a pointing hand shows the next step (and not before)`, tooSoon === 0 && hand !== 'no' && (await kindy.locator('[data-hint="to"]').count()) === 1, `hand ${hand}`);
    check('before any tap, nothing is spoken (iOS needs a tap first)', (await spoken(page)).length === 0);
    await noText(page, 'Kindy hint');
    await shot(page, '14-kindy-hint');

    // The first tap follows the hand: it unlocks the voice, which says the hint showing; the friend lights its aim squares.
    const firstStep = await followHand(page);
    check('the first tap unlocks the voice, and the hint showing is said out loud', firstStep !== null && (await until(page, async () => (await spoken(page)).length > 0)), (await spoken(page)).join(' / '));
    const lit = await kindy.locator('.board .sq-aimable').count();
    check('a friend just put out lights at most 4 big squares to aim at, each with an arrow', lit > 0 && lit <= 4 && (await kindy.locator('.board .sq-aimable .aim-arrow').count()) === lit, `${lit} squares`);
    await noText(page, 'Kindy aiming');
    await shot(page, '15-kindy-aim');

    // The rest of the day: only what the hand points at.
    const steps: string[] = [];
    let smallest = Infinity;
    let fedSeen = 0;
    let stuck = false;
    for (let i = 0; i < 80 && (await page.locator('.kindy-party').count()) === 0; i++) {
      const done = await followHand(page);
      if (done === null) {
        stuck = true;
        break;
      }
      smallest = Math.min(smallest, ...done.sizes);
      steps.push(done.go ? 'go' : 'tap');
      if (done.go) {
        await kindyWaveDone(page);
        fedSeen = Math.max(fedSeen, await kindy.locator('.kindy-slots li.fed').count());
      }
    }
    const party = page.getByRole('dialog', { name: 'Everyone is fed' });
    check('the rest of the Kindy day is played by tapping only what the hand points at, and every kid is fed', !stuck && (await party.count()) === 1 && fedSeen >= kp.kids.length - 1, `${steps.filter((x) => x === 'go').length} waves, ${steps.length} taps, ${fedSeen} faces filled${stuck ? ', NO HAND' : ''}`);
    check('every target the hand pointed at is at least 64 px', smallest >= 64, `${Math.round(smallest)} px`);
    const said = await spoken(page);
    check('the hints were said out loud, in a few words', said.length > 0 && said.every((t) => Object.values(HINT_LINES).includes(t)), said.slice(0, 4).join(' / '));

    // The party, then done for today in pictures.
    await checkOnScreen('the Kindy party: its big button is inside the viewport', party.locator('.kindy-next'));
    await bigTargets(page, '.kindy-party button', 64, 'the Kindy party');
    await noText(page, 'the Kindy party');
    await shot(page, '17-kindy-party');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const partyFps = await measureFps(page, 1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('the Kindy party holds 55+ fps with the CPU slowed 4x', partyFps.frames >= 55, `${partyFps.frames.toFixed(1)} fps, worst frame ${Math.round(partyFps.worst)} ms`);
    await party.locator('.kindy-next').tap();
    const kDone = kindy.getByRole('region', { name: 'Done for today' });
    await kDone.waitFor();
    // The Kindy reveal: a picture only, popping and glowing (full motion here), put away by a tap.
    check('Kindy done for today: a reveal shows the sticker just earned, as a picture', (await page.locator('.reveal-kindy').count()) === 1 && (await page.locator('.reveal-kindy .reveal-item .sticker:not(.sticker-locked)').count()) === 1);
    check('the Kindy reveal pops and glows with full motion', (await runningAnimations(page, 'reveal-pop')) >= 1 && (await runningAnimations(page, 'reveal-glow')) >= 1);
    await page.waitForTimeout(1500);
    await revealOnScreen(page, 'the Kindy reveal');
    await noText(page, 'the Kindy reveal');
    await shot(page, '17a-kindy-reveal');
    await page.locator('.reveal-kindy').tap();
    check('a tap skips the Kindy reveal at once', await until(page, async () => (await page.locator('.reveal').count()) === 0));
    const gone = Number(await kDone.locator('.kindy-night').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--gone')));
    check('Kindy done for today: the sleeping sun, the moon on its way to the next puzzle, a face per kid fed, the week’s stars', (await kDone.locator('.kindy-sun').count()) === 1 && gone > 0 && gone < 1 && (await kDone.locator('.kindy-fed li').count()) === kp.kids.length && (await kDone.locator('.kindy-week li.on').count()) >= 1, `moon ${gone.toFixed(2)} of the way`);
    for (const part of ['.kindy-sun', '.kindy-night', '.kindy-fed', '.kindy-week', '.kindy-again']) await checkOnScreen(`Kindy done for today: ${part.slice(1)} is inside the viewport`, kDone.locator(part));
    await bigTargets(page, '.kindy-game button', 64, 'Kindy done for today');
    await noText(page, 'Kindy done for today');
    await noVerticalScroll(page, 'Kindy done for today');
    await noHorizontalScroll(page, 'Kindy done for today');
    await shot(page, '18-kindy-done');
    // The Kindy sticker book: pictures only, arrows and dots, a house to go back.
    await checkOnScreen('Kindy done for today: the sticker book button is inside the viewport', kDone.locator('.kindy-book'));
    await kDone.locator('.kindy-book').tap();
    const kBook = page.getByRole('dialog', { name: 'Sticker book' });
    await kBook.waitFor();
    await noText(page, 'the Kindy sticker book');
    await bookOnScreen(page, 'the Kindy sticker book', true);
    check('Kindy book: four pages (no gold page without a bonus round), shown as dots', (await kBook.locator('.book-dots li').count()) === 4 && (await kBook.locator('.book-page-name').count()) === 0);
    const kCount = await countBook(page, 4);
    check('Kindy book: one sticker earned in colour, the other 23 silhouettes', kCount.slots === 24 && kCount.earned === 1 && kCount.locked === 23, `${kCount.slots} slots, ${kCount.earned} earned, ${kCount.locked} locked`);
    check('Kindy book: nothing earned to wear yet, the four hats and outfits are silhouettes', (await kBook.locator('.book-wear > li[data-earned="no"]').count()) === 4);
    await shot(page, '18a-kindy-book');
    await kBook.getByRole('button', { name: 'Back', exact: true }).tap();
    await kDone.waitFor();
    check('closing the Kindy book returns to done for today', (await kBook.count()) === 0);
    await page.reload();
    await page.locator('.picker').waitFor();
    await tile(page, 'Pip').tap();
    await kDone.waitFor();
    check('reopening a finished Kindy daily shows done for today again', (await kindy.locator('.board').count()) === 0);
    await kDone.locator('.kindy-again').tap();
    await until(page, async () => (await kindy.locator('.board .sq').count()) === 16);
    check('Kindy practice: a new 4 x 4 board, still no text', (await kindy.locator('.board .sq').count()) === 16);
    await noText(page, 'Kindy practice');

    // A grown-up turns the voice off: the hand still shows, nothing is said.
    await kindy.locator('.kindy-avatar').tap();
    await page.locator('.picker').waitFor();
    await grownUps(page, cdp);
    const voice = page.getByRole('button', { name: /Kindy spoken hints/ });
    await checkOnScreen('the grown-ups’ menu: the Kindy voice switch is inside the viewport', voice);
    await voice.tap();
    check('the grown-ups’ menu turns Kindy’s spoken hints off', ((await voice.textContent()) ?? '').includes('off'));
    await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.sheet-close').tap();
    await tile(page, 'Pip').tap();
    await kindy.locator('.board').waitFor();
    await page.evaluate('window.__spoken.length = 0');
    await kindy.locator('.kindy-ask').tap();
    await until(page, async () => (await kindy.locator('[data-hint="to"]').count()) > 0);
    await page.waitForTimeout(300);
    check('with the voice off, the hand still shows and nothing is said', (await kindy.locator('[data-hint="to"]').count()) === 1 && (await spoken(page)).length === 0);
    await kindy.locator('.kindy-avatar').tap();
    await page.locator('.picker').waitFor();

    // ---- deleting asks first ----
    await grownUps(page, cdp);
    await page.getByRole('button', { name: 'Delete Pip' }).tap();
    const confirm = page.getByRole('dialog', { name: 'Delete Pip?' });
    await checkOnScreen('deleting a profile asks first, inside the viewport', confirm.getByRole('button', { name: 'Yes, delete Pip' }));
    await checkOnScreen('deleting a profile: Keep is inside the viewport', confirm.getByRole('button', { name: 'Keep Pip' }));
    await shot(page, '19-delete');
    await confirm.getByRole('button', { name: 'Yes, delete Pip' }).tap();
    await until(page, async () => (await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.parent-list li').count()) === 2);
    await page.getByRole('dialog', { name: 'Grown-ups' }).locator('.sheet-close').tap();
    check('a deleted profile is gone from the picker', (await page.locator('.picker-tile').count()) === 2 && (await tile(page, 'Pip').count()) === 0);

    // ---- the first child finishes the daily: done for today ----
    await tile(page, 'Dog').tap();
    await until(page, async () => (await barStats(page)).includes('3/10'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await resetRecorder(page);
    const rest: string[] = [];
    let busiest: Promise<{ frames: number; worst: number }> | null = null;
    let calm: Recorded[] = [];
    for (const layout of puzzle.witness.slice(2)) {
      // One hint on wave 3: done for today counts it, and the streak doesn't mind.
      if (layout.wave === 3) await page.locator('.btn-hint').tap();
      // The last wave, the busiest of the day, at full motion with the CPU slowed 4x.
      const last = layout.wave === puzzle.waves;
      const fed = await playWaveByTaps(page, cdp, puzzle, layout, !last ? undefined : async () => {
        calm = await recorded(page);
        await page.emulateMedia({ reducedMotion: null });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        busiest = page.waitForTimeout(150).then(() => measureFps(page, 2000));
      });
      if (last && busiest !== null) {
        const fps = await (busiest as Promise<{ frames: number; worst: number }>);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const snacks = layout.friends.filter((f) => f.type !== 'nurse').length;
        check(`the busiest wave (${layout.wave}) replays at 55+ fps with the CPU slowed 4x`, fps.frames >= 55, `${fps.frames.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms, ${layout.friends.length} friends, ${snacks} throwing`);
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }
      rest.push(`${layout.wave}${fed ? '' : ' NOT FED'}`);
      if (layout.wave < puzzle.waves) await page.getByRole('button', { name: new RegExp(`Set up wave ${layout.wave + 1}`) }).tap();
    }
    check('waves 3-10 played by taps, every kid fed', rest.every((r) => !r.includes('NOT')), rest.join(', '));
    const lively = calm.filter((a) => (a.cls === 'fly-lift' && /translateY\(-[1-9]|rotate\([1-9]/.test(a.transforms)) || (/\bkid\b|art-friend|sparkle/.test(a.cls) && a.transforms.replace(/none|\s|\|/g, '') !== ''));
    check('with reduced motion, the calm replay: no arcs, spins, dances, wobbles or sparkles', calm.length > 0 && lively.length === 0, `${calm.length} animations, ${lively.length} lively: ${lively.slice(0, 3).map((a) => a.cls).join(', ')}`);
    check('the shop flow ran: earned, bought, gave back, bought again, swiped closed, placed and played', shopFlow !== null, shopFlow === null ? 'no wave of today’s plan buys a friend' : `wave ${shopFlow.wave}, a ${FRIEND_NAME[shopFlow.type]}`);
    await page.getByRole('button', { name: 'See today’s result' }).tap();
    const doneScreen = page.getByRole('region', { name: 'Done for today' });
    await doneScreen.waitFor();
    // ---- the reveal (RULES 9a, K12): what the daily earned; reduced motion makes it still, and it puts itself away ----
    check('done for today: a reveal shows the sticker just earned', (await page.locator('.reveal').count()) === 1 && (await page.locator('.reveal-item .sticker:not(.sticker-locked)').count()) === 1);
    check('reduced motion: the reveal does not pop or glow', (await runningAnimations(page, 'reveal-pop')) === 0 && (await runningAnimations(page, 'reveal-glow')) === 0);
    await revealOnScreen(page, 'the reveal');
    await noEmoji(page, 'the reveal');
    await shot(page, '19a-reveal');
    check('the reveal puts itself away, without a tap', await revealGone(page));
    check('and the sticker is kept as seen, so the reveal plays once', (await page.locator('.reveal').count()) === 0);
    const doneText = await doneScreen.innerText();
    check('done for today: the result, the streak, a countdown', /Kids fed: \d+/.test(doneText) && /Went home hungry: 0 of 3/.test(doneText) && /first go/.test(doneText) && /Streak: 1 day/.test(doneText) && /Next puzzle in \d+:\d\d:\d\d/.test(doneText), doneText.replace(/\s+/g, ' '));
    const clock1 = (await doneScreen.locator('.done-clock').textContent()) ?? '';
    // With DAY set the page's clock is fixed at midday: move it on instead of waiting.
    if (process.env.DAY !== undefined) await page.clock.setFixedTime(DAY * 86_400_000 + 43_205_000);
    await page.waitForTimeout(2100);
    const clock2 = (await doneScreen.locator('.done-clock').textContent()) ?? '';
    check('the countdown runs', clock1 !== clock2, `${clock1} then ${clock2}`);
    check('done for today counts the hints used, and the streak still counts the day', /Hints used: 1 hint/.test(doneText) && /Streak: 1 day/.test(doneText), doneText.replace(/\s+/g, ' '));
    await checkOnScreen('done for today: the hints row is inside the viewport', doneScreen.locator('[data-row="hints"]'));
    for (const part of ['.done-title', '.done-rows', '.week', '.done-next']) await checkOnScreen(`done for today: ${part.slice(1)} is inside the viewport`, doneScreen.locator(part));
    const bonusBtn = doneScreen.getByRole('button', { name: 'Play the bonus round' });
    await checkOnScreen('done for today: the bonus round is inside the viewport', bonusBtn);
    await checkOnScreen('done for today: practice is inside the viewport', doneScreen.getByRole('button', { name: 'Practice board' }));
    const bonusBox = await bonusBtn.boundingBox();
    check('done for today: its buttons are in the bottom third', bonusBox !== null && bonusBox.y >= (HEIGHT * 2) / 3, `top ${Math.round(bonusBox?.y ?? 0)}`);
    check('the top bar’s streak is 1', ((await page.locator('.bar-streak').textContent()) ?? '').trim() === '1');
    await noVerticalScroll(page, 'done for today');
    await noHorizontalScroll(page, 'done for today');
    await touchTargets(page, 'done for today');
    await shot(page, '20-done');
    // ---- the sticker book from done for today ----
    await checkOnScreen('done for today: the sticker book button is inside the viewport', doneScreen.getByRole('button', { name: 'Sticker book' }));
    await doneScreen.getByRole('button', { name: 'Sticker book' }).tap();
    const bookDialog = page.getByRole('dialog', { name: 'Sticker book' });
    await bookDialog.waitFor();
    await bookOnScreen(page, 'the sticker book', false);
    const counted = await countBook(page, 5);
    check('the book: five pages of six, one sticker earned in colour, the other 29 silhouettes', counted.slots === 30 && counted.earned === 1 && counted.locked === 29, `${counted.slots} slots, ${counted.earned} earned, ${counted.locked} locked`);
    check('the book: nothing to wear yet, every hat and outfit a silhouette', (await bookDialog.locator('.book-wear > li[data-earned="yes"]').count()) === 0 && (await bookDialog.locator('.book-wear > li[data-earned="no"]').count()) === 4);
    await shot(page, '20a-book');
    await bookDialog.getByRole('button', { name: 'Back', exact: true }).tap();
    await doneScreen.waitFor();
    check('closing the book returns to done for today', (await bookDialog.count()) === 0);
    await page.reload();
    await page.locator('.picker').waitFor();
    check('the picker shows the first child’s streak, not Sam’s', (await tile(page, 'Dog').locator('.picker-streak').count()) === 1 && (await tile(page, 'Sam').locator('.picker-streak').count()) === 0);
    await tile(page, 'Dog').tap();
    await doneScreen.waitFor();
    check('reopening a finished daily shows done for today, not the board', (await page.locator('.board').count()) === 0);
    await doneScreen.getByRole('button', { name: 'Practice board' }).tap();
    await page.locator('.bar-title', { hasText: 'Practice' }).waitFor();
    check('practice is still there after the daily, and keeps the streak', ((await page.locator('.bar-streak').textContent()) ?? '').trim() === '1');
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
      check('an old save opens as the first profile, at the same wave, with its finished day', stats.includes('2/10') && (await friendsOnBoard(oldPage)) === first.friends.length && oldStreak.trim() === '1', `${stats}, ${oldStreak}`);
      await old.close();
    } finally {
      rmSync(oldProfile, { recursive: true, force: true });
    }

    // ---- the sticker book and outfits (RULES 9a, K12) ----
    // A profile book as the last version wrote it (version 1: six days finished, no stickers), wave 10 of
    // today to play. The app migrates it, the last wave is played by touch, and the 7th day in a row earns a scarf.
    const bookDir = mkdtempSync(join(tmpdir(), 'snacks-book-'));
    try {
      const nine = new GameSession(startGame(generatePuzzle('main', 'daily', DAY, 0)));
      for (const layout of nine.state.puzzle.witness.slice(0, 9)) for (const c of witnessCommands(nine.state, layout)) nine.submit(c);
      const days = [6, 5, 4, 3, 2, 1].map((back) => ({ day: DAY - back, fed: 14, hungry: 1, retries: 0, hints: 0, bonus: false }));
      const oldBook = { format: 'snack-attack-profiles', version: 1, nextId: 2, profiles: [{ id: 'p1', name: '', avatar: 'dog', mode: 'main', history: days, best: 6, active: `daily-main-${DAY}` }] };
      const seed = `(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('snacks', 2);
        req.onupgradeneeded = () => { req.result.createObjectStore('slots', { keyPath: 'slot' }); req.result.createObjectStore('meta', { keyPath: 'key' }); };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['slots', 'meta'], 'readwrite');
          tx.objectStore('meta').put({ key: 'profiles', value: ${JSON.stringify(oldBook)} });
          tx.objectStore('slots').put({ slot: 'p1/daily-main-${DAY}', savedAt: 0, game: ${JSON.stringify(nine.save())} });
          tx.oncomplete = () => { db.close(); resolve(true); };
        };
      }))()`;
      const bctx = await chromium.launchPersistentContext(bookDir, { executablePath: chromiumPath(), viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
      const bp = bctx.pages()[0] ?? (await bctx.newPage());
      if (process.env.DAY !== undefined) await bp.clock.setFixedTime(DAY * 86_400_000 + 43_200_000);
      // Seeded from a page of this origin that does not run the app, so the app finds the old book when it opens.
      await bp.goto(`${URL}manifest.webmanifest`);
      await bp.evaluate(seed);
      await bp.goto(URL);
      await bp.locator('.board').waitFor({ timeout: 10_000 });
      const bcdp = await bctx.newCDPSession(bp);
      check('a version-1 profile book opens as it was: the same profile, wave 10, a streak of 6', (await barStats(bp)).includes('10/10') && ((await bp.locator('.bar-streak').textContent()) ?? '').trim() === '6');

      // The menu opens the book: the old days gave their stickers and the 3-day hat, none of it shown as new.
      await bp.getByRole('button', { name: 'Menu' }).tap();
      await checkOnScreen('the menu: the sticker book entry is inside the viewport', bp.getByRole('button', { name: 'Sticker book' }));
      await bp.getByRole('button', { name: 'Sticker book' }).tap();
      const bb = bp.getByRole('dialog', { name: 'Sticker book' });
      await bb.waitFor();
      await bookOnScreen(bp, 'the sticker book with six days behind it', false);
      const seeded = await countBook(bp, 5);
      check('the migrated book holds the six days’ stickers in colour and the other 24 as silhouettes', seeded.earned === 6 && seeded.locked === 24 && seeded.slots === 30, `${seeded.earned} earned, ${seeded.locked} locked`);
      check('the migrated book earned the 3-day party hat; the scarf, crown and cape are not yet', (await bb.locator('.book-wear > li[data-cosmetic-slot="party-hat"][data-earned="yes"]').count()) === 1 && (await bb.locator('.book-wear > li[data-earned="no"]').count()) === 3);
      check('nothing is worn yet: neither the top bar nor the book’s avatar', (await bp.locator('.bar-avatar .cosmetic-layer, .book-me .cosmetic-layer').count()) === 0);

      // Wear the hat; the child's own avatar shows it, in the book and on the game screen.
      const hatBtn = bb.getByRole('button', { name: /Party hat/ });
      await checkOnScreen('the party hat button is inside the viewport', hatBtn);
      await hatBtn.tap();
      await settled(bp, async () => (await hatBtn.getAttribute('aria-pressed')) === 'true');
      check('wearing the party hat: the button says so and the avatar in the book wears it', (await hatBtn.getAttribute('aria-pressed')) === 'true' && (await bb.locator('.book-me .cosmetic-layer[data-cosmetic="party-hat"]').count()) === 1 && ((await hatBtn.textContent()) ?? '').includes('Wearing'));
      await bookOnScreen(bp, 'the sticker book with the party hat on', false);
      await shot(bp, '20b-book-hat');
      await bb.getByRole('button', { name: 'Back', exact: true }).tap();
      await bp.locator('.board').waitFor();
      check('the hat is on the top bar’s avatar, inside the viewport', (await bp.locator('.bar-avatar .cosmetic-layer[data-cosmetic="party-hat"]').count()) === 1);
      await checkOnScreen('the top bar: the avatar wearing its hat is inside the viewport', bp.locator('.bar-avatar'));
      await insideViewport('the top bar: the hat itself is inside the viewport', bp.locator('.bar-avatar .cosmetic-layer'));

      // Never on the kids: nothing worn is drawn on the board, on a kid's card, or in a clue card.
      const wear = async (): Promise<{ board: number; cards: number; kids: number; stray: number }> =>
        (await bp.evaluate(`({
          board: document.querySelectorAll('.board .cosmetic-layer, .board [data-cosmetic]').length,
          cards: document.querySelectorAll('.clue-chip .cosmetic-layer, .clue-chip [data-cosmetic], [role="dialog"][aria-label="Clue card"] [data-cosmetic]').length,
          kids: document.querySelectorAll('.board .kid .art-kid').length,
          stray: [...document.querySelectorAll('.cosmetic-layer')].filter((el) => el.closest('.avatar') === null).length,
        })`)) as { board: number; cards: number; kids: number; stray: number };
      const w0 = await wear();
      check('with a hat on, no kid on the board and no card wears anything: cosmetics are the avatar’s alone', w0.kids > 0 && w0.board === 0 && w0.cards === 0 && w0.stray === 0, `${w0.kids} kids, ${w0.board} on the board, ${w0.cards} on cards, ${w0.stray} stray`);
      const bkid = generatePuzzle('main', 'daily', DAY, 0).kids.find((k) => k.wave === 10) ?? generatePuzzle('main', 'daily', DAY, 0).kids[0]!;
      await cellOf(bp, bkid.cell).tap();
      const bcard = bp.getByRole('dialog', { name: 'Clue card' });
      await bcard.waitFor({ timeout: 2000 });
      const w1 = await wear();
      check('and the clue card shows the kid’s own hat, glasses and backpack, never the player’s', w1.cards === 0 && w1.board === 0, `${w1.cards} cosmetic layers in the card`);
      await bcard.getByRole('button', { name: 'Close' }).tap();

      // The last wave by touch: the 7th day in a row.
      const bpuzzle = generatePuzzle('main', 'daily', DAY, 0);
      const fedLast = await playWaveByTaps(bp, bcdp, bpuzzle, bpuzzle.witness[9]!);
      check('the seeded daily’s last wave is played by taps and feeds every kid', fedLast);
      await bp.getByRole('button', { name: 'See today’s result' }).tap();
      const bdone = bp.getByRole('region', { name: 'Done for today' });
      await bdone.waitFor();

      // The reveal, with full motion: the 7th sticker and the scarf pop out.
      check('done for today: the reveal shows a new sticker and a new outfit', (await bp.locator('.reveal-item').count()) === 2 && (await bp.locator('.reveal-item .sticker').count()) === 1 && (await bp.locator('.reveal-item .avatar[data-avatar]').count()) === 1 && (await bp.locator('.reveal-item .cosmetic-layer[data-cosmetic="scarf"]').count()) === 1);
      check('the reveal pops and glows with full motion, and says it can be skipped', (await runningAnimations(bp, 'reveal-pop')) >= 2 && (await runningAnimations(bp, 'reveal-glow')) >= 1 && ((await bp.locator('.reveal-skip').textContent()) ?? '').includes('Tap to skip'));
      await bp.waitForTimeout(1500);
      await revealOnScreen(bp, 'the reveal with a sticker and a scarf');
      await shot(bp, '20c-reveal');
      await bp.locator('.reveal').tap();
      check('a tap skips the reveal at once', await until(bp, async () => (await bp.locator('.reveal').count()) === 0));
      const bdoneText = await bdone.innerText();
      check('done for today after the seventh day: the streak is 7', /Streak: 7 days/.test(bdoneText), bdoneText.replace(/\s+/g, ' '));
      await checkOnScreen('done for today: the sticker book button is inside the viewport', bdone.getByRole('button', { name: 'Sticker book' }));
      await bp.reload();
      await bdone.waitFor();
      await bp.waitForTimeout(700);
      check('a skipped reveal does not play again when the app is opened again', (await bp.locator('.reveal').count()) === 0);

      // The book now: seven stickers, two hats and outfits; wear the scarf as well.
      await bdone.getByRole('button', { name: 'Sticker book' }).tap();
      await bb.waitFor();
      const after = await countBook(bp, 5);
      check('the book holds seven stickers in colour, one for each day', after.earned === 7 && after.locked === 23 && new Set(after.names).size === 7, `${after.earned} earned, ${after.locked} locked`);
      check('the scarf was earned on the 7th day', (await bb.locator('.book-wear > li[data-cosmetic-slot="scarf"][data-earned="yes"]').count()) === 1 && (await bb.locator('.book-wear > li[data-earned="no"]').count()) === 2);
      check('the party hat is still on after reopening the app', (await bb.locator('.book-me .cosmetic-layer[data-cosmetic="party-hat"]').count()) === 1);
      const scarfBtn = bb.getByRole('button', { name: /Scarf/ });
      await scarfBtn.tap();
      await settled(bp, async () => (await scarfBtn.getAttribute('aria-pressed')) === 'true');
      check('wearing the scarf too: hat and outfit together on the avatar', (await scarfBtn.getAttribute('aria-pressed')) === 'true' && (await bb.locator('.book-me .cosmetic-layer[data-cosmetic="party-hat scarf"]').count()) === 1);
      await bookOnScreen(bp, 'the sticker book wearing a hat and a scarf', false);
      await shot(bp, '20d-book-outfit');
      await hatBtn.tap();
      await settled(bp, async () => (await hatBtn.getAttribute('aria-pressed')) === 'false');
      check('tapping the hat again takes it off and leaves the scarf', (await hatBtn.getAttribute('aria-pressed')) === 'false' && (await bb.locator('.book-me .cosmetic-layer[data-cosmetic="scarf"]').count()) === 1);
      await hatBtn.tap();
      await settled(bp, async () => (await hatBtn.getAttribute('aria-pressed')) === 'true');
      await bb.getByRole('button', { name: 'Back', exact: true }).tap();
      await bdone.waitFor();
      check('back on done for today, the top bar’s avatar wears both', (await bp.locator('.bar-avatar .cosmetic-layer[data-cosmetic="party-hat scarf"]').count()) === 1);
      await insideViewport('done for today: the avatar in the top bar, dressed, is inside the viewport', bp.locator('.bar-avatar .cosmetic-layer'));
      await bp.reload();
      await bdone.waitFor();
      check('what is worn is kept when the app is closed and opened again', (await bp.locator('.bar-avatar .cosmetic-layer[data-cosmetic="party-hat scarf"]').count()) === 1);
      await bdone.getByRole('button', { name: 'Practice board' }).tap();
      await bp.locator('.board').waitFor();
      const w2 = await wear();
      check('on a practice board, dressed, nobody else wears it: no kid, card or friend', w2.kids > 0 && w2.board === 0 && w2.cards === 0 && w2.stray === 0, `${w2.kids} kids, ${w2.board} on the board`);
      await bctx.close();
    } finally {
      rmSync(bookDir, { recursive: true, force: true });
    }

    // ---- Kindy: a wrong snack, on the first day from here whose wave 1 can throw one ----
    let wrongDay = DAY;
    while (wrongThrow(generatePuzzle('kindy', 'daily', wrongDay, 0)) === null && wrongDay < DAY + 60) wrongDay++;
    const wp = generatePuzzle('kindy', 'daily', wrongDay, 0);
    const wrong = wrongThrow(wp);
    const wrongProfile = mkdtempSync(join(tmpdir(), 'snacks-kindy-'));
    try {
      const wctx = await chromium.launchPersistentContext(wrongProfile, { executablePath: chromiumPath(), viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
      const wpage = wctx.pages()[0] ?? (await wctx.newPage());
      await wpage.clock.setFixedTime(wrongDay * 86_400_000 + 43_200_000);
      await wpage.goto(URL);
      await wpage.locator('.board').waitFor();
      const wcdp = await wctx.newCDPSession(wpage);
      await openPicker(wpage);
      await grownUps(wpage, wcdp);
      await addChild(wpage, 'Frog', 'Pip', 'Kindy');
      await wpage.getByRole('dialog', { name: 'Grown-ups' }).locator('.sheet-close').tap();
      await tile(wpage, 'Pip').tap();
      const wk = wpage.getByRole('region', { name: 'Kindy' });
      await wk.locator('.board').waitFor();
      if (wrong === null) check('Kindy wrong snack: a day to try it on', false, `none from day ${DAY} to ${wrongDay}`);
      else {
        for (const f of wrong) {
          await wk.locator('.kindy-friend').first().tap();
          await cellOf(wpage, f.cell).tap();
          await until(wpage, () => hasFriend(wpage, f.cell));
          if (f.aimAt !== null) await cellOf(wpage, f.aimAt).tap();
        }
        const kid1 = wp.kids.find((k) => k.wave === 1)!;
        await wk.locator('.kindy-go').tap();
        const shaking = async (): Promise<boolean> => (await cellOf(wpage, kid1.cell).getAttribute('data-outcome')) === 'shake';
        const shook = (await until(wpage, shaking)) || (await until(wpage, shaking));
        await noText(wpage, 'Kindy replay of a wrong snack');
        await shot(wpage, '21-kindy-shake');
        check('Kindy: a wrong snack bounces off and the kid shakes their head', shook, `day ${wrongDay}, ${wrong.length} friend(s)`);
        await kindyWaveDone(wpage);
        const kidsNow = await wk.locator('.board .kid').count();
        const stayed = (await Promise.all(wrong.map((f) => hasFriend(wpage, f.cell)))).every(Boolean);
        check('then the kid waits, the board stays as it was, and the next kid arrives beside them', (await cellOf(wpage, kid1.cell).locator('.kid').count()) === 1 && stayed && kidsNow === 2 && (await wk.locator('.kindy-slots li.fed').count()) === 0, `${kidsNow} kids`);
        await noText(wpage, 'Kindy after a wrong snack');
        // Then the hand takes over and still finishes the day.
        let waves = 0;
        for (let i = 0; i < 80 && (await wpage.locator('.kindy-party').count()) === 0; i++) {
          const done = await followHand(wpage);
          if (done === null) break;
          if (done.go) {
            waves += 1;
            await kindyWaveDone(wpage);
          }
        }
        check('after a wrong snack, following the hand still feeds every kid', (await wpage.locator('.kindy-party').count()) === 1, `${waves} more waves`);
      }
      await wctx.close();
    } finally {
      rmSync(wrongProfile, { recursive: true, force: true });
    }
  } catch (error) {
    // A step that throws (a tap that times out) leaves a picture of the screen it stopped on.
    if (crashPage !== null) await shot(crashPage, 'zz-crash').catch(() => undefined);
    throw error;
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
