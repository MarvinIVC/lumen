import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { buttonClass } from '@/components/ui/button-styles';
import type { Locale } from '@/i18n/config';

import { APP_NEW_HREF, href } from '../routes';
import { Wordmark } from './wordmark';

/**
 * The marketing header. Deliberately not sticky and deliberately not interactive: no menu button,
 * no theme toggle, no dropdown — four links and a button, all of them anchors.
 *
 * On a narrow screen the nav links wrap under the wordmark rather than collapsing into a hamburger,
 * because a hamburger is a client component and this page's entire JavaScript allowance is spent on
 * the hero scrubber and the demo loader (02-ARCHITECTURE.md §8). Two links do not need a menu.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[72rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        {/*
          No `aria-label`. An accessible name of "Home" over the visible word "Lumen" fails WCAG
          2.5.3 — someone using voice control says what they can see, and "click Home" would find
          nothing. The wordmark is the name; the accent full stop beside it is aria-hidden, so the
          name comes out as just the product's.
        */}
        <Link href={href(locale, '/')} className="mr-auto">
          <Wordmark />
        </Link>

        <nav aria-label={t('primaryLabel')} className="flex items-center gap-5 text-sm">
          <Link
            href={href(locale, '/how-it-works')}
            className="text-text-muted transition-colors duration-(--dur-fast) ease-lumen hover:text-text"
          >
            {t('howItWorks')}
          </Link>
          <Link
            href={href(locale, '/about')}
            className="text-text-muted transition-colors duration-(--dur-fast) ease-lumen hover:text-text"
          >
            {t('about')}
          </Link>
        </nav>

        <a href={APP_NEW_HREF} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {t('cta')}
        </a>
      </div>
    </header>
  );
}
