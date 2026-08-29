/**
 * Enforces the first-load JavaScript budget for the marketing routes (02-ARCHITECTURE.md §8).
 *
 * `next build` prints the number, and a number printed in a log that nobody reads is not a budget.
 * The landing page has roughly seventeen kilobytes of headroom above the Next 15 + React 19
 * app-router floor, and the two things most likely to spend it — the `NoteDocument` demo embed and
 * the maths libraries behind it — are exactly the things a later phase will be tempted to import
 * statically "just for a moment". This is what notices.
 *
 * The measurement matches what a browser actually downloads for a cold visit: the union of the
 * route's own chunks and the shared runtime chunks, each gzipped, deduplicated by filename.
 *
 * Run after `pnpm build`. `--json` prints the measurements without asserting, which is the useful
 * form when you are trying to find out where the weight went.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT_DIR = resolve(ROOT, '.next');

/**
 * Route → budget in bytes of gzipped JavaScript.
 *
 * Only the routes with a published target are listed. `/` is the one the blueprint sets a number
 * for; the other marketing routes are held to the same ceiling because they are strictly simpler
 * and a regression on them would mean something global had gone wrong.
 */
const BUDGETS = {
  '/(marketing)/(en)/page': 120 * 1024,
  '/(marketing)/(en)/how-it-works/page': 120 * 1024,
  '/(marketing)/(en)/about/page': 120 * 1024,
  '/(marketing)/(en)/privacy/page': 120 * 1024,
  '/(marketing)/(en)/terms/page': 120 * 1024,
};

/** The names a reader recognises, for the report. */
const LABELS = {
  '/(marketing)/(en)/page': '/',
  '/(marketing)/(en)/how-it-works/page': '/how-it-works',
  '/(marketing)/(en)/about/page': '/about',
  '/(marketing)/(en)/privacy/page': '/privacy',
  '/(marketing)/(en)/terms/page': '/terms',
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read ${path}. Run \`pnpm build\` first — this script measures a real build, ` +
        `not the source.\n${error.message}`,
    );
  }
}

const appManifest = readJson(resolve(NEXT_DIR, 'app-build-manifest.json'));
const buildManifest = readJson(resolve(NEXT_DIR, 'build-manifest.json'));

const gzipCache = new Map();

function gzippedSize(file) {
  if (gzipCache.has(file)) return gzipCache.get(file);

  const path = resolve(NEXT_DIR, file);
  // A file listed in the manifest but missing from disk means the build is half-written; measuring
  // it as zero would quietly report a pass.
  statSync(path);
  const size = gzipSync(readFileSync(path), { level: 9 }).byteLength;

  gzipCache.set(file, size);
  return size;
}

const results = [];
let failed = false;

for (const [route, budget] of Object.entries(BUDGETS)) {
  const routeChunks = appManifest.pages[route];

  if (!routeChunks) {
    // A renamed or removed route must fail loudly. A budget that silently stops applying is worse
    // than no budget, because the number in the blueprint still says it is being enforced.
    console.error(
      `✗ ${LABELS[route] ?? route}: not in app-build-manifest.json. Renamed or removed?`,
    );
    failed = true;
    continue;
  }

  const files = [...new Set([...buildManifest.rootMainFiles, ...routeChunks])].filter((file) =>
    file.endsWith('.js'),
  );

  const total = files.reduce((sum, file) => sum + gzippedSize(file), 0);
  const over = total > budget;
  failed ||= over;

  results.push({ route: LABELS[route] ?? route, bytes: total, budget, over, files: files.length });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    const headroom = result.budget - result.bytes;
    console.log(
      `${result.over ? '✗' : '✓'} ${result.route.padEnd(16)} ${kb(result.bytes).padStart(9)} gz ` +
        `of ${kb(result.budget)} (${headroom < 0 ? '' : '+'}${kb(headroom)}, ${result.files} chunks)`,
    );
  }
}

if (failed) {
  console.error(
    '\nFirst-load JavaScript is over budget (02-ARCHITECTURE.md §8).\n' +
      'The usual cause is a static import of something that should be dynamic — the note renderer, ' +
      'the gold fixture, KaTeX, Mermaid or smiles-drawer. On the landing page everything expensive ' +
      'must be reached through lib/marketing/sections/lazy-sections.tsx and nothing else.',
  );
  process.exit(1);
}
