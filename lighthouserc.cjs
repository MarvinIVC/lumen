const { targets, isPreviewOrigin } = require('./lighthouse-targets.cjs');

/**
 * The desktop Lighthouse gate for the marketing routes (02-ARCHITECTURE.md §8).
 *
 * Runs against a local production build by default and against a deployed URL when `LH_BASE_URL`
 * is set — `pnpm lh:preview` points it at the pull request's Cloudflare preview, which is what the
 * phase-02 verification list means by "run Lighthouse on the deployed preview, not just local".
 * A localhost run cannot see what the CDN, the compression or the real TLS handshake do.
 */
module.exports = {
  ci: {
    collect: targets({ preset: 'desktop' }),
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 1 }],
        // See `isPreviewOrigin`: a preview alias is deliberately noindex, and only there.
        ...(isPreviewOrigin()
          ? { 'is-crawlable': 'off', 'categories:seo': ['error', { minScore: 0.6 }] }
          : {}),
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.02 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        'total-byte-weight': ['warn', { maxNumericValue: 400000 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
