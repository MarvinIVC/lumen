/**
 * Client error monitoring, off unless explicitly enabled (phase-00 §11). A student's notes are
 * their own (00-BRIEF.md §5.8), so PII is never sent and request bodies are not captured.
 *
 * The import is dynamic, and that is the point rather than a style choice. Next loads this file
 * on every page, so a top-level `import * as Sentry` puts the whole SDK in the shared client
 * chunk — about 85 kB gzipped — for every visitor, whether or not monitoring is switched on. The
 * `if` below is a runtime check and cannot remove it. Behind `import()`, a disabled Sentry costs
 * nothing: the branch is dead code when the flag is inlined false, and an unfetched async chunk
 * otherwise. 02-ARCHITECTURE.md §8 gives the marketing home a 90 KB budget in total.
 */
// Type-only, so it is erased at compile time and pulls nothing into the bundle.
import type * as SentryNamespace from '@sentry/nextjs';

type SentryModule = typeof SentryNamespace;

let sentry: SentryModule | null = null;

const enabled =
  process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (enabled) {
  void import('@sentry/nextjs').then((module) => {
    sentry = module;
    module.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_ENV ?? 'local',
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
    });
  });
}

/**
 * Next calls this synchronously on every route change, so it cannot wait for the import. Before
 * the SDK lands — and forever, when monitoring is off — it is a no-op, which loses at most the
 * first transition's breadcrumb.
 */
export const onRouterTransitionStart: SentryModule['captureRouterTransitionStart'] = (...args) => {
  sentry?.captureRouterTransitionStart(...args);
};
