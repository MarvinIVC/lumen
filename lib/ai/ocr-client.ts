'use client';

/**
 * The browser half of OCR (01-PRODUCT.md §2 step 3: "Run OCR (1 credit)").
 *
 * The `ocr` edge function is phase-04's, and the review screen is built to work without it: a
 * scanned page shows its thumbnail, keeps its `needsOCR` flag, and offers a disabled button that
 * says when it will work rather than pretending. That is the honest version of a dependency that
 * has not shipped, and it is also exactly the state a student is in when they are offline.
 *
 * The one thing this must never do is quietly cost a credit. `runOcr` throws rather than guessing
 * at an endpoint, so a mis-wire in phase-04 is a failure and not a silent charge.
 */
import { clientEnv } from '@/lib/env';

export function isOcrAvailable(): boolean {
  return false;
}

export function ocrEndpoint(): string {
  return new URL('/functions/v1/ocr', clientEnv.NEXT_PUBLIC_SUPABASE_URL).toString();
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
}

export async function runOcr(_request: OcrRequest): Promise<OcrResult> {
  throw new Error('OCR is not available until the ocr edge function ships (phase-04).');
}
