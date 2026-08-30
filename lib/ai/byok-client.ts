'use client';

/**
 * Saving a student's own API key (02-ARCHITECTURE.md §7, 06 §5 item 7).
 *
 * The key crosses the wire once, to the `byok` function, which tries it with a one-token call and
 * returns it sealed. Nothing readable is stored anywhere: what comes back is a ciphertext only the
 * server can open, and that is what `byok-store.ts` keeps.
 *
 * The one-token test call matters more than it looks. A key that is wrong fails at the moment a
 * student is looking at the field they typed it into, rather than three screens later on the note
 * they were waiting for.
 */
import { clientEnv } from '@/lib/env';
import { writeByok } from './byok-store';
import type { StoredByok } from './byok-store';
import type { ProviderId } from './provider';

export function byokEndpoint(): string {
  return new URL('/functions/v1/byok', clientEnv.NEXT_PUBLIC_SUPABASE_URL).toString();
}

/** Suggested model per provider — a starting point in the field, never a silent default. */
export const SUGGESTED_MODEL: Record<ProviderId, string> = {
  deepseek: 'deepseek-v4-flash',
  gemini: 'gemini-2.5-flash',
  'openai-compatible': '',
  anthropic: 'claude-sonnet-5',
};

export interface SaveKeyInput {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey: string;
}

export class ByokError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ByokError';
  }
}

export async function saveKey(input: SaveKeyInput): Promise<StoredByok> {
  const response = await fetch(byokEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    ciphertext?: string;
    message?: string;
    baseUrl?: string | null;
  } | null;

  if (!response.ok || !payload?.ciphertext) {
    throw new ByokError(payload?.message ?? 'We could not check that key. Try again in a moment.');
  }

  return writeByok({
    provider: input.provider,
    model: input.model,
    baseUrl: payload.baseUrl ?? input.baseUrl ?? null,
    ciphertext: payload.ciphertext,
  });
}
