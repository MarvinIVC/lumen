import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/config';

import { Section, SectionHeading, SectionLede } from '../section';

interface ProblemItem {
  label: string;
  quote: string;
  caption: string;
}

/**
 * "The problem" (03-DESIGN.md §8.2): three excerpts from the real file, each with one dry line
 * under it.
 *
 * The quotes live in the message catalogue rather than being sliced from the fixture the way the
 * hero's are, because two of the three are a single line and the third is a chosen run of five —
 * a slice expression precise enough to pick those out would be less readable than the lines
 * themselves. `tests/unit/marketing-excerpts.test.ts` asserts every one of them is still a verbatim
 * substring of `fixtures/ap-chem-u1-raw.md`, in both locales, so they cannot drift into paraphrase.
 */
export async function Problem({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'problem' });
  const items = t.raw('items') as ProblemItem[];

  return (
    <Section labelledBy="problem-heading">
      <SectionHeading id="problem-heading">{t('heading')}</SectionHeading>
      <SectionLede>{t('lede')}</SectionLede>

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col">
            <p className="font-mono text-xs tracking-widest text-text-muted uppercase">
              {item.label}
            </p>

            {/* Not `grow`: stretching all three to the tallest left two of them mostly empty, and
                a quote box padded with nothing reads as a layout bug rather than as breathing room. */}
            <blockquote className="mt-3 rounded-note border border-border bg-bg-sunken px-4 py-4">
              {item.quote.split('\n').map((line, index) => (
                <p key={index} className="font-sans text-sm/6 break-words text-text">
                  {line}
                </p>
              ))}
            </blockquote>

            <p className="mt-3 text-sm leading-normal text-text-muted">{item.caption}</p>
          </li>
        ))}
      </ul>

      <p className="mt-12 max-w-(--measure) font-serif text-md leading-note text-text">
        {t('closer')}
      </p>
    </Section>
  );
}
