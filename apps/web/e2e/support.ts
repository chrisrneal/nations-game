/**
 * Shared helpers for the phone check (phone-check.ts), the device check
 * (device-check.ts) and the performance check (perf-check.ts): the checks' own
 * bookkeeping, "is it inside the viewport", and driving a day by taps.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CDPSession, Locator, Page } from 'playwright-core';
import type { FriendType, PlacedFriend, Puzzle, WaveLayout } from '@snacks/contracts';
import { GameSession, gameView, generatePuzzle, resolveSnacks, startGame, step, witnessCommands } from '@snacks/sim';
import { lineEnds } from '../src/ui/aim.ts';
import { FRIEND_NAME, facingAngle, stepOf } from '../src/ui/labels.ts';
export const PORT = 4179;
export const URL = `http://localhost:${PORT}/`;
/** The budget phone by default; `PHONE=pixel10xl` checks a Pixel 10 Pro XL (412 x 915) instead. */
export const PHONE = process.env.PHONE === 'pixel10xl' ? { width: 412, height: 915, dpr: 3.25 } : { width: 360, height: 740, dpr: 2 };
export const WIDTH = PHONE.width;
export const HEIGHT = PHONE.height;
export const SHOTS = process.env.SHOTS;
export const DAY = process.env.DAY === undefined ? Math.floor(Date.now() / 86_400_000) : Number(process.env.DAY);
export const CHESS = /[♔-♟]/;

export function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

export const results: { name: string; ok: boolean; detail: string }[] = [];

