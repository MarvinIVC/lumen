'use client';

/**
 * What the QuotaMeter shows (01-PRODUCT.md §6, 02-ARCHITECTURE.md §7 layer 1).
 *
 * One lightweight read of the same rolling window the guardrails use, so the number a student sees
 * and the number that refuses them cannot disagree. It never throws: a meter we could not fetch
 * shows the full allowance rather than an error, because being wrong in the student's favour for
 * one screen is better than a broken widget on the page they came to use.
 */
import { clientEnv } from '@/lib/env';
import { anonHeaders, captureAnonId } from './anon-id';

export interface UsageLine {
  used: number;
  total: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  tier: 'anon' | 'verified' | 'byok';
  enabled: boolean;
  enhance: UsageLine;
  ocr: UsageLine;
}

export function usageEndpoint(): string {
  return new URL('/functions/v1/usage', clientEnv.NEXT_PUBLIC_SUPABASE_URL).toString();
}

export async function fetchUsage(signal?: AbortSignal): Promise<UsageSnapshot | null> {
  try {
    const response = await fetch(usageEndpoint(), {
      headers: { apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...anonHeaders() },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return null;
    captureAnonId(response);
    return (await response.json()) as UsageSnapshot;
  } catch {
    return null;
  }
}

/** "in 4 hours", "tomorrow morning" — the phrasing the meter uses (01-PRODUCT.md §6). */
export function resetsIn(resetsAt: string | null, now = Date.now()): string | undefined {
  if (!resetsAt) return undefined;
  const ms = new Date(resetsAt).getTime() - now;
  if (!Number.isFinite(ms)) return undefined;
  if (ms <= 0) return 'in a moment';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return `in ${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (hours === 1) return 'in an hour';
  if (hours < 24) return `in ${hours} hours`;
  return 'tomorrow';
}
