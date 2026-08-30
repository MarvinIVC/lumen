/**
 * Where the two Lighthouse suites point, and whether they have to start a server first.
 *
 * Shared by `lighthouserc.cjs` and `lighthouserc.mobile.cjs` so the URL list exists once. Setting
 * `LH_BASE_URL` aims both suites at a deployed origin and drops `startServerCommand` — starting a
 * local server and then measuring a remote one would silently report the wrong build.
 */
const ROUTES = ['/', '/how-it-works'];

const LOCAL = 'http://localhost:3000';

function targets(extra = {}) {
  const base = (process.env.LH_BASE_URL ?? LOCAL).replace(/\/$/, '');
  const local = base === LOCAL;

  return {
    ...(local ? { startServerCommand: 'pnpm start' } : {}),
    url: ROUTES.map((route) => `${base}${route === '/' ? '/' : route}`),
    numberOfRuns: 3,
    ...(extra.preset ? { settings: { preset: extra.preset } } : {}),
    ...(extra.settings ? { settings: extra.settings } : {}),
  };
}

module.exports = { targets, ROUTES, LOCAL };
