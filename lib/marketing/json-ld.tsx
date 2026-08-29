import { APP_NAME, GITHUB_URL } from '@/lib/config';
import { LOCALE_TAGS, type Locale } from '@/i18n/config';
import { clientEnv } from '@/lib/env';

/**
 * Structured data (the phase-02 SEO brief).
 *
 * Two schemas, both of which describe things that are actually on the page: a `SoftwareApplication`
 * for the product, and a `FAQPage` for the questions on /how-it-works. Marking up an FAQ that does
 * not exist in the visible copy is the usual way a site earns a manual penalty, so the entries here
 * are built from the same message catalogue the page renders from — they cannot disagree.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is our own message catalogue, serialised by JSON.stringify. The `<` escape
      // closes the one hole that leaves: a literal `</script>` inside a string would otherwise end
      // the element early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

export function softwareApplicationSchema({
  locale,
  description,
}: {
  locale: Locale;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    description,
    url: clientEnv.NEXT_PUBLIC_APP_URL,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any modern browser',
    inLanguage: LOCALE_TAGS[locale],
    isAccessibleForFree: true,
    codeRepository: GITHUB_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

export function faqPageSchema(entries: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}
