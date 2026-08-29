import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, isLocale } from './config';

/**
 * next-intl in "without i18n routing" mode: there is no middleware to negotiate a locale, so the
 * locale always arrives explicitly from the route segment via `getTranslations({ locale })`.
 *
 * Keeping it explicit is what lets every page stay statically rendered — a request-time detection
 * step would make each page dynamic and put a Worker in front of five static documents.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requested = locale ?? (await requestLocale);
  const resolved = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
  };
});
