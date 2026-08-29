/**
 * Screenshots every marketing section at two widths in both themes.
 *
 * The phase-02 definition of done asks whether each section would survive being shared as a
 * standalone image, which is a question you can only answer by looking at all of them side by side.
 * Doing it by hand means twenty-odd captures and forgetting one; this takes about a minute and
 * cannot forget.
 *
 *   pnpm shoot                      # against http://localhost:3000
 *   BASE=https://… pnpm shoot       # against a deployed preview
 *
 * Output lands in `screenshots/`, which is gitignored — these are for looking at, not for diffing.
 */
import { mkdir, rm } from 'node:fs/promises';

import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = 'screenshots';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

const THEMES = /** @type {const} */ (['light', 'dark']);

/** Section anchors on `/`, plus the routes that are worth a full-page look. */
const SECTIONS = [
  ['hero', 'section[aria-labelledby="hero-heading"]'],
  ['problem', 'section[aria-labelledby="problem-heading"]'],
  ['steps', 'section[aria-labelledby="steps-heading"]'],
  ['demo', '#real-lesson'],
  ['subjects', 'section[aria-labelledby="subjects-heading"]'],
  ['free', 'section[aria-labelledby="free-heading"]'],
  // `main ~ footer`, not `footer`: the embedded note has a footer of its own, and it comes first.
  ['footer', 'main ~ footer'],
  ['header', 'header'],
];

const PAGES = ['/how-it-works', '/about', '/privacy', '/terms', '/zh'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: 2,
      colorScheme: theme,
      // The scrubber autoplays; a moving element makes every capture of the hero different. This
      // is not a visual-regression suite, but a frozen frame is easier to judge.
      reducedMotion: 'no-preference',
    });

    const page = await context.newPage();

    // Next's dev-mode indicator is a fixed-position badge that lands in the corner of half these
    // captures. It is not part of the design and must not be judged as if it were.
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.append(style));
    });

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // Freeze the wipe halfway so the hero shows both documents in every capture.
    await page.evaluate(() => {
      const wipe = document.querySelector('.lumen-wipe');
      if (wipe instanceof HTMLElement) {
        wipe.dataset.paused = 'true';
        wipe.style.setProperty('--wipe', '50%');
      }
    });

    // Walk the whole page first so the lazy sections load before anything is captured.
    // The note embed scrolls inside its own frame, so the page walk alone reaches everything.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);

    for (const [name, selector] of SECTIONS) {
      const target = page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await target.screenshot({ path: `${OUT}/${viewport.name}-${theme}-${name}.png` });
    }

    for (const route of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const slug = route.replace(/\//g, '') || 'home';
      await page.screenshot({
        path: `${OUT}/${viewport.name}-${theme}-page-${slug}.png`,
        fullPage: route !== '/zh',
      });
    }

    await context.close();
    console.log(`✓ ${viewport.name}px ${theme}`);
  }
}

await browser.close();
console.log(`\nWrote ${OUT}/. Look at every one of them.`);
