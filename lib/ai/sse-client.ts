'use client';

/**
 * Reading `text/event-stream` off a fetch body, in the browser.
 *
 * Deliberately a second, smaller reader than `lib/ai/providers/sse.ts`. That one is for talking to
 * model providers and runs on the server; importing it here would pull the provider modules — and
 * the exact shape of our requests to paid APIs — into the client graph, which
 * `tests/unit/no-client-secrets.test.ts` exists to prevent.
 *
 * Extracted from `enhance-client.ts` in phase-05, when the regenerate and ask calls became the
 * second and third things streaming into the browser. Three copies of a frame parser is three
 * places for a payload containing a blank line to be split wrongly.
 */

export type SseHandler = (event: string, data: unknown) => void;

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        emit(buffer.slice(0, boundary), onEvent);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) emit(buffer, onEvent);
  } catch {
    // An aborted read is how "Cancel" is implemented. Anything else has already been reported by
    // the server as an `error` event, or is a dropped connection the caller sees as a stalled run.
  } finally {
    reader.releaseLock();
  }
}

function emit(frame: string, onEvent: SseHandler): void {
  let name: string | null = null;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice(7).trim();
    else if (line.startsWith('data: ')) data.push(line.slice(6));
  }
  if (!name) return;
  try {
    onEvent(name, data.length > 0 ? JSON.parse(data.join('\n')) : null);
  } catch {
    // A frame we cannot parse is a frame we ignore; the concluding event is what matters and it
    // either arrives whole or not at all.
  }
}

/* -------------------------------------------------------------------------- *
 * Opening one of our own streams
 * -------------------------------------------------------------------------- */

/**
 * The reasons a call is refused before it runs.
 *
 * `unavailable` is not one the server sends: it is what the client calls anything it could not
 * make sense of. Keeping it in the union rather than widening `reason` to `string` is what stops a
 * 503 from an unreachable gateway being shown to a student as a quota card — which it was, on the
 * deployed preview, telling students they had spent an allowance they had not touched.
 */
export type RefusalReason =
  | 'kill-switch'
  | 'monthly-cap'
  | 'daily-cap'
  | 'quota'
  | 'rate-limited'
  | 'too_large'
  | 'unavailable';

const KNOWN_REASONS = new Set<string>([
  'kill-switch',
  'monthly-cap',
  'daily-cap',
  'quota',
  'rate-limited',
  'too_large',
]);

export interface QuotaRefusal {
  reason: RefusalReason;
  message: string;
  resetsAt: string | null;
  byokHelps: boolean;
}

export class EnhanceRefused extends Error {
  constructor(readonly refusal: QuotaRefusal) {
    super(refusal.message);
    this.name = 'EnhanceRefused';
  }
}

export const UNAVAILABLE: QuotaRefusal = {
  reason: 'unavailable',
  message:
    'We could not reach the study-guide service just now. Your notes are safe on this device — try again in a moment.',
  resetsAt: null,
  byokHelps: false,
};

/**
 * Turns a non-OK response into a refusal we are willing to show a student.
 *
 * The default is "we could not reach it", and a claimed reason only wins if it is one we
 * recognise. Anything else — a gateway error page, an HTML 502, a JSON body with a reason we have
 * never heard of — is a service problem, not a statement about their account.
 */
export async function refusalFrom(response: Response): Promise<QuotaRefusal> {
  const refusal: QuotaRefusal = { ...UNAVAILABLE };
  try {
    const parsed = (await response.json()) as Partial<QuotaRefusal> & { error?: string };
    const claimed = parsed.reason ?? parsed.error ?? '';
    if (KNOWN_REASONS.has(claimed)) {
      refusal.reason = claimed as RefusalReason;
      if (parsed.message) refusal.message = parsed.message;
      refusal.resetsAt = parsed.resetsAt ?? null;
      refusal.byokHelps = parsed.byokHelps ?? false;
    }
  } catch {
    // A gateway error page rather than our JSON. The default above is the honest reading.
  }
  return refusal;
}
