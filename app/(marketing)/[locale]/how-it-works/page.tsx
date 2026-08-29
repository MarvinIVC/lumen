import type { Metadata } from 'next';

import { HowItWorks } from '@/lib/marketing/pages/how-it-works';
import { marketingMetadata } from '@/lib/marketing/metadata';
import {
  localeStaticParams,
  resolveLocale,
  type LocaleParams,
} from '@/lib/marketing/route-helpers';

export const dynamicParams = false;
export const generateStaticParams = localeStaticParams;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return marketingMetadata(await resolveLocale(params), '/how-it-works');
}

export default async function Page({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return <HowItWorks locale={locale} />;
}
