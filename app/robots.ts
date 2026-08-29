import type { MetadataRoute } from 'next';

import { clientEnv } from '@/lib/env';

/**
 * Replaces the static `public/robots.txt` that phase-00 shipped.
 *
 * The static file could not name the sitemap without hardcoding the origin, which would have been
 * wrong on every preview deployment; and two sources of truth for the same file — one of which
 * silently wins — is exactly the kind of drift that is only ever discovered from a search console.
 */
export default function robots(): MetadataRoute.Robots {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Shared notes are unlisted by default (allow_index defaults to false, 06 §6), and the
      // workspace is a client app with nothing to crawl.
      disallow: ['/s/', '/app/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
