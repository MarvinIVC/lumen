/**
 * Fails if the built Worker is over Cloudflare's free-plan ceiling.
 *
 * This exists because phase-03 went over it. Adding the document parsers took the Worker from
 * 3005 KiB to 3742 KiB — undeployable — and the only thing that said so was `wrangler deploy`
 * itself, at the very end of the pipeline, on a pull request that had already gone green. The fix
 * (aliasing the browser-only libraries out of the server compilation, `next.config.ts`) is one
 * line to undo by accident, and nothing else in the pipeline would notice.
 *
 *   pnpm build && pnpm cf:build && pnpm check:worker:size
 *
 * `--dry-run` prints the same gzipped number the Cloudflare API enforces, so this is the real
 * measurement rather than an approximation of it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The free plan's hard limit. The paid plan is 10 MiB, and taking it is a decision, not a fix. */
const CEILING_KIB = 3072;

/** Report before the ceiling rather than at it, so there is room to think. */
const WARN_AT = 0.85;

const outdir = mkdtempSync(join(tmpdir(), 'lumen-worker-'));

try {
  const output = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'deploy', '--dry-run', `--outdir=${outdir}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const match = /gzip:\s*([\d.]+)\s*KiB/.exec(output);
  if (!match) {
    console.error('Could not read the gzipped size from wrangler. Output was:\n');
    console.error(output);
    process.exit(1);
  }

  const size = Number(match[1]);
  const share = size / CEILING_KIB;
  const line = `${size.toFixed(1)} / ${CEILING_KIB} KiB gz — ${Math.round(share * 100)}%`;

  if (size > CEILING_KIB) {
    console.error(`✗ Worker is over the free-plan ceiling: ${line}`);
    console.error(
      '\nLook first at what is in `.next/server/chunks` that cannot run on a server.\n' +
        '`next.config.ts` aliases the browser-only libraries to `false` in the server\n' +
        'compilation for exactly this reason — see 02-ARCHITECTURE.md §8.',
    );
    process.exit(1);
  }

  console.log(`${share > WARN_AT ? '!' : '✓'} Worker ${line}`);
  if (share > WARN_AT) {
    console.log('  Close to the ceiling. 02-ARCHITECTURE.md §8 names what is in there.');
  }
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
