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

  /**
   * Browser-only libraries, cut out of the *server* compilation.
   *
   * The Cloudflare Worker has a hard 3 MiB gzipped ceiling on the free plan, and it is the
   * tightest budget in this project (02-ARCHITECTURE.md §8). Phase-02 left it at 3005 KiB — 98%.
   * Phase-03's parsers took it to 3742 KiB and the deploy stopped being possible.
   *
   * None of these can execute on the server. Every one is behind a single `await import()` in a
   * client module, called from an event handler or an effect — pdf.js needs a `Worker` and a
   * canvas, mammoth needs a `File`, heic2any and the renderers need a DOM. But Next compiles
   * client components for the SSR pass too, so webpack follows those dynamic imports and emits
   * the chunks into `.next/server`, where OpenNext bundles them into the Worker. 2.2 MB of raw
   * JavaScript that cannot run, in the one budget that cannot take it.
   *
   * `alias: false` in the server compilation resolves each to an empty module, so the chunk is
   * never emitted. The client build is untouched and still code-splits them exactly as before —
   * `tests/unit/dynamic-imports.test.ts` is what keeps that true.
   *
   * If any of these ever needs to run server-side — a server-rendered diagram, say — take it off
   * this list rather than working around it, and re-measure with
   * `pnpm exec wrangler deploy --dry-run --outdir=…`.
   *
   * NOTE: `config.webpack` is ignored under Turbopack. Moving `next build` to Turbopack means
   * finding the equivalent, or the Worker silently grows past the ceiling again.
   */
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'pdfjs-dist': false,
        mammoth: false,
        heic2any: false,
        mermaid: false,
        katex: false,
        'smiles-drawer': false,
        pagedjs: false,
      };
    }
    return config;
  },

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
