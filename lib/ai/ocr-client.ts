'use client';

/**
 * The browser half of OCR (01-PRODUCT.md §2 step 3: "Run OCR (1 credit)").
 *
 * The one thing this must never do is quietly cost a credit, which is why every refusal from the
 * server is turned into a typed error the review screen can explain rather than a silent `null`:
 * "you have used today's page reading" and "we could not read that photo" are different things to
 * a student, and only one of them is worth trying again.
 */
import { clientEnv } from '@/lib/env';
import { anonHeaders, captureAnonId } from './anon-id';
import { byokRequest, readByok } from './byok-store';

export function isOcrAvailable(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_SUPABASE_URL);
}

export function ocrEndpoint(): string {
  return '/api/ai/ocr';
}

export interface OcrRequest {
  blob: Blob;
  language: string;
  turnstileToken?: string | null;
  signal?: AbortSignal;
}

export interface OcrResult {
  text: string;
  confidence: number;
  credits: number;
  /** Words the model could not read, so the review screen can point at them. */
  unreadable: string[];
}

export class OcrError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly resetsAt: string | null = null,
    readonly byokHelps = false,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}

/** Images travel as a data: URL — never a Storage path with a service key (04 §2). */
async function toDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  // Chunked because `String.fromCharCode(...bytes)` blows the argument limit on a real photo.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

export async function runOcr(request: OcrRequest): Promise<OcrResult> {
  if (!isOcrAvailable()) {
    throw new OcrError('unavailable', 'Reading photographs is not available right now.');
  }

  const response = await fetch(ocrEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...anonHeaders(),
    },
    body: JSON.stringify({
      image: await toDataUrl(request.blob),
      language: request.language,
      turnstileToken: request.turnstileToken ?? null,
      byok: byokRequest(readByok()),
    }),
    ...(request.signal ? { signal: request.signal } : {}),
  });

  captureAnonId(response);
  const payload = (await response.json().catch(() => null)) as
    | (Partial<OcrResult> & {
        error?: string;
        message?: string;
        resetsAt?: string | null;
        byokHelps?: boolean;
      })
    | null;

  if (!response.ok || !payload || typeof payload.text !== 'string') {
    throw new OcrError(
      payload?.error ?? 'failed',
      payload?.message ?? 'We could not read that page. Try a sharper photo, or type it in.',
      payload?.resetsAt ?? null,
      payload?.byokHelps ?? false,
    );
  }

  return {
    text: payload.text,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.5,
    credits: typeof payload.credits === 'number' ? payload.credits : 0,
    unreadable: Array.isArray(payload.unreadable) ? payload.unreadable : [],
  };
}
