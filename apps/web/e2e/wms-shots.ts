/**
 * Screenshots of the WMS screens (docs/wms-plan.md) on the 360 x 740 budget
 * phone: the order grid after five minutes, scrolled sideways, filtered to
 * exceptions, and (when they exist) an order's detail and the activity feed;
 * the countries, the inbound grid and a PO, and the inventory grid (W6).
 * Also reports whether the page scrolls sideways. Run `npm run build` first,
 * then `npx tsx e2e/wms-shots.ts [outDir]` from apps/web.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const PORT = 4183;
const URL = `http://localhost:${PORT}/`;

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

async function sideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

async function shot(page: Page, out: string, name: string): Promise<void> {
  await page.screenshot({ path: join(out, `wms-${name}.png`) });
  console.log(name, 'page scrolls sideways:', await sideways(page));
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'shots';
  mkdirSync(out, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'warehouse-wms-'));
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(URL);
    await page.getByTestId('dock-0').waitFor();
    await page.getByTestId('settings').tap();
    await page.getByTestId('skip-5').tap();
    await page.getByTestId('collect').tap({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    await shot(page, out, 'floor');
    await page.getByTestId('open-wms').tap();
    await page.getByTestId('wms-grid').waitFor();
    await page.waitForTimeout(1500);
    await shot(page, out, 'grid');
    await page.getByTestId('wms-grid').evaluate((el) => el.scrollBy(400, 0));
    await page.waitForTimeout(300);
    await shot(page, out, 'grid-scrolled');
    await page.getByTestId('wms-grid').evaluate((el) => el.scrollTo(0, 0));
    await page.getByTestId('wms-filter-exceptions').tap();
    await page.waitForTimeout(300);
    await shot(page, out, 'exceptions');
    await page.getByTestId('wms-filter-all').tap();
    const row = page.locator('[data-testid="wms-grid"] tbody tr').first();
    await row.tap();
    await page.waitForTimeout(500);
    if (await page.getByTestId('wms-detail').isVisible().catch(() => false)) {
      await shot(page, out, 'detail');
      await page.locator('.wms-lines tbody tr').first().tap();
      await page.waitForTimeout(400);
      await shot(page, out, 'line-actions');
      await page.getByTestId('wms-hold').tap();
      await page.waitForTimeout(1200);
      await shot(page, out, 'held');
    }
    if (await page.getByTestId('wms-detail-back').isVisible().catch(() => false)) await page.getByTestId('wms-detail-back').tap();
    if (await page.getByTestId('wms-choose').isVisible().catch(() => false)) {
      await page.getByTestId('wms-choose').tap();
      await page.getByRole('button', { name: /All NEW/ }).tap();
      await page.waitForTimeout(400);
      await shot(page, out, 'release');
      await page.getByRole('button', { name: 'Done' }).tap();
    }
    if (await page.getByTestId('wms-countries-tab').isVisible().catch(() => false)) {
      await page.getByTestId('wms-countries-tab').tap();
      await page.waitForTimeout(400);
      await shot(page, out, 'countries');
      await page.getByTestId('wms-filter-all').tap();
    }
    await page.getByTestId('wms-tab-inbound').tap();
    await page.getByTestId('wms-inbound').waitFor();
    await page.waitForTimeout(400);
    await shot(page, out, 'inbound');
    await page.getByTestId('wms-inbound').evaluate((el) => el.scrollBy(400, 0));
    await page.waitForTimeout(300);
    await shot(page, out, 'inbound-scrolled');
    const po = page.locator('[data-testid="wms-inbound"] tbody tr').first();
    if (await po.isVisible().catch(() => false)) {
      await po.tap();
      await page.waitForTimeout(400);
      await shot(page, out, 'po-detail');
      await page.getByTestId('wms-po-back').tap();
    }
    await page.getByTestId('wms-tab-inventory').tap();
    await page.getByTestId('wms-inventory').waitFor();
    await page.waitForTimeout(400);
    await shot(page, out, 'inventory');
    await page.getByTestId('wms-inventory').evaluate((el) => el.scrollBy(400, 0));
    await page.waitForTimeout(300);
    await shot(page, out, 'inventory-scrolled');
    await page.getByTestId('wms-tab-outbound').tap();
    const feed = page.getByTestId('wms-feed-toggle');
    if (await feed.isVisible().catch(() => false)) {
      await feed.tap();
      await page.waitForTimeout(400);
      await shot(page, out, 'feed');
    }
    await context.close();
  } finally {
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
