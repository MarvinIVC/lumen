import * as Sentry from '@sentry/nextjs';

/**
 * Client error monitoring, off unless explicitly enabled (phase-00 §11). A student's notes are
 * their own (00-BRIEF.md §5.8), so PII is never sent and request bodies are not captured.
 */
if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_ENV ?? 'local',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
