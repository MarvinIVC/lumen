import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/config';

import { href } from '../routes';
import { Section, SectionHeading } from '../section';

/**
 * "Free, and why" (03-DESIGN.md §8.6).
 *
 * The section only works if it is specific. "We believe in accessible education" is what a company
 * says when the real answer is "we will charge you later"; the real answer here is that the unit
 * cost is a fraction of a penny, and saying so plainly is the whole argument.
 */
export async function Free({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'free' });
  const paragraphs = t.raw('paragraphs') as string[];

  return (
    <Section labelledBy="free-heading" width="prose">
      <SectionHeading id="free-heading">{t('heading')}</SectionHeading>

      <div className="mt-8 flex flex-col gap-5 font-serif text-md leading-note text-text">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </div>

      <p className="mt-8">
        <Link
          href={href(locale, '/privacy')}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('link')} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </Section>
  );
}
