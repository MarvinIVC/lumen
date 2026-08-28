import { expect, test } from '@playwright/test';

/**
 * Phase-00 smoke: the placeholder home renders, the fonts actually load, and the theme controller
 * behaves in all three states — including the one that is easy to get wrong, where 'system' must
 * remove the attribute rather than pin a value.
 */

test('home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lumen');
  await expect(page.getByRole('radiogroup', { name: 'Appearance' })).toBeVisible();
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

test('an explicit choice overrides the OS and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    ),
  ).toBe('#fcfbf8');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
});

test('returning to system clears the override', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('radio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

  await page.reload();
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
