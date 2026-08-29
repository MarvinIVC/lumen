import { DEFAULT_LOCALE, LOCALES, type Locale, localePath } from '@/i18n/config';

/**
 * The five public routes, in one table.
 *
 * Everything that needs a marketing URL — links, the sitemap, `hreflang` alternates, the language
 * switcher — reads it from here, so a renamed route cannot be renamed in four places and missed in
 * a fifth.
 */
export const MARKETING_ROUTES = ['/', '/how-it-works', '/about', '/privacy', '/terms'] as const;

export type MarketingRoute = (typeof MARKETING_ROUTES)[number];

/** The href for a route in a locale: `/about` in English, `/zh/about` in Chinese. */
export function href(locale: Locale, route: MarketingRoute): string {
  return localePath(locale, route);
}

/** Every locale's URL for one route, for `alternates.languages` and the sitemap. */
export function alternates(route: MarketingRoute): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, href(locale, route)])) as Record<
    Locale,
    string
  >;
}

/**
 * The app itself. Phase-03 builds `/app/new`; until then the primary call to action points at a
 * route that does not exist yet, which is deliberate — the button's destination is part of the
 * pitch and should not be invented twice.
 */
export const APP_NEW_HREF = '/app/new';

export { DEFAULT_LOCALE, LOCALES, type Locale };
