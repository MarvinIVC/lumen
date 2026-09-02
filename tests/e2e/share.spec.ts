import { expect, test } from '@playwright/test';

/**
 * The public share route (06 §4).
 *
 * The positive path needs a share row, which needs an account and a synced note — `pnpm test:share`
 * drives all of that against the real database, including revoke, expiry, throttling and the fact
 * that a stranger cannot reach the note any other way. What that node suite cannot see is the page:
 * whether the route exists on the deployed Worker, whether it renders, and whether a dead link says
 * so rather than crashing. That needs no fixture, so it runs everywhere this suite does — including
 * against a preview, where phase-02's lesson says the interesting failures actually live.
 */
test.describe('a share link that is not live', () => {
  test('says so, on a real page, rather than erroring', async ({ page }) => {
    const response = await page.goto('/s/thislinkdoesnotexist');

    // Deliberately a rendered page and not a 404 shell: "this link is not available" is something
    // the person who was sent it can act on, and an unknown, revoked and expired link all get the
    // same answer so that a stranger cannot tell which they are holding.
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/link is not available/i)).toBeVisible();
    await expect(page.locator('.lumen-note')).toHaveCount(0);
  });

  test('is never indexed', async ({ page }) => {
    await page.goto('/s/thislinkdoesnotexist');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('offers a way into the product rather than a dead end', async ({ page }) => {
    await page.goto('/s/thislinkdoesnotexist');
    await expect(page.getByRole('link', { name: /rebuild your own notes/i })).toBeVisible();
  });
});
