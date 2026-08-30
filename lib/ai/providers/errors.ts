/**
 * Mapping a provider's failure onto the one shape the router branches on.
 *
 * `retryable` is the only field with teeth: it is what decides whether the fallback provider gets
 * a turn (04-AI-ENGINE.md §2 step 3). A 400 is our bug and retrying it on another model just
 * spends someone else's money to fail identically, so only timeouts, rate limits, 5xx and network
 * faults set it.
 */
import type { ProviderError, ProviderErrorKind } from '../provider';

export function errorFromStatus(status: number, body: string): ProviderError {
  const message = summarise(body) || `HTTP ${status}`;
  let kind: ProviderErrorKind = 'server';

  if (status === 401 || status === 403) kind = 'auth';
  else if (status === 429) kind = 'rate-limit';
  else if (status === 402) kind = 'auth';
  else if (status === 408 || status === 504) kind = 'timeout';
  else if (status >= 400 && status < 500) kind = 'bad-request';

  return {
    kind,
    message,
    status,
    retryable: kind === 'rate-limit' || kind === 'timeout' || kind === 'server',
  };
}

export function errorFromException(cause: unknown, timedOut: boolean): ProviderError {
  if (timedOut) {
    return { kind: 'timeout', message: 'the provider did not answer in time', retryable: true };
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return { kind: 'network', message, retryable: true };
}

/** Providers return anything from a JSON envelope to an HTML error page; keep it short and safe. */
function summarise(body: string): string {
  const trimmed = body.trim().slice(0, 2000);
  if (!trimmed) return '';
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const error = record.error;
      if (typeof error === 'string') return error;
      if (typeof error === 'object' && error !== null) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === 'string') return message;
      }
      if (typeof record.message === 'string') return record.message;
    }
  } catch {
    // Not JSON — fall through to the raw text, trimmed hard so an HTML page cannot fill a log.
  }
  return trimmed.replace(/\s+/g, ' ').slice(0, 200);
}
