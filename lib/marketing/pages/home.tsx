import { getTranslations } from 'next-intl/server';

import { APP_NAME } from '@/lib/config';
import type { Locale } from '@/i18n/config';

import { JsonLd, softwareApplicationSchema } from '../json-ld';
import { Demo } from '../sections/demo';
import { Free } from '../sections/free';
import { Hero } from '../sections/hero';
import { Problem } from '../sections/problem';
import { Steps } from '../sections/steps';
import { Subjects } from '../sections/subjects';
import { MarketingShell } from '../shell';

/**
 * The home page: the seven-section scroll from 03-DESIGN.md §8, in order.
 *
 * The order is the argument. Promise (hero) → the reader recognising their own notes (problem) →
 * what we do about it (steps) → proof (demo) → reassurance that it applies to them (subjects) →
 * the catch, which is that there isn't one (free).
 */
export async function Home({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'meta' });

  return (
    <MarketingShell locale={locale} route="/">
      <JsonLd
        data={softwareApplicationSchema({
          locale,
          description: t('home.description', { app: APP_NAME }),
        })}
      />
      <Hero locale={locale} />
      <Problem locale={locale} />
      <Steps locale={locale} />
      <Demo locale={locale} />
      <Subjects locale={locale} />
      <Free locale={locale} />
    </MarketingShell>
  );
}