export function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** Frames a second and the worst frame over `ms`, measured in the page. A string, not a function: tsx would inject a helper the page does not have. */
export async function measureFps(page: Page, ms: number): Promise<{ frames: number; worst: number }> {
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

export async function noHorizontalScroll(page: Page, where: string): Promise<void> {
  const width = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  check(`no horizontal scroll: ${where}`, width <= WIDTH, `scrollWidth ${width}`);
}

/** Nothing on the page scrolls vertically: everything for setup is on one screen. */
export async function noVerticalScroll(page: Page, where: string): Promise<void> {
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
export async function touchTargets(page: Page, where: string): Promise<void> {
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
export async function onScreen(locator: Locator): Promise<{ ok: boolean; detail: string }> {
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

export async function checkOnScreen(name: string, locator: Locator): Promise<boolean> {
  const r = await onScreen(locator);
  check(name, r.ok, r.detail);
  return r.ok;
}

export async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Polls until `test` holds (the host answers asynchronously), up to about 2 s. */
export async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  // `SLOW=4` (the performance check) gives every wait four times as long.
  const tries = 100 * (Number(process.env.SLOW) || 1);
  for (let i = 0; i < tries; i++) {
    if (await test()) return true;
    await page.waitForTimeout(20);
  }
  return false;
}

export const cellOf = (page: Page, cell: number): Locator => page.locator(`.board [data-cell="${cell}"]`);

/** The arrow's rotation on the friend in a square, in degrees. */
export async function arrowAngle(page: Page, cell: number): Promise<number | null> {
  const arrow = cellOf(page, cell).locator('.friend-arrow');
  if ((await arrow.count()) === 0) return null;
  const m = /rotate\((-?\d+)deg\)/.exec((await arrow.getAttribute('style')) ?? '');
  return m === null ? null : Number(m[1]);
}

export const hasFriend = async (page: Page, cell: number): Promise<boolean> => (await cellOf(page, cell).locator('.friend').count()) > 0;
export const friendsOnBoard = (page: Page): Promise<number> => page.locator('.board .friend').count();

export async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box to drag from or to');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A real touch drag (touch pointer events), finger down on `from`, moved in steps, lifted over `to`. */
export async function touchDrag(cdp: CDPSession, from: Locator, to: Locator): Promise<void> {
  const a = await centre(from);
  const b = await centre(to);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export const trayButton = (page: Page, type: FriendType): Locator => page.getByRole('button', { name: new RegExp(`^${FRIEND_NAME[type]}, \\d+ left`) });

export async function deselect(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done' });
  if ((await done.count()) > 0) await done.tap();
}

/** The square a tap aims a friend with this facing at: the first square of its throw. Null when that is off the board. */
export function aimCell(puzzle: Puzzle, friend: PlacedFriend): number | null {
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
export async function aimByTap(page: Page, puzzle: Puzzle, friend: PlacedFriend): Promise<'tap' | 'turn' | 'nurse' | 'failed'> {
  await deselect(page);
  await cellOf(page, friend.cell).tap();
  if (friend.type === 'nurse') {
    await until(page, async () => (await page.locator('.board .sq-heal').count()) > 0);
    const heals = await page.locator('.board .sq-heal').count();
    await deselect(page);
    return heals > 0 ? 'nurse' : 'failed';
  }
  const want = facingAngle(friend.type, friend.facing);
  const target = aimCell(puzzle, friend);
  let how: 'tap' | 'turn' = 'tap';
  if (target !== null) {
    // The friend's lit squares take a moment to draw on a slow phone.
    if (!(await until(page, async () => ((await cellOf(page, target).getAttribute('class')) ?? '').includes('sq-aimable')))) return 'failed';
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
export async function trayLeft(page: Page, type: FriendType): Promise<number> {
  const button = trayButton(page, type);
  if ((await button.count()) === 0) return 0;
  const m = /, (\d+) left/.exec((await button.getAttribute('aria-label')) ?? '');
  return m === null ? -1 : Number(m[1]);
}

export const shopSheet = (page: Page): Locator => page.getByRole('dialog', { name: 'Shop' });
export const shopCardOf = (page: Page, type: FriendType): Locator => shopSheet(page).locator(`.shop-card[data-type="${type}"]`);
export const shopPoints = async (page: Page): Promise<number> => Number(/(\d+) points?/.exec((await shopSheet(page).locator('.sheet-title').textContent()) ?? '')?.[1] ?? -1);

/** A finger pulls `from` down by `dy` px and lets go: a swipe down. */
export async function swipeDown(cdp: CDPSession, from: Locator, dy: number): Promise<void> {
  const a = await centre(from);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y + (dy * i) / 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Every card of the open shop, its parts and its buttons are inside the viewport, and nothing scrolls. */
export async function shopOnScreen(page: Page, where: string): Promise<void> {
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
export let shopFlow: { wave: number; type: FriendType } | null = null;

/**
 * Buys what the witness buys before this wave, through the shop sheet. The
 * first time there is something to buy, it also gives the first friend back
 * and buys it again, checking the tray and the points each time, and closes
 * the sheet with a swipe down instead of its close button.
 */
export async function buy(page: Page, cdp: CDPSession, wave: number, types: readonly FriendType[]): Promise<boolean> {
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
export function shopFlowPlayed(wave: number, fed: boolean, onBoard: readonly { type: FriendType }[]): void {
  if (shopFlow === null || shopFlow.wave !== wave) return;
  const type = shopFlow.type;
  check(`shop: the ${FRIEND_NAME[type]} bought for wave ${wave} was placed from the tray and the wave fed every kid`, fed && onBoard.some((f) => f.type === type));
}

/** Waits for the result over the board and checks it. */
export async function checkResult(page: Page, wave: number, kids: number): Promise<void> {
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
export async function bigTargets(page: Page, selector: string, min: number, where: string): Promise<void> {
  const sizes = (await page.locator(selector).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]))) as number[][];
  check(`targets at least ${min} px: ${where}`, sizes.length > 0 && sizes.every(([w, h]) => w! >= min && h! >= min), sizes.map(([w, h]) => `${w}x${h}`).join(', '));
}

/** A finger held on an element for `ms`, then lifted: a grown-up's press-and-hold. */
export async function touchHold(page: Page, cdp: CDPSession, target: Locator, ms: number): Promise<void> {
  const at = await centre(target);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export const barStats = async (page: Page): Promise<string> => (await page.locator('.bar-stats').textContent()) ?? '';

/** The friends on the board, by square and type, read from the screen. */
export async function boardFriends(page: Page): Promise<{ cell: number; type: FriendType }[]> {
  return page.locator('.board .sq:has(.friend)').evaluateAll((els) =>
    els.map((el) => ({ cell: Number(el.getAttribute('data-cell')), type: (/\bt-(\w+)/.exec(el.querySelector('.friend')?.className ?? '')?.[1] ?? '') as FriendType })),
  );
}

/**
 * Sets up one wave of the solver's plan by taps alone, from whatever is on
 * the board: buy, send friends the plan doesn't use to the tray, place the
 * rest from the tray, aim every one, press Go. True when every kid is fed.
 */
export async function playWaveByTaps(page: Page, cdp: CDPSession, puzzle: Puzzle, layout: WaveLayout, beforeGo?: () => Promise<void>): Promise<boolean> {
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
export async function noText(page: Page, where: string): Promise<void> {
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
export const spoken = async (page: Page): Promise<string[]> => ((await page.evaluate('window.__spoken ?? []')) as string[]).filter((t) => t.trim() !== '');

/** Waits until a Kindy wave has played out: Go is back, or the party is on. */
export async function kindyWaveDone(page: Page): Promise<boolean> {
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
export async function followHand(page: Page): Promise<{ sizes: number[]; go: boolean } | null> {
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
export function wrongThrow(puzzle: Puzzle): { cell: number; facing: number; aimAt: number | null }[] | null {
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
export const RECORDER = `(() => {
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

export interface Recorded {
  cls: string;
  props: string[];
  transforms: string;
}
export const recorded = async (page: Page): Promise<Recorded[]> => (await page.evaluate('window.__anims ?? []')) as Recorded[];
export const resetRecorder = (page: Page): Promise<unknown> => page.evaluate('window.__anims = []');

/** No emoji anywhere on the page (the art replaced them, K10): they look different on every phone. */
export async function noEmoji(page: Page, where: string): Promise<void> {
  const found = (await page.evaluate(`(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) if (/\\p{Extended_Pictographic}/u.test(n.textContent) && n.parentElement && n.parentElement.getBoundingClientRect().width > 0) out.push(n.textContent.trim().slice(0, 30));
    return out;
  })()`)) as string[];
  check(`no emoji on the page, only the art: ${where}`, found.length === 0, found.join(' | '));
}

export async function openPicker(page: Page): Promise<void> {
  await page.locator('.bar-avatar').tap();
  await page.locator('.picker').waitFor({ timeout: 5000 });
}

export const tile = (page: Page, name: string): Locator => page.getByRole('button', { name: `Play as ${name}` });

/** Opens the grown-ups' menu from the picker with a press-and-hold. */
export async function grownUps(page: Page, cdp: CDPSession): Promise<Locator> {
  await touchHold(page, cdp, page.locator('.hold-btn'), 1300);
  const menu = page.getByRole('dialog', { name: 'Grown-ups' });
  await menu.waitFor({ timeout: 3000 });
  return menu;
}

/** Adds a child in the grown-ups' menu. */
export async function addChild(page: Page, avatar: string, name: string, mode: 'Main' | 'Kindy', check?: (form: Locator) => Promise<void>): Promise<void> {
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
export function legacySaves(day: number): { slot: string; savedAt: number; game: unknown }[] {
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
export const setCrashPage = (page: Page | null): void => {
  crashPage = page;
};
export const getCrashPage = (): Page | null => crashPage;

export const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const DIST = DIST_DIR;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/** The build, served from disk, and a service worker whose bytes change when `version` does: a new deploy. */
export function serve(port: number): Promise<{ server: Server; bump(): void; swFetches(): number }> {
  let version = 0;
  let sw = 0;
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, path === '/' || path === '' ? 'index.html' : path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    let body: Buffer = readFileSync(file);
    if (file.endsWith('sw.js')) {
      sw += 1;
      body = Buffer.concat([body, Buffer.from(`\n// version ${version}\n`)]);
    }
    const headers: Record<string, string> = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' };
    if (/sw\.js$|index\.html$|\.webmanifest$/.test(file)) headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, bump: () => void (version += 1), swFetches: () => sw })));
}

