/**
 * Screenshots the workspace flow — ingest, review, note, hub, library, settings — at two widths in
 * both themes.
 *
 * These screens cannot be captured by navigating to a URL — there is nothing on them until files
 * have been read into IndexedDB — so this drives the real flow with the real fixtures and shoots
 * what comes out. That is also why it is worth having: it is the only way to look at the review
 * screen with a scanned page in it without doing the upload by hand every time.
 *
 *   pnpm dev
 *   pnpm shoot:app                  # against http://localhost:3000
 *   BASE=https://… pnpm shoot:app   # against a deployed preview
 *
 * Output lands in `screenshots/`, which is gitignored.
 */
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = 'screenshots/app';
const FIXTURES = resolve(process.cwd(), 'fixtures');

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '1440', width: 1440, height: 1000, mobile: false },
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await context.newPage();
    const shoot = (name) =>
      page.screenshot({ path: `${OUT}/${name}-${viewport.name}-${theme}.png`, fullPage: true });

    await page.goto(`${BASE}/app/new`);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await shoot('new-empty');

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles([
        resolve(FIXTURES, 'ap-chem-u1-raw.md'),
        resolve(FIXTURES, 'scanned-worksheet.pdf'),
      ]);
    await page.getByText(/^Read /).waitFor({ timeout: 30_000 });
    await shoot('new-read');

    await page.getByRole('button', { name: 'Review what we found' }).click();
    await page
      .getByRole('textbox', { name: /Text of the block/ })
      .first()
      .waitFor();
    await shoot('review');

    await page.getByRole('button', { name: 'Create study guide' }).click();
    await page.waitForURL(/\/app\/note\//);
    await shoot('note-draft');

    await page.goto(`${BASE}/app`);
    await page.getByRole('heading', { name: 'Pick up where you left off' }).waitFor();
    await shoot('hub');

    // The library and settings need nothing seeded beyond the note the flow above just made,
    // which is the point: this is what a student sees after one lesson, signed out.
    await page.goto(`${BASE}/app/library`);
    await page.getByRole('heading', { name: 'Your library' }).waitFor();
    await page.getByRole('tree').waitFor();
    await shoot('library');

    await page.goto(`${BASE}/app/settings`);
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await shoot('settings');

    await context.close();
  }
}

await browser.close();
console.log(`Wrote ${OUT}/`);
