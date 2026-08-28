/**
 * Analytics (02-ARCHITECTURE.md §2): Cloudflare Web Analytics for page views (free, cookieless,
 * no third-party tracker) plus a tiny first-party event beacon for the funnel.
 *
 * Everything here no-ops when unconfigured, so local development and tests send nothing.
 */
import { clientEnv } from './env';

/** Funnel events. Kept as a closed union so the names stay greppable across phases. */
export type AnalyticsEvent =
  | 'upload_started'
  | 'extraction_reviewed'
  | 'enhance_started'
  | 'enhance_completed'
  | 'enhance_failed'
  | 'note_saved'
  | 'note_exported'
  | 'note_shared'
  | 'integration_pushed'
  | 'study_tool_opened';

export type AnalyticsProps = Record<string, string | number | boolean | null>;

export function isAnalyticsEnabled(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_ANALYTICS_BEACON_URL);
}

/** Cloudflare Web Analytics token, or null when the snippet should not render. */
export function cloudflareAnalyticsToken(): string | null {
  return clientEnv.NEXT_PUBLIC_CF_ANALYTICS_TOKEN || null;
}

/**
 * Fire-and-forget. Uses `sendBeacon` so it survives a page transition, and never rejects —
 * analytics must not be able to break a user's note.
 */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  const endpoint = clientEnv.NEXT_PUBLIC_ANALYTICS_BEACON_URL;
  if (!endpoint || typeof window === 'undefined') return;

  const payload = JSON.stringify({ event, props, ts: Date.now(), env: clientEnv.NEXT_PUBLIC_ENV });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch(endpoint, {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Blocked by an extension or an ad blocker. Fine — this is not load-bearing.
  }
}
