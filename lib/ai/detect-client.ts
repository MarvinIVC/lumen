'use client';

/**
 * The browser half of Stage A detection (04-AI-ENGINE.md §3).
 *
 * The model classify is the *only* network call the review screen can make, it is the only one in
 * the whole of phase-03 that spends anything, and it fires solely when the local heuristic scores
 * under 0.7. Everything else about ingestion and review is free and local.
 *
 * The `detect` edge function ships with phase-04, so this is live. The fallback below it is not a
 * placeholder and never was: `detectRemote` returns `null` on any failure, and the review screen
 * shows what the local heuristic found as a question the student answers rather than an answer we
 * assert. That is also exactly what a student who is offline sees, and it has to be good on its own.
 */
import { clientEnv } from '@/lib/env';
import { anonHeaders, captureAnonId } from './anon-id';
import type { DetectionResult } from './schema';

/** Characters of context the classify prompt takes: the first 1500 and the last 500 (§3). */
const HEAD_CHARS = 1500;
const TAIL_CHARS = 500;

export function detectExcerpt(text: string): string {
  if (text.length <= HEAD_CHARS + TAIL_CHARS) return text;
  return `${text.slice(0, HEAD_CHARS)}\n…\n${text.slice(-TAIL_CHARS)}`;
}

/**
 * Whether the classify call can be made at all.
 *
 * It is a configuration check, not a health check: asking the function whether it is up would cost
 * a round trip on a screen that has to be instant, and the answer to "it is down" is identical to
 * the answer to "it returned nothing" — the student fills the field in themselves.
 */
export function isDetectAvailable(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_SUPABASE_URL);
}

export function detectEndpoint(): string {
  return '/api/ai/detect';
}

export interface DetectRemoteOptions {
  signal?: AbortSignal;
  turnstileToken?: string | null;
}

/**
 * Returns `null` rather than throwing on any failure. A detection we could not make is a field
 * the student fills in themselves — never an error screen, and never a blocked "Create study
 * guide" button.
 */
export async function detectRemote(
  text: string,
  options: DetectRemoteOptions = {},
): Promise<DetectionResult | null> {
  if (!isDetectAvailable()) return null;
  try {
    const response = await fetch(detectEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...anonHeaders(),
      },
      body: JSON.stringify({
        extract: detectExcerpt(text),
        turnstileToken: options.turnstileToken ?? null,
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!response.ok) return null;
    captureAnonId(response);
    // The function answers 200 with `null` when it could not classify — a supported answer, not an
    // error, and the difference matters to the screen that reads it.
    return (await response.json()) as DetectionResult | null;
  } catch {
    return null;
  }
}
