import { getTranslations } from 'next-intl/server';

import { APP_NAME } from '@/lib/config';
import type { Locale } from '@/i18n/config';

import { Section, SectionHeading } from '../section';

/**
 * "Every subject" (03-DESIGN.md §8.5): a quiet grid, and quiet is the brief.
 *
 * No icons, no logos, no coloured tiles — a list of words set well. The section has to say "yes,
 * yours too" without implying an equal depth of support everywhere, which is what the caveat under
 * it is for. Over-claiming here would be the first dishonest thing on the page.
 */
export async function Subjects({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'subjects' });
  const curricula = t.raw('curricula') as string[];
  const subjects = t.raw('subjects') as string[];

  return (
    <Section labelledBy="subjects-heading">
      <SectionHeading id="subjects-heading">{t('heading')}</SectionHeading>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Group label={t('curriculaLabel')} items={curricula} />
        <Group label={t('subjectsLabel')} items={subjects} />
      </div>

      <p className="mt-12 max-w-(--measure) font-serif text-lg leading-note text-text">
        {t('closer', { app: APP_NAME })}
      </p>
      <p className="mt-4 max-w-(--measure) text-sm leading-normal text-text-muted">{t('caveat')}</p>
    </Section>
  );
}

function Group({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-mono text-xs tracking-widest text-text-muted uppercase">{label}</h3>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <li key={item} className="font-serif text-md text-text">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
