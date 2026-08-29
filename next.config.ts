import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import createNextIntlPlugin from 'next-intl/plugin';

// Gives `next dev` the same Cloudflare bindings the deployed Worker gets. Storybook and Vitest
// also load this config, and starting a workerd process for them wedges the run — so the guard
// is not cosmetic.
const isNextDev =
  process.env.NODE_ENV === 'development' && !process.env.STORYBOOK && !process.env.VITEST;

if (isNextDev) void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // A type or lint error must fail the build, not get waved through.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  experimental: {
    // Keeps the marketing bundle under the 120 KB budget (02-ARCHITECTURE.md §8) by tree-shaking
    // barrel imports from the packages that have them. `scripts/check-route-budget.mjs` is what
    // actually enforces the number.
    optimizePackageImports: ['radix-ui', '@tanstack/react-query'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      {
        // The worker must never be cached, or an update can never ship.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true';

const withIntl = withNextIntl(nextConfig);

export default sentryEnabled
  ? withSentryConfig(withIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      // Proxies Sentry through our own origin so ad blockers do not swallow error reports.
      tunnelRoute: '/monitoring',
      disableLogger: true,
    })
  : withIntl;
