/**
 * Draws the home-screen assets that are not hand-made (decision record K12):
 * the maskable app icon (the picture shrunk into the circle Android may crop
 * it to) and the iPhone launch screens (a cream screen with the icon in the
 * middle), from public/icon.svg. Run `npm run assets --workspace web` after
 * changing the icon; the PNGs are committed, so a build needs no browser.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ICON = readFileSync(join(PUBLIC, 'icon.svg'), 'utf8');
const ICON_URI = `data:image/svg+xml;base64,${Buffer.from(ICON).toString('base64')}`;
const CREAM = '#fff8ec';
const YELLOW = '#f4c95d';

/** CSS pixels and pixel ratio of each iPhone launch screen (portrait). */
export const IPHONES: readonly { w: number; h: number; dpr: number }[] = [
  { w: 440, h: 956, dpr: 3 },
  { w: 430, h: 932, dpr: 3 },
  { w: 428, h: 926, dpr: 3 },
  { w: 402, h: 874, dpr: 3 },
  { w: 393, h: 852, dpr: 3 },
  { w: 390, h: 844, dpr: 3 },
  { w: 375, h: 812, dpr: 3 },
  { w: 414, h: 896, dpr: 3 },
  { w: 414, h: 896, dpr: 2 },
  { w: 375, h: 667, dpr: 2 },
];

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  // The maskable icon: the whole picture inside the middle 62%, on the icon's own yellow.
  const icon = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await icon.setContent(`<body style="margin:0;background:${YELLOW};display:grid;place-items:center;width:512px;height:512px"><img src="${ICON_URI}" style="width:318px;height:318px;border-radius:0"></body>`);
  writeFileSync(join(PUBLIC, 'pwa-maskable-512.png'), await icon.screenshot({ type: 'png' }));
  await icon.close();

  mkdirSync(join(PUBLIC, 'splash'), { recursive: true });
  for (const { w, h, dpr } of IPHONES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    const side = Math.round(w * 0.3);
    await page.setContent(`<body style="margin:0;background:${CREAM};display:grid;place-items:center;width:${w}px;height:${h}px"><img src="${ICON_URI}" style="width:${side}px;height:${side}px;border-radius:${Math.round(side * 0.22)}px;box-shadow:0 6px 24px rgba(0,0,0,.12)"></body>`);
    writeFileSync(join(PUBLIC, 'splash', `${w * dpr}x${h * dpr}.png`), await page.screenshot({ type: 'png' }));
    await ctx.close();
  }
  console.log(`wrote pwa-maskable-512.png and ${IPHONES.length} launch screens in ${PUBLIC}`);
} finally {
  await browser.close();
}
