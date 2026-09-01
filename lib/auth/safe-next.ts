import { APP_LIBRARY } from '@/lib/app/routes';

/** Authentication redirects stay inside the app. An OAuth `next=https://…` must never become an
 * open redirect, and marketing pages have no authenticated state to recover. */
export function safeAppNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/app') || value.startsWith('//')) return APP_LIBRARY;
  return value;
}
