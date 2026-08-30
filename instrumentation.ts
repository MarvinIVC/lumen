import type { Instrumentation } from 'next';

/**
 * Server error monitoring, off unless explicitly enabled (phase-00 §11).
 *
 * Every reference to the SDK below is dynamic and behind this constant, and that is the point
 * rather than a style choice — the same lesson phase-01 learned on `instrumentation-client.ts`,
 * relearned here on the server twin that was missed.
 *
 * A top-level `import * as Sentry from '@sentry/nextjs'` put the entire Sentry Node SDK, its
 * OpenTelemetry instrumentation and the Node transport into the Cloudflare Worker on every deploy,
 * whether or not monitoring was switched on. That is roughly three quarters of a megabyte gzipped
 * against a **3 MiB hard ceiling** on Cloudflare's free plan, and the runtime `if` inside
 * `sentry.server.config.ts` could not remove any of it: a runtime check runs after the bundler has
 * already decided what ships.
 *
 * `NEXT_PUBLIC_*` is inlined at build time in the server compilation as well as the client one, so
 * with monitoring off `enabled` folds to `false`, every branch here becomes dead code, and neither
 * the config modules nor the SDK are reachable from the graph at all. With monitoring on, the
 * behaviour is exactly what it was.
 */
const enabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true';

export async function register() {
  if (!enabled) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/**
 * Next calls this for every server-side error. When monitoring is off it is a no-op that costs one
 * comparison; when it is on, the SDK is already initialised by `register` above, so the dynamic
 * import resolves from cache rather than fetching anything.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!enabled) return;

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
