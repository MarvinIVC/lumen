import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { APP_NAME, GITHUB_URL } from '@/lib/config';
import { LOCALES, LOCALE_LABELS, LOCALE_TAGS, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils/cn';

import { href, type MarketingRoute } from '../routes';
import { Wordmark } from './wordmark';

/**
 * The footer, and the site's only legal surface (03-DESIGN.md §8.7).
 *
 * The trademark disclaimer is read from the message catalogue rather than the `CURRICULUM_DISCLAIMER`
 * constant, because a Chinese reader should not hit a paragraph of English at the bottom of a
 * Chinese page. `tests/unit/messages.test.ts` asserts the English message and the constant match,
 * so the app and the marketing site cannot end up disclaiming different things.
 */
export async function SiteFooter({ locale, route }: { locale: Locale; route: MarketingRoute }) {
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <footer className="border-t border-border bg-bg-sunken">
      <div className="mx-auto max-w-[72rem] px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
          <div>
            <Wordmark />
            <p className="mt-2 text-sm text-text-muted">{t('tagline')}</p>
          </div>

          <nav aria-label={t('navLabel')} className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {(
              [
                ['/how-it-works', t('howItWorks')],
                ['/about', t('about')],
                ['/privacy', t('privacy')],
                ['/terms', t('terms')],
              ] as const
            ).map(([target, label]) => (
              <Link
                key={target}
                href={href(locale, target)}
                className="text-text-muted transition-colors duration-(--dur-fast) ease-lumen hover:text-text"
              >
                {label}
              </Link>
            ))}
            <a
              href={GITHUB_URL}
              rel="noreferrer"
              className="text-text-muted transition-colors duration-(--dur-fast) ease-lumen hover:text-text"
            >
              {t('github')}
            </a>
          </nav>

          <LanguageSwitcher locale={locale} route={route} label={t('languageLabel')} />
        </div>

        <p className="mt-12 max-w-(--measure) text-xs leading-normal text-text-muted">
          {t('disclaimer')}
        </p>
        <p className="mt-3 text-xs text-text-muted">{t('openSource', { app: APP_NAME })}</p>
      </div>
    </footer>
  );
}

/**
 * Two anchors, not a `<select>`.
 *
 * A dropdown here would need JavaScript to navigate, would not be crawlable, and would hide the
 * other language behind a click — and the whole point of showing 简体中文 in the footer is that a
 * reader who needs it can see at a glance that it exists. Each link points at the same page in the
 * other locale, which also gives crawlers the `hreflang` pair as real links.
 */
function LanguageSwitcher({
  locale,
  route,
  label,
}: {
  locale: Locale;
  route: MarketingRoute;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs tracking-widest text-text-muted uppercase">{label}</p>
      <ul className="flex items-center gap-1 text-sm">
        {LOCALES.map((candidate) => {
          const current = candidate === locale;
          return (
            <li key={candidate}>
              <Link
                href={href(candidate, route)}
                hrefLang={LOCALE_TAGS[candidate]}
                lang={LOCALE_TAGS[candidate]}
                // The current language is still a link, not a disabled span: it is the canonical
                // URL for this page in this language and is worth being crawlable.
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'rounded-sm px-2 py-1 transition-colors duration-(--dur-fast) ease-lumen',
                  current
                    ? 'bg-bg-raised font-medium text-text'
                    : 'text-text-muted hover:bg-bg-raised hover:text-text',
                )}
              >
                {LOCALE_LABELS[candidate]}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
