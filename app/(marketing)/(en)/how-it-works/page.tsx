import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { HowItWorks } from '@/lib/marketing/pages/how-it-works';
import { marketingMetadata } from '@/lib/marketing/metadata';

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata(DEFAULT_LOCALE, '/how-it-works');
}

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return <HowItWorks locale={locale} />;
}
