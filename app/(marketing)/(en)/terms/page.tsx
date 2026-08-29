import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { Legal } from '@/lib/marketing/pages/legal';
import { marketingMetadata } from '@/lib/marketing/metadata';

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata(DEFAULT_LOCALE, '/terms');
}

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return <Legal locale={locale} document="terms" />;
}
