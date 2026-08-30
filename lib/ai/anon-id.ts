'use client';

/**
 * The signed anonymous id (02-ARCHITECTURE.md §5).
 *
 * The server mints it — behind Turnstile, signed so it cannot be forged — and the browser's whole
 * job is to keep it and send it back. It is the quota key for a student who has not signed in, so
 * losing it means a fresh allowance, which is a bug in the student's favour and not worth
 * defending against; what matters is that it is *stable* across a session so the meter and the
 * refusal agree.
 *
 * `localStorage` rather than a cookie because the app and the functions are on different origins
 * (Cloudflare and Supabase), which makes this a third-party cookie — the thing browsers are in the
 * middle of removing. Private mode can refuse the write; that costs a student nothing but a new id.
 */
const KEY = 'lumen.anonId';

export const ANON_HEADER = 'x-lumen-anon-id';

export function readAnonId(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeAnonId(value: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // Private browsing. The id lives for this page load only, which is fine.
  }
}

/** Headers for any call that spends: the id if we have one, nothing if we do not. */
export function anonHeaders(): Record<string, string> {
  const id = readAnonId();
  return id ? { [ANON_HEADER]: id } : {};
}

/** Every response that mints one carries it back; store it before anything else looks at it. */
export function captureAnonId(response: Response): void {
  const issued = response.headers.get(ANON_HEADER);
  if (issued) writeAnonId(issued);
}
