import { notFound } from 'next/navigation';

import { PREFIXED_LOCALES, isLocale, type Locale } from '@/i18n/config';

/**
 * The two lines every non-default-locale route needs.
 *
 * The marketing routes exist twice — once at the bare path for English, once under a locale prefix
 * for everything else — and the route files themselves are deliberately thin: their whole job is to
 * name a locale and a page body. Keeping the param plumbing here means adding a route is a
 * three-line file rather than a twenty-line one to get subtly wrong.
 */
export function localeStaticParams(): { locale: Locale }[] {
  return PREFIXED_LOCALES.map((locale) => ({ locale }));
}

export type LocaleParams = { params: Promise<{ locale: string }> };

/**
 * `dynamicParams = false` already means an unknown locale never reaches a route handler, so this
 * never actually calls `notFound()` in production — it is here to narrow `string` to `Locale`
 * without a cast, and to fail loudly rather than render an English page under a Chinese URL if that
 * guarantee ever changes.
 */
export async function resolveLocale(params: LocaleParams['params']): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
