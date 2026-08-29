import { expect, test } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../lib/design/theme';

/**
 * Cross-cutting smoke: the home page renders, the fonts load, the theme controller behaves in all
 * three states, and the PWA files are served.
 *
 * Phase-02 replaced the placeholder home with the marketing site, which carries no theme switcher —
 * `/` follows the reader's device, and the control's home is Settings, in phase-05. The three
 * theme states are therefore driven the way a returning visitor arrives at them: with a value
 * already in `localStorage`, read by the inline `ThemeScript` before first paint. That is the part
 * that is actually easy to break, and testing it through storage rather than through a widget keeps
 * the coverage while the widget is between homes.
 */

test('home renders the pitch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('messy notes');
  await expect(page.getByRole('link', { name: 'Try it with your notes' })).toBeVisible();
});

test('web fonts load', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.fonts.status === 'loaded');

  const loaded = await page.evaluate(() => ({
    serif: document.fonts.check('1rem Newsreader'),
    sans: document.fonts.check('1rem Inter'),
    mono: document.fonts.check('1rem "JetBrains Mono"'),
  }));

  expect(loaded).toEqual({ serif: true, sans: true, mono: true });
});

test('theme defaults to system and follows the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  const dark = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  );
  expect(dark).toBe('#171613');

  await page.emulateMedia({ colorScheme: 'light' });
  const light = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  );
  expect(light).toBe('#fcfbf8');
});

test('a stored choice overrides the OS before first paint', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, 'light'),
    [THEME_STORAGE_KEY],
  );

  await page.goto('/');

  // Set by the inline script in <head>, so it is already correct on the first frame — no flash.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    ),
  ).toBe('#fcfbf8');
});

test('the system setting stores nothing and pins nothing', async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, 'system'),
    [THEME_STORAGE_KEY],
  );

  await page.goto('/');
  // 'system' must remove the attribute rather than resolve to a value, or the page stops following
  // the device the moment the reader changes it.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

test('serves a manifest and a service worker', async ({ page, request }) => {
  await page.goto('/');
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toContain('Lumen');

  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBe(true);
});
