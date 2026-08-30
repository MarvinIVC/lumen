/**
 * Cloudflare Turnstile, gating the signed-out path (02-ARCHITECTURE.md §7 layer 3).
 *
 * When `TURNSTILE_SECRET` is unset — local development, and any deployment that has not been given
 * one — verification is skipped and says so in the log. That is a deliberate, visible hole rather
 * than a silent one: the alternative is a local stack where nothing can be tested, and a
 * deployment that fails closed on a variable nobody remembers setting.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileOutcome {
  ok: boolean;
  skipped: boolean;
  reason?: string;
}

export async function verifyTurnstile(
  token: string | null,
  remoteIp: string | null,
): Promise<TurnstileOutcome> {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret) {
    console.warn('TURNSTILE_SECRET is not set — skipping the human check for this request.');
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false, skipped: false, reason: 'missing-token' };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body });
    const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (result.success) return { ok: true, skipped: false };
    return { ok: false, skipped: false, reason: result['error-codes']?.join(',') ?? 'rejected' };
  } catch (cause) {
    // Cloudflare being unreachable must not take the product down with it. Log and let it through:
    // the quota and the caps are the guardrails that actually hold the budget.
    console.error('Turnstile verification failed to complete', cause);
    return { ok: true, skipped: true, reason: 'verifier-unreachable' };
  }
}
