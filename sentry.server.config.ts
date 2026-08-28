import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_ENV ?? 'local',
    tracesSampleRate: 0.1,
    // 5k errors/month on the free tier — sampling keeps us inside it.
    sendDefaultPii: false,
  });
}
