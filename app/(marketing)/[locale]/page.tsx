import type { Metadata } from 'next';

import { Home } from '@/lib/marketing/pages/home';
import { marketingMetadata } from '@/lib/marketing/metadata';
import {
  localeStaticParams,
  resolveLocale,
  type LocaleParams,
} from '@/lib/marketing/route-helpers';

export const dynamicParams = false;
export const generateStaticParams = localeStaticParams;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return marketingMetadata(await resolveLocale(params), '/');
}

export default async function Page({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return <Home locale={locale} />;
}
