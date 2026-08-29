/**
 * The locales the marketing site is published in.
 *
 * There is deliberately no middleware and no locale detection: the default locale is served from
 * the bare path (`/about`) and every other locale from a prefix (`/zh/about`), so every marketing
 * URL is a static file that Cloudflare can serve without waking a Worker. Adding a locale is one
 * entry here, one message catalogue, and nothing else.
 */
export const DEFAULT_LOCALE = 'en';

export const LOCALES = ['en', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

/** The locales that live under a path prefix — i.e. everything except the default. */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** How each locale names itself, for the switcher. Never translated — a reader who needs the
 *  Chinese site cannot be expected to recognise the English word "Chinese". */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文',
};

/** The `lang` attribute and `hreflang` value for each locale. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en',
  zh: 'zh-Hans',
};

/**
 * The path a route takes in a given locale. The default locale keeps the bare path so that `/` is
 * the canonical home rather than a redirect to `/en`.
 */
export function localePath(locale: Locale, route: string): string {
  const path = route === '/' ? '' : route;
  return locale === DEFAULT_LOCALE ? path || '/' : `/${locale}${path}`;
}
