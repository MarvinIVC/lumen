import type { ReactNode } from 'react';

import { LOCALE_TAGS, type Locale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';

import { SiteFooter } from './chrome/site-footer';
import { SiteHeader } from './chrome/site-header';
import type { MarketingRoute } from './routes';

/**
 * The frame every marketing page sits in.
 *
 * It is a component rather than a route-group `layout.tsx` because the footer's language switcher
 * has to know which route it is on in order to link to the same page in the other language, and a
 * layout in Next has no way to ask. Passing the route down explicitly is the honest version of
 * that, and it costs one prop.
 *
 * `lang` is set here as well as on `<html>`: the root layout is locale-agnostic (it wraps `/app`
 * too), so this is the element that actually tells a screen reader which language the page is in.
 */
export async function MarketingShell({
  locale,
  route,
  children,
}: {
  locale: Locale;
  route: MarketingRoute;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'nav' });

  return (
    <div lang={LOCALE_TAGS[locale]} className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-bg-raised px-4 py-2 text-sm font-medium text-text shadow-overlay focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t('skipToContent')}
      </a>

      <SiteHeader locale={locale} />

      <main id="main" className="grow">
        {children}
      </main>

      <SiteFooter locale={locale} route={route} />
    </div>
  );
}
