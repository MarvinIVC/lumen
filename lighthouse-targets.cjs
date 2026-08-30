/**
 * Where the two Lighthouse suites point, and whether they have to start a server first.
 *
 * Shared by `lighthouserc.cjs` and `lighthouserc.mobile.cjs` so the URL list exists once. Setting
 * `LH_BASE_URL` aims both suites at a deployed origin and drops `startServerCommand` — starting a
 * local server and then measuring a remote one would silently report the wrong build.
 */
const ROUTES = ['/', '/how-it-works'];

const LOCAL = 'http://localhost:3000';

function baseUrl() {
  return (process.env.LH_BASE_URL ?? LOCAL).replace(/\/$/, '');
}

/**
 * True when we are pointed at a per-pull-request preview deployment.
 *
 * Cloudflare serves preview aliases with `x-robots-tag: noindex`, which is correct — a preview
 * must not be indexed — and which makes Lighthouse's `is-crawlable` audit fail and take the SEO
 * score to 66. Production carries no such header. So the audit is switched off for previews and
 * only for previews: locally and in CI, where the check is meaningful, SEO 100 is still enforced
 * in full and `is-crawlable` is part of it.
 */
function isPreviewOrigin() {
  return /\/\/pr-\d+-/.test(baseUrl());
}

function targets(extra = {}) {
  const base = baseUrl();
  const local = base === LOCAL;

  return {
    ...(local ? { startServerCommand: 'pnpm start' } : {}),
    url: ROUTES.map((route) => `${base}${route === '/' ? '/' : route}`),
    numberOfRuns: 3,
    ...(extra.preset ? { settings: { preset: extra.preset } } : {}),
    ...(extra.settings ? { settings: extra.settings } : {}),
  };
}

module.exports = { targets, isPreviewOrigin, ROUTES, LOCAL };
