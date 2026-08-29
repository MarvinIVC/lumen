import { getTranslations } from 'next-intl/server';

import { buttonClass } from '@/components/ui/button-styles';
import type { Locale } from '@/i18n/config';

import { APP_NEW_HREF } from '../routes';
import { GoldPage } from './gold-page';
import { HeroScrubber } from './hero-scrubber';
import { PanelLabel, RawPage } from './raw-page';

/**
 * The hero (03-DESIGN.md §8.1). The headline makes the promise; the panel below it is the evidence,
 * and the evidence is a real file rather than a mockup.
 *
 * The two documents are server components passed into the client scrubber as props, so the only
 * JavaScript this section ships is the slider itself — none of the markup, none of the fixture.
 */
export async function Hero({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'hero' });

  return (
    <section aria-labelledby="hero-heading">
      <div className="mx-auto max-w-[72rem] px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-[44rem] text-center">
          <h1
            id="hero-heading"
            className="font-serif text-3xl leading-tight font-semibold text-balance text-text sm:text-4xl"
          >
            {t('headline')}
          </h1>

          <p className="mx-auto mt-6 max-w-[36rem] text-md leading-normal text-pretty text-text-muted">
            {t('sub')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={APP_NEW_HREF} className={buttonClass({ variant: 'primary', size: 'lg' })}>
              {t('ctaPrimary')}
            </a>
            <a href="#real-lesson" className={buttonClass({ variant: 'ghost', size: 'lg' })}>
              {t('ctaGhost')}
            </a>
          </div>

          <p className="mt-4 text-sm text-text-muted">{t('noCard')}</p>
        </div>

        <div className="mt-14 sm:mt-16">
          <div className="rounded-note border border-border bg-bg-sunken">
            <HeroScrubber
              label={t('scrubberLabel')}
              // The raw message, not a rendered one: the island substitutes as the slider moves,
              // and a function cannot be handed across the server/client boundary.
              valueTemplate={t.raw('scrubberValue')}
              beforeLabel={<PanelLabel>{t('beforeLabel')}</PanelLabel>}
              afterLabel={<PanelLabel tone="accent">{t('afterLabel')}</PanelLabel>}
              before={<RawPage label={t('beforeLabel')} caption={t('beforeCaption')} />}
              after={
                <GoldPage
                  label={t('afterLabel')}
                  caption={t('afterCaption')}
                  correctedLabel={t('correctedLabel')}
                />
              }
            />
          </div>

          <p className="mt-4 text-center text-sm text-text-muted">
            {t('sourceNote')}{' '}
            {/* --text-faint is a marker token, not a prose colour: it measures 3.07:1 and this
                is body copy (see tests/unit/contrast.test.ts). */}
            <span className="text-text-muted motion-reduce:hidden max-sm:hidden">
              {t('scrubberHint')}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
