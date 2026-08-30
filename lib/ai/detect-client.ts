'use client';

/**
 * The browser half of Stage A detection (04-AI-ENGINE.md §3).
 *
 * The model classify is the *only* network call the review screen can make, it is the only one in
 * the whole of phase-03 that spends anything, and it fires solely when the local heuristic scores
 * under 0.7. Everything else about ingestion and review is free and local.
 *
 * The `detect` edge function is phase-04's. Until it exists this reports itself unavailable and
 * the review screen falls back to what the heuristic found, shown as a question the student
 * answers rather than an answer we assert. That fallback is not a placeholder — it is what
 * happens for a student who is offline, and it has to be good on its own.
 */
import { clientEnv } from '@/lib/env';
import type { DetectionResult } from './schema';

/** Characters of context the classify prompt takes: the first 1500 and the last 500 (§3). */
const HEAD_CHARS = 1500;
const TAIL_CHARS = 500;

export function detectExcerpt(text: string): string {
  if (text.length <= HEAD_CHARS + TAIL_CHARS) return text;
  return `${text.slice(0, HEAD_CHARS)}\n…\n${text.slice(-TAIL_CHARS)}`;
}

/**
 * Whether the classify function is deployed. Phase-04 flips this to a real check against the
 * function's health, and the review screen already handles both answers.
 */
export function isDetectAvailable(): boolean {
  return false;
}

export function detectEndpoint(): string {
  return new URL('/functions/v1/detect', clientEnv.NEXT_PUBLIC_SUPABASE_URL).toString();
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extract: detectExcerpt(text),
        turnstileToken: options.turnstileToken ?? null,
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!response.ok) return null;
    return (await response.json()) as DetectionResult;
  } catch {
    return null;
  }
}
