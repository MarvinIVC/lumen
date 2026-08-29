import { getTranslations } from 'next-intl/server';

import { buttonClass } from '@/components/ui/button-styles';
import type { Locale } from '@/i18n/config';

import { JsonLd, faqPageSchema } from '../json-ld';
import { APP_NEW_HREF } from '../routes';
import { Section, SectionHeading } from '../section';
import { MarketingShell } from '../shell';

interface Step {
  id: string;
  kicker: string;
  title: string;
  body: string;
  detail: string;
}

interface FaqEntry {
  q: string;
  a: string;
}

/**
 * /how-it-works — the explainer, and the page that carries the `FAQPage` structured data.
 *
 * The three stages are the same message entries the home page renders, deliberately: a visitor who
 * reads both should not find two different accounts of what the product does, and a change to the
 * pipeline should only ever need editing in one place.
 */
export async function HowItWorks({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'howItWorks' });
  const stepsT = await getTranslations({ locale, namespace: 'steps' });
  const heroT = await getTranslations({ locale, namespace: 'hero' });

  const steps = stepsT.raw('items') as Step[];
  const faq = t.raw('faq') as FaqEntry[];

  return (
    <MarketingShell locale={locale} route="/how-it-works">
      <JsonLd data={faqPageSchema(faq)} />

      <Section width="prose" divider={false} labelledBy="hiw-heading">
        <h1 id="hiw-heading" className="font-serif text-3xl leading-tight font-semibold text-text">
          {t('title')}
        </h1>
        <p className="mt-6 font-serif text-lg leading-note text-text">{t('lede')}</p>
      </Section>

      <Section width="prose" labelledBy="hiw-stages">
        <SectionHeading id="hiw-stages">{t('stagesHeading')}</SectionHeading>

        <ol className="mt-10 flex flex-col gap-10">
          {steps.map((step) => (
            <li key={step.id}>
              <p className="font-mono text-xs tracking-widest text-text-muted uppercase">
                {step.kicker}
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold text-text">{step.title}</h3>
              <p className="mt-3 leading-normal text-text-muted">{step.body}</p>
              <p className="mt-2 leading-normal text-text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section width="prose" labelledBy="hiw-trust">
        <SectionHeading id="hiw-trust">{t('trustHeading')}</SectionHeading>
        <p className="mt-6 font-serif text-md leading-note text-text">{t('trustBody')}</p>

        <h2 className="mt-12 font-serif text-xl font-semibold text-text">{t('limitsHeading')}</h2>
        <p className="mt-4 font-serif text-md leading-note text-text">{t('limitsBody')}</p>
      </Section>

      <Section width="prose" labelledBy="hiw-faq">
        <SectionHeading id="hiw-faq">{t('faqHeading')}</SectionHeading>

        {/*
          A description list, not <details>. The answers are the substance of this route — for a
          crawler and for a reader skimming for the one that applies to them — and hiding eight of
          nine behind a click to look tidy would be optimising the wrong thing.
        */}
        <dl className="mt-10 flex flex-col gap-8">
          {faq.map((entry) => (
            <div key={entry.q}>
              <dt className="font-serif text-lg font-semibold text-text">{entry.q}</dt>
              <dd className="mt-2 leading-normal text-text-muted">{entry.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section width="prose" labelledBy="hiw-cta">
        <SectionHeading id="hiw-cta">{t('ctaHeading')}</SectionHeading>
        <p className="mt-4 leading-normal text-text-muted">{t('ctaBody')}</p>
        <p className="mt-8">
          <a href={APP_NEW_HREF} className={buttonClass({ variant: 'primary', size: 'lg' })}>
            {heroT('ctaPrimary')}
          </a>
        </p>
      </Section>
    </MarketingShell>
  );
}
