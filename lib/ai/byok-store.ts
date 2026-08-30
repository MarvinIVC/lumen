'use client';

/**
 * Where a student's own key lives on their device — which is to say, it does not.
 *
 * What is stored is the *ciphertext* the `byok` edge function returned: sealed with a key only the
 * server has, so the blob in localStorage is worth nothing to anyone who reads it, including us.
 * The plaintext key exists in this tab for exactly as long as it takes to post it once, and is
 * never written anywhere.
 *
 * Phase-06 moves the same ciphertext into `profile.byok` when accounts exist, and nobody has to
 * type their key again.
 */
import type { ProviderId } from './provider';

const KEY = 'lumen.byok';

export interface StoredByok {
  provider: ProviderId;
  model: string;
  baseUrl: string | null;
  ciphertext: string;
  /** For "added on 30 August" in Settings. Not used for anything else. */
  savedAt: number;
}

export function readByok(): StoredByok | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredByok;
    return parsed.ciphertext && parsed.provider && parsed.model ? parsed : null;
  } catch {
    return null;
  }
}

export function writeByok(value: Omit<StoredByok, 'savedAt'>): StoredByok {
  const stored: StoredByok = { ...value, savedAt: Date.now() };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Nothing to do but let this session use it in memory.
  }
  return stored;
}

export function clearByok(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Already gone, as far as anyone can tell.
  }
}

/** The shape the edge functions expect. Never includes anything readable. */
export function byokRequest(stored: StoredByok | null) {
  if (!stored) return null;
  return {
    provider: stored.provider,
    model: stored.model,
    ...(stored.baseUrl ? { baseUrl: stored.baseUrl } : {}),
    ciphertext: stored.ciphertext,
  };
}
