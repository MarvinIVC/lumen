import type { Metadata } from 'next';

import { Legal } from '@/lib/marketing/pages/legal';
import { marketingMetadata } from '@/lib/marketing/metadata';
import {
  localeStaticParams,
  resolveLocale,
  type LocaleParams,
} from '@/lib/marketing/route-helpers';

export const dynamicParams = false;
export const generateStaticParams = localeStaticParams;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return marketingMetadata(await resolveLocale(params), '/privacy');
}

export default async function Page({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return <Legal locale={locale} document="privacy" />;
}
