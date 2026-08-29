import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { Home } from '@/lib/marketing/pages/home';
import { marketingMetadata } from '@/lib/marketing/metadata';

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata(DEFAULT_LOCALE, '/');
}

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return <Home locale={locale} />;
}
