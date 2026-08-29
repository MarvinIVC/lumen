import { getTranslations } from 'next-intl/server';

import { APP_NAME, GITHUB_URL } from '@/lib/config';
import { buttonClass } from '@/components/ui/button-styles';
import type { Locale } from '@/i18n/config';

import { Section } from '../section';
import { MarketingShell } from '../shell';

/** /about — where the product came from, and what it refuses to do (00-BRIEF.md §2, 01-PRODUCT §6). */
export async function About({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'about' });
  const paragraphs = t.raw('paragraphs') as string[];
  const values = t.raw('values') as string[];

  return (
    <MarketingShell locale={locale} route="/about">
      <Section width="prose" divider={false} labelledBy="about-heading">
        <h1
          id="about-heading"
          className="font-serif text-3xl leading-tight font-semibold text-text"
        >
          {t('title')}
        </h1>
        <p className="mt-6 font-serif text-lg leading-note text-text">
          {t('lede', { app: APP_NAME })}
        </p>

        <div className="mt-6 flex flex-col gap-5 font-serif text-md leading-note text-text">
          {paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </div>

        <h2 className="mt-14 font-serif text-xl font-semibold text-text">{t('valuesHeading')}</h2>
        <ul className="mt-5 flex flex-col gap-3">
          {values.map((value) => (
            <li
              key={value.slice(0, 24)}
              className="border-l-2 border-border pl-4 leading-normal text-text-muted"
            >
              {value}
            </li>
          ))}
        </ul>

        <h2 className="mt-14 font-serif text-xl font-semibold text-text">{t('contactHeading')}</h2>
        <p className="mt-4 leading-normal text-text-muted">{t('contactBody')}</p>
        <p className="mt-6">
          <a href={GITHUB_URL} rel="noreferrer" className={buttonClass({ variant: 'secondary' })}>
            {t('contactCta')}
          </a>
        </p>
      </Section>
    </MarketingShell>
  );
}
