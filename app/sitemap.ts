import type { MetadataRoute } from 'next';

import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS } from '@/i18n/config';
import { MARKETING_ROUTES, href } from '@/lib/marketing/routes';
import { clientEnv } from '@/lib/env';

/**
 * Every public URL, in every language.
 *
 * Only the marketing routes belong here. `/app/*` is a signed-out-capable client workspace with
 * nothing to index, and `/s/:id` shares are unlisted by default (06 §6) — listing them in a sitemap
 * would be the fastest possible way to break that promise.
 *
 * Each entry carries the `alternates.languages` map, which is the sitemap's way of saying that
 * `/about` and `/zh/about` are one page in two languages rather than two thin duplicates.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const url = (path: string) => `${base}${path === '/' ? '' : path}`;

  return MARKETING_ROUTES.flatMap((route) =>
    LOCALES.map((locale) => ({
      url: url(href(locale, route)),
      lastModified: new Date(),
      // The home page is the entry point; the legal pages are the least likely to be a landing.
      priority: route === '/' ? 1 : route === '/how-it-works' ? 0.8 : 0.5,
      changeFrequency: 'monthly' as const,
      alternates: {
        languages: {
          ...Object.fromEntries(
            LOCALES.map((candidate) => [LOCALE_TAGS[candidate], url(href(candidate, route))]),
          ),
          'x-default': url(href(DEFAULT_LOCALE, route)),
        },
      },
    })),
  );
}
