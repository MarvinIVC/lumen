import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { About } from '@/lib/marketing/pages/about';
import { marketingMetadata } from '@/lib/marketing/metadata';

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata(DEFAULT_LOCALE, '/about');
}

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return <About locale={locale} />;
}
