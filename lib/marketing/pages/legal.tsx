import { getTranslations } from 'next-intl/server';

import { APP_NAME, LEGAL_UPDATED } from '@/lib/config';
import type { Locale } from '@/i18n/config';

import { Section } from '../section';
import { MarketingShell } from '../shell';

interface LegalSection {
  id: string;
  heading: string;
  body: string[];
}

/** Both documents name the product, so every paragraph is resolved through ICU rather than read
 *  raw — `t.raw` would hand back a literal `{app}` for a reader to puzzle over. */
const values = { app: APP_NAME };

/**
 * /privacy and /terms — the same shape, two catalogues (06-RENDER-EXPORT-SAFETY.md §6–7).
 *
 * Written to be read by a 16-year-old rather than to be defensible in front of a regulator, because
 * the audience really is 16-year-olds and a policy nobody finishes protects nobody. Every claim here
 * describes what the app does *today*; where a later phase changes the behaviour, the section is
 * named in the per-phase list below so the code change and the sentence move together.
 *
 * ── TODO, by phase ────────────────────────────────────────────────────────────────────────────
 * phase-03 `storage`      — signed-out notes land in IndexedDB for real; confirm the wording once
 *                           the local store exists and says whether clearing site data wipes it.
 * phase-04 `what-leaves`  — the enhance and OCR calls become real. Confirm that these two buttons
 *                           are still the only paths that transmit content.
 * phase-04 `training`     — the Gemini opt-in label has to exist in the UI before this paragraph
 *                           is true. If the fallback ships without the label, this text is a lie.
 * phase-04 `logs`         — the cost ledger is built here. Confirm it stores no note text.
 * phase-05 `storage`      — accounts, RLS and sharing arrive; check "unlisted, noindex" holds.
 * phase-05 `deletion`     — hard delete and "delete everything" are implemented here; confirm the
 *                           email confirmation and the same-request deletion are both real.
 * phase-05 `location`     — name the actual Supabase region once the project is provisioned.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */
export async function Legal({
  locale,
  document,
}: {
  locale: Locale;
  document: 'privacy' | 'terms';
}) {
  const t = await getTranslations({ locale, namespace: document });
  const sections = t.raw('sections') as LegalSection[];

  return (
    <MarketingShell locale={locale} route={document === 'privacy' ? '/privacy' : '/terms'}>
      <Section width="prose" divider={false} labelledBy="legal-heading">
        <h1
          id="legal-heading"
          className="font-serif text-3xl leading-tight font-semibold text-text"
        >
          {t('title')}
        </h1>
        <p className="mt-3 font-mono text-xs tracking-widest text-text-muted uppercase">
          {t('updated', { date: LEGAL_UPDATED })}
        </p>

        <p className="mt-8 font-serif text-lg leading-note text-text">{t('lede')}</p>

        <div className="mt-14 flex flex-col gap-12">
          {sections.map((section, sectionIndex) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
              <h2
                id={`${section.id}-heading`}
                className="font-serif text-xl font-semibold text-text"
              >
                {section.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4 leading-normal text-text-muted">
                {section.body.map((_, index) => (
                  <p key={index}>{t(`sections.${sectionIndex}.body.${index}`, values)}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>
    </MarketingShell>
  );
}
