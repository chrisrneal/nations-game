/**
 * Screenshots for layout work: a Pixel 10 Pro XL (412 x 915 CSS px, DPR 3.25)
 * and the 360 x 740 budget phone, each with a new warehouse and a busy 8-dock
 * warehouse. Run `npm run build` first, then `npx tsx e2e/shots.ts [outDir]`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { busyWarehouse } from '../../../packages/harness/src/warehouse.ts';
import { WarehouseSession } from '@warehouse/sim';

const PORT = 4181;
const URL = `http://localhost:${PORT}/`;
const PHONES = [
  { name: 'pixel10xl', width: 412, height: 915, dpr: 3.25 },
  { name: 'small', width: 360, height: 740, dpr: 2 },
];

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'shots';
  mkdirSync(out, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    for (const phone of PHONES) {
      const profile = mkdtempSync(join(tmpdir(), 'warehouse-shots-'));
      const context = await chromium.launchPersistentContext(profile, {
        executablePath: chromiumPath(),
        viewport: { width: phone.width, height: phone.height },
        deviceScaleFactor: phone.dpr,
        isMobile: true,
        hasTouch: true,
      });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(URL);
      await page.getByTestId('dock-0').waitFor();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: join(out, `${phone.name}-new.png`) });
      await page.getByTestId('open-upgrades').tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, `${phone.name}-upgrades.png`) });
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().tap();
      const session = new WarehouseSession(busyWarehouse());
      const path = join(profile, 'busy.json');
      writeFileSync(path, JSON.stringify({ format: 'warehouse-idle-save', version: 1, exportedAt: Date.now(), game: { save: session.save({ compact: true }), anchor: Date.now() } }));
      await page.getByTestId('settings').tap();
      await page.getByTestId('import-file').setInputFiles(path);
      await page.getByTestId('dock-7').waitFor({ timeout: 5000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: join(out, `${phone.name}-busy.png`) });
      const scroll = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
      console.log(phone.name, 'busy scrollHeight/innerHeight', scroll.join('/'));
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  } finally {
    server.kill();
  }
}

await main();
