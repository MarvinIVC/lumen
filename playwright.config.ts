import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Smoke suite only in phase-00: the placeholder home renders, the theme controller works in all
 * three states, and fonts load. Real journeys arrive with the screens that have them.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // When something systemic breaks — the app not serving the routes under test, say — every test
  // fails the same way, and with retries that is hundreds of thirty-second timeouts. It once ate
  // a whole 25-minute job before reporting anything. Stop after a handful: the first few failures
  // say everything the next two hundred would.
  maxFailures: process.env.CI ? 8 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],

  // Reuse a running dev server locally; build and serve from scratch in CI.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? 'pnpm start' : 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
