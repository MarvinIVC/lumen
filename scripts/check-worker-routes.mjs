/**
 * Requests every public route from the real Cloudflare Worker.
 *
 * This exists because of a bug that reached production with every other gate green. `next start`
 * reads Next's prerender cache off the filesystem; the Worker cannot, and serves prerendered pages
 * of *dynamic* routes out of an incremental cache instead. With no cache configured — and later,
 * with the cache built but never copied into the uploaded assets — all five `/zh/*` pages returned
 * 404 in production while passing locally, in Playwright, and in Lighthouse.
 *
 * Nothing that runs against `next start` can see that class of failure. This boots the built worker
 * in workerd, which is the same runtime Cloudflare runs, and asks it for each URL.
 *
 *   pnpm build && pnpm cf:build && pnpm check:worker
 *
 * `LH_BASE_URL`-style override: pass `--base=https://…` to check a deployed origin instead of
 * booting anything, which is what makes it usable against a PR preview.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/** Every route that must answer 200, and the one that must not. */
const EXPECTED = [
  ['/', 200],
  ['/about', 200],
  ['/how-it-works', 200],
  ['/privacy', 200],
  ['/terms', 200],
  ['/zh', 200],
  ['/zh/about', 200],
  ['/zh/how-it-works', 200],
  ['/zh/privacy', 200],
  ['/zh/terms', 200],
  ['/sitemap.xml', 200],
  ['/robots.txt', 200],
  ['/og.png', 200],
  // The workspace. Client-rendered, but the shell still has to be served — and `/app/note/:id`
  // is the first route in this project that is server-rendered on demand rather than prerendered.
  ['/app', 200],
  ['/app/new', 200],
  ['/app/review', 200],
  ['/app/library', 200],
  ['/app/note/does-not-exist', 200],
  ['/app/note/does-not-exist/print', 200],
  ['/app/settings', 200],
  // The public share route. `force-dynamic`, so unlike everything above it there is no prerendered
  // copy for the Worker to fall back on — if the runtime cannot reach Supabase, this is the URL
  // that says so. A dead link is a rendered page rather than a 404, deliberately: 06 §4.
  ['/s/thislinkdoesnotexist', 200],
  // `dynamicParams = false` has to keep meaning what it says: an unknown locale is not a page.
  ['/fr', 404],
];

const PORT = Number(process.env.WORKER_PORT ?? 8788);
const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const base = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : null;

async function check(origin) {
  const failures = [];

  for (const [route, expected] of EXPECTED) {
    let status = 0;
    try {
      // `redirect: 'manual'` so a 308 to a trailing slash is reported rather than followed into a
      // 200 that hides it.
      const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
      status = response.status;
    } catch (error) {
      failures.push(`${route} — request failed: ${error.message}`);
      continue;
    }

    const ok = status === expected;
    console.log(`${ok ? '✓' : '✗'} ${String(status).padEnd(4)} ${route}`);
    if (!ok) failures.push(`${route} — expected ${expected}, got ${status}`);
  }

  return failures;
}

async function waitForBoot(origin, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`The worker exited with code ${child.exitCode} before it served anything.`);
    }
    try {
      await fetch(origin, { redirect: 'manual' });
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`The worker never came up on ${origin}.`);
}

let child = null;
let origin = base;

if (!origin) {
  origin = `http://localhost:${PORT}`;
  console.log(`Booting the built worker on ${origin} …\n`);

  child = spawn(
    'pnpm',
    ['exec', 'wrangler', 'dev', '--port', String(PORT), '--local', '--log-level', 'error'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  await waitForBoot(origin, child);
} else {
  console.log(`Checking ${origin} …\n`);
}

let failures = [];
try {
  failures = await check(origin);
} finally {
  child?.kill('SIGTERM');
}

if (failures.length) {
  console.error(`\n${failures.length} route(s) wrong on the worker:\n  ${failures.join('\n  ')}`);
  console.error(
    '\nIf the /zh routes are 404: the prerender cache is missing from the uploaded assets. ' +
      '`pnpm cf:build` runs `populateCache` for exactly this reason — see open-next.config.ts.',
  );
  process.exit(1);
}

console.log('\nEvery route answered as expected.');
