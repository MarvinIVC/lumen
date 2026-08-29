import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/config';
import { PROVENANCE_BLOCK, PROVENANCE_SURFACES } from '@/lib/render/provenance-styles';
import { goldFixture } from '@/lib/render/fixture/gold';
import { stripInline } from '@/lib/render/markdown/strip';

import { Section, SectionHeading } from '../section';
import { TrustPreview } from './lazy-sections';

interface Step {
  id: string;
  kicker: string;
  title: string;
  body: string;
  detail: string;
}

/**
 * "How it works" on the home page (03-DESIGN.md §8.3). Three steps, and step two carries the whole
 * argument: it shows a real `ProvenanceBlock` and a real `CorrectionsPanel` rather than a drawing
 * of them, because a claim about honesty that is illustrated with a mockup is not much of a claim.
 *
 * The three steps are a row and the evidence sits underneath the row, rather than each step being
 * a wide two-column band with a picture beside it. Only one of the three has anything to show, so
 * the banded version left two enormous empty columns — and a section that reads as broken is not a
 * section anyone screenshots.
 */
export async function Steps({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'steps' });
  const steps = t.raw('items') as Step[];
  const evidenceStep = steps.find((step) => step.id === 'check');

  return (
    <Section labelledBy="steps-heading">
      <SectionHeading id="steps-heading">{t('heading')}</SectionHeading>

      <ol className="mt-12 grid gap-x-10 gap-y-12 lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.id}>
            <p className="font-mono text-xs tracking-widest text-text-muted uppercase">
              {step.kicker}
            </p>
            <h3 className="mt-3 font-serif text-xl font-semibold text-text">{step.title}</h3>
            <p className="mt-3 leading-normal text-text-muted">{step.body}</p>
            <p className="mt-3 text-sm leading-normal text-text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>

      {evidenceStep ? (
        <div className="mt-16 rounded-note border border-border bg-bg-raised p-6 sm:p-10">
          <TrustPreview
            loadingLabel={t('loading')}
            provenanceCaption={t('provenanceCaption')}
            correctionsCaption={t('correctionsCaption')}
          >
            <StaticTrustPreview
              provenanceCaption={t('provenanceCaption')}
              correctionsCaption={t('correctionsCaption')}
            />
          </TrustPreview>
        </div>
      ) : null}
    </Section>
  );
}

/**
 * What step two looks like before the live components arrive, and permanently for a reader without
 * JavaScript: the same corrected block and the same first correction, server-rendered from the same
 * fixture and the same class maps. The live version adds hover labels and the count-up; the words
 * do not change, which is the point.
 */
function StaticTrustPreview({
  provenanceCaption,
  correctionsCaption,
}: {
  provenanceCaption: string;
  correctionsCaption: string;
}) {
  const correction = goldFixture().corrections[0];

  return (
    <div className="lumen-note">
      <div
        className={`${PROVENANCE_BLOCK} ${PROVENANCE_SURFACES['ai-corrected'].loud}`}
        data-origin="ai-corrected"
      >
        <p className="font-semibold">Two masses, one number.</p>
        <p className="mt-1 text-sm/6">
          They are numerically equal but they are not the same thing: one is the mass of a single
          particle, the other the mass of a mole of them.
        </p>
      </div>
      <p className="mt-3 font-sans text-sm text-text-muted">{provenanceCaption}</p>

      {correction ? (
        <div className="mt-8 border-t border-border pt-6 font-sans">
          <h4 className="font-serif text-lg font-semibold text-text">What to relearn</h4>
          <div className="mt-4 rounded-note border-l-2 border-ai-corrected-mark bg-ai-corrected/70 px-4 py-3">
            <p className="text-sm leading-snug text-text-muted">
              <span className="sr-only">You wrote: </span>
              <s>{stripInline(correction.original)}</s>
            </p>
            <p className="mt-1 text-sm leading-snug text-text">
              {stripInline(correction.corrected)}
            </p>
            <p className="mt-2 text-sm leading-snug text-text-muted">
              {stripInline(correction.why)}
            </p>
          </div>
        </div>
      ) : null}
      <p className="mt-4 font-sans text-sm text-text-muted">{correctionsCaption}</p>
    </div>
  );
}
