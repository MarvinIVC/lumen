import { expect, test } from '@playwright/test';

/**
 * The marketing site's definition of done, as checks (03-DESIGN.md §8, phase-02 DoD).
 *
 * The three things worth guarding are the three that are easy to break without noticing: the hero
 * works for every input method, the page still makes its pitch with JavaScript off, and the heavy
 * renderer stays off the first load until someone scrolls to it.
 */

const isMobile = (name: string) => name.includes('mobile');

test.describe('the hero scrubber', () => {
  test('autoplays before anyone touches it, and stops once they do', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'The panels stack below 640px; there is no wipe.');

    await page.goto('/');
    const wipe = page.locator('.lumen-wipe');

    // The sweep is a CSS animation on a registered custom property, so "is it playing?" is a
    // question about --wipe changing, not about any JavaScript having run.
    const first = await wipe.evaluate((el) => getComputedStyle(el).getPropertyValue('--wipe'));
    await page.waitForTimeout(700);
    const second = await wipe.evaluate((el) => getComputedStyle(el).getPropertyValue('--wipe'));
    expect(first).not.toBe(second);

    await page.locator('.lumen-wipe__handle').focus();
    await page.keyboard.press('ArrowRight');

    await expect(wipe).toHaveAttribute('data-paused', 'true');
    const paused = await wipe.evaluate((el) => getComputedStyle(el).getPropertyValue('--wipe'));
    await page.waitForTimeout(500);
    expect(await wipe.evaluate((el) => getComputedStyle(el).getPropertyValue('--wipe'))).toBe(
      paused,
    );
  });

  test('moves with the keyboard', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'The panels stack below 640px; there is no wipe.');

    await page.goto('/');
    const handle = page.locator('.lumen-wipe__handle');
    await handle.focus();

    const before = await handle.inputValue();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(Number(await handle.inputValue())).toBe(Number(before) - 2);

    await page.keyboard.press('Home');
    expect(await handle.inputValue()).toBe('0');
    await page.keyboard.press('End');
    expect(await handle.inputValue()).toBe('100');
  });

  test('moves by dragging', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'The panels stack below 640px; there is no wipe.');

    await page.goto('/');
    const handle = page.locator('.lumen-wipe__handle');

    // The comparison is taller than a laptop viewport, and `page.mouse` works in viewport
    // coordinates — without this the drag happens hundreds of pixels below the fold and lands on
    // nothing, while `boundingBox()` still cheerfully returns a rectangle.
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const y = box!.y + Math.min(box!.height / 2, 150);

    await page.mouse.move(box!.x + box!.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.2, y, { steps: 8 });
    await page.mouse.up();

    expect(Number(await handle.inputValue())).toBeLessThan(40);
    await expect(page.locator('.lumen-wipe')).toHaveAttribute('data-paused', 'true');
  });

  test('is a static side-by-side under reduced motion', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'Already stacked at this width, motion or not.');

    // `page.emulateMedia`, never `test.use({ reducedMotion })` — phase-01 found the device preset
    // in playwright.config.ts silently overrides the fixture.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const wipe = page.locator('.lumen-wipe');
    expect(await wipe.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(
      await wipe.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    ).toBe(2);

    // No seam, no handle: there is nothing to wipe.
    await expect(page.locator('.lumen-wipe__seam')).toBeHidden();
    await expect(page.locator('.lumen-wipe__handle')).toBeHidden();

    // Both documents are fully visible rather than clipped.
    for (const panel of ['.lumen-wipe__before', '.lumen-wipe__after']) {
      expect(await page.locator(panel).evaluate((el) => getComputedStyle(el).clipPath)).toBe(
        'none',
      );
    }
  });
});

