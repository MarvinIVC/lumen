import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { APP_NAME } from '@/lib/config';
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, type Locale } from '@/i18n/config';

import { OG_IMAGE } from './og';
import { href, type MarketingRoute } from './routes';

/** Which message key under `meta` describes which route. */
const META_KEYS: Record<MarketingRoute, string> = {
  '/': 'home',
  '/how-it-works': 'howItWorks',
  '/about': 'about',
  '/privacy': 'privacy',
  '/terms': 'terms',
};

/**
 * Per-route metadata, built from the same catalogue the page renders from — so a translated page
 * gets a translated `<title>` and description rather than an English one, and neither can be
 * updated without the other.
 *
 * The `alternates.languages` map is what tells a search engine that `/about` and `/zh/about` are
 * the same page in two languages rather than duplicates. `x-default` points at the English URL
 * because it is the canonical home; without it a crawler picks one for you.
 */
export async function marketingMetadata(locale: Locale, route: MarketingRoute): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const key = META_KEYS[route];

  const title = t(`${key}.title`, { app: APP_NAME });
  const description = t(`${key}.description`, { app: APP_NAME });

  const languages = Object.fromEntries([
    ...LOCALES.map((candidate) => [LOCALE_TAGS[candidate], href(candidate, route)]),
    ['x-default', href(DEFAULT_LOCALE, route)],
  ]);

  return {
    // The home page's title is already the full sentence; the layout's `%s · Lumen` template would
    // append the name to a title that ends with it.
    title: route === '/' ? { absolute: title } : title,
    description,
    alternates: { canonical: href(locale, route), languages },
    openGraph: {
      type: 'website',
      title,
      description,
      url: href(locale, route),
      siteName: APP_NAME,
      locale: LOCALE_TAGS[locale],
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}
