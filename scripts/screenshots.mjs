/**
 * Captures the phase-01 proof screenshots: every hero screen in light and dark, desktop and
 * mobile. Run the dev server first (`pnpm dev`), then `node scripts/screenshots.mjs`.
 *
 * `prefers-color-scheme` is emulated rather than toggled through the UI so the shots show what a
 * visitor sees on a device set that way — which is the case the palette was designed for.
 */
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'docs/screenshots');
mkdirSync(outDir, { recursive: true });

const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3000';
const pages = (process.argv[2] ?? 'note,new,error').split(',');

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 375, height: 812 },
];

const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const name of pages) {
      await page.goto(`${base}/dev/${name}`, { waitUntil: 'networkidle' });
      // KaTeX, Mermaid and smiles-drawer all arrive by dynamic import and draw on a later tick.
      await page.waitForTimeout(2500);
      const file = resolve(outDir, `${name}-${viewport.name}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${file.replace(`${root}/`, '')}`);
    }

    await context.close();
  }
}

await browser.close();