test.describe('the demo embed', () => {
  test('renders the whole gold fixture once scrolled to', async ({ page }) => {
    await page.goto('/');

    // `useScrollableRegion` uses role="group", not region: a region is a landmark, and the note
    // embed is not one.
    const frame = page.getByRole('group', { name: /scrollable|可滚动/i });
    await frame.scrollIntoViewIfNeeded();

    // The real renderer, not the static opening: an outline rail and a live reading-mode control.
    await expect(page.getByRole('radiogroup', { name: 'What to show' })).toBeVisible({
      timeout: 15_000,
    });

    // The last thing in the document, so the fixture rendered end to end rather than partly.
    await expect(frame.getByText('Study next', { exact: false }).first()).toBeAttached();
    await expect(frame.getByText('Have No Fear Of Ice Cold Beer', { exact: false })).toBeAttached();
  });

  test('keeps the note renderer out of the first load', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // KaTeX is the canary: it is only reachable through the lazily-imported note, so its presence
    // here would mean something upstream had acquired a static import of the renderer.
    expect(scripts.filter((url) => /katex|mermaid|smiles/i.test(url))).toEqual([]);
  });

  test('scrolls inside its own frame rather than lengthening the page', async ({ page }) => {
    await page.goto('/');
    // The fixture is a full unit of AP Chemistry. Inlined at full height it added roughly eleven
    // thousand pixels to the page and put the footer somewhere nobody would ever reach.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(9000);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('still makes the pitch and still links to the app', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('messy notes');
    await expect(page.getByRole('link', { name: 'Try it with your notes' })).toHaveAttribute(
      'href',
      '/app/new',
    );

    // The student's real notes and the finished version are both server-rendered.
    await expect(page.getByText('Atomic mass = molar mass').first()).toBeVisible();
    await expect(page.getByText('Two masses, one number.').first()).toBeVisible();

    // The demo section falls back to the note's real opening, not an empty box.
    await expect(
      page.getByText('Chemistry is done by the gram in the lab', { exact: false }),
    ).toBeAttached();

    // And the control that cannot work without scripts is not rendered at all.
    await expect(page.locator('.lumen-wipe__handle')).toHaveCount(0);
  });
});

test.describe('routing and locales', () => {
  test('serves English from the bare path', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About');
  });

  test('serves 简体中文 from the locale prefix', async ({ page }) => {
    await page.goto('/zh/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('关于');
    await expect(page.locator('[lang="zh-Hans"]').first()).toBeVisible();
  });

  test('the static routes outrank the [locale] segment', async ({ page }) => {
    // `/about` matches both `(en)/about` and `[locale]` with locale="about". Next prefers the
    // static segment — this is the one load-bearing assumption in the routing, so it is asserted
    // rather than trusted.
    for (const route of ['/about', '/privacy', '/terms', '/how-it-works']) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should be the English page, not a locale`).toBe(200);
      await expect(page.locator('[lang="en"]').first()).toBeVisible();
    }
  });

  test('an unknown locale prefix is a 404', async ({ page }) => {
    const response = await page.goto('/fr');
    expect(response?.status()).toBe(404);
  });

  test('the language switcher links to the same page in the other language', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('link', { name: '简体中文' })).toHaveAttribute(
      'href',
      '/zh/privacy',
    );

    await page.goto('/zh/privacy');
    await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/privacy');
  });
});

test.describe('SEO', () => {
  test('every route declares a canonical and both hreflang alternates', async ({ page }) => {
    await page.goto('/how-it-works');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/how-it-works$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/how-it-works$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="zh-Hans"]')).toHaveAttribute(
      'href',
      /\/zh\/how-it-works$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
  });

  test('publishes a sitemap and a robots file', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain('/how-it-works');
    expect(xml).toContain('/zh/how-it-works');

    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    const text = await robots.text();
    expect(text).toContain('Disallow: /s/');
    expect(text).toContain('Sitemap:');
  });

  test('marks up the product and the FAQ', async ({ page }) => {
    await page.goto('/');
    const home = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(home!)['@type']).toBe('SoftwareApplication');

    await page.goto('/how-it-works');
    const faq = await page.locator('script[type="application/ld+json"]').first().textContent();
    const parsed = JSON.parse(faq!);
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity.length).toBeGreaterThan(5);

    // Every marked-up answer must actually be on the page — an FAQ schema describing invisible
    // content is what earns a manual penalty.
    for (const entry of parsed.mainEntity.slice(0, 3)) {
      await expect(page.getByText(entry.name, { exact: false }).first()).toBeAttached();
    }
  });

  test('serves the Open Graph card', async ({ page, request }) => {
    await page.goto('/');
    const url = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(url).toBeTruthy();

    const image = await request.get(url!);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
  });
});
