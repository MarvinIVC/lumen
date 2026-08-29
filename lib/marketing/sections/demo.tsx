import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/config';
import { goldFixture } from '@/lib/render/fixture/gold';
import { stripInline } from '@/lib/render/markdown/strip';

import { APP_NEW_HREF } from '../routes';
import { Section, SectionHeading, SectionLede } from '../section';
import { DemoEmbed } from './lazy-sections';

/**
 * "See it on a real lesson" (03-DESIGN.md §8.4): the entire gold fixture through the real
 * `NoteDocument`, interactive, with no signup and no network call beyond static assets.
 *
 * The section id is `real-lesson` because the hero's ghost call to action points here — it is part
 * of the page's contract, not decoration.
 */
export async function Demo({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'demo' });

  return (
    <Section id="real-lesson" labelledBy="demo-heading">
      <SectionHeading id="demo-heading">{t('heading')}</SectionHeading>
      <SectionLede>{t('lede')}</SectionLede>

      <div className="mt-10 overflow-hidden rounded-note border border-border bg-bg-raised">
        <Ribbon claim={t('ribbonClaim')} cta={t('ribbonCta')} />

        {/*
          The note scrolls inside its own frame rather than extending the page (03-DESIGN.md §8.4
          asks for a scrollable embed). The gold fixture is a full unit of AP Chemistry — inlined at
          full height it added some eleven thousand pixels to the landing page, put the footer an
          absurd distance away, and turned the one section that is meant to feel like a window into
          the product into an accident of scrolling.

          The frame itself is drawn by `DemoEmbed`, because making it keyboard-reachable means
          measuring whether it actually overflows — and it only does once the note has loaded.
        */}
        <DemoEmbed loadingLabel={t('loading')} frameLabel={t('frameLabel')}>
          <StaticNoteOpening noScript={t('noScript')} />
        </DemoEmbed>
      </div>
    </Section>
  );
}

/** "This is real output. Try your own →" — the one line that turns the demo into an invitation. */
function Ribbon({ claim, cta }: { claim: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border bg-accent-weak px-5 py-3">
      <p className="text-sm font-medium text-text">{claim}</p>
      <a
        href={APP_NEW_HREF}
        className="text-sm font-medium text-link underline-offset-4 hover:underline"
      >
        {cta} <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}

/**
 * The note's opening, server-rendered from the same fixture the live version uses.
 *
 * This is not a loading skeleton. It is the real title, the real one-paragraph summary, the real
 * objectives and the real table of contents — so a crawler indexes a page that genuinely contains
 * an AP Chemistry study guide, and a reader without JavaScript gets something worth reading rather
 * than an empty box where the proof was meant to be.
 */
function StaticNoteOpening({ noScript }: { noScript: string }) {
  const doc = goldFixture();
  const headings = doc.sections.filter((section) => section.level === 2);

  return (
    <div className="lumen-note mx-auto max-w-(--measure) px-5 py-10">
      <noscript>
        <p className="mb-6 rounded-note border border-border bg-bg-sunken px-4 py-3 font-sans text-sm text-text-muted">
          {noScript}
        </p>
      </noscript>

      <p className="font-sans text-sm tracking-wide text-text-muted">
        {[doc.context.course, doc.context.unit].filter(Boolean).join(' · ')}
      </p>
      <h3 className="mt-2 font-serif text-2xl leading-tight font-semibold text-balance text-text">
        {doc.title}
      </h3>

      {/* Plain text, not the inline renderer: this opening exists for crawlers and for readers
          without JavaScript, and pulling the maths renderer in to set one paragraph would put
          KaTeX on the critical path of a page that must not load it. */}
      <p className="mt-6">{stripInline(doc.summary)}</p>

      {doc.objectives.length ? (
        <ul className="mt-6 flex list-disc flex-col gap-2 pl-5">
          {doc.objectives.map((objective) => (
            <li key={objective}>{stripInline(objective)}</li>
          ))}
        </ul>
      ) : null}

      {headings.length ? (
        <ol className="mt-8 flex flex-col gap-2 border-t border-border pt-6 font-sans text-sm text-text-muted">
          {headings.map((section) => (
            <li key={section.id}>{stripInline(section.title)}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
