/**
 * The `state` parameter, as a signed capability (06 §3).
 *
 * **This exists because of phase-06's auth boundary.** The browser holds no Supabase token — the
 * session lives in httpOnly cookies on the Cloudflare origin — and an OAuth callback arrives at a
 * Supabase edge function, which is a different origin and cannot see those cookies. So the
 * callback has no way to know who it is for, unless the request carries that fact with it.
 *
 * `state` is that fact, signed. A Next route mints it server-side, where the session *is* legible,
 * and the callback verifies the signature before it stores a token against anybody. Without this
 * the callback would be an endpoint that attaches a Notion workspace to whichever user id the
 * caller typed into the query string.
 *
 * Short-lived, because a state parameter is a bearer token for the duration of a redirect and has
 * no business outliving one.
 */
import { hmac, timingSafeEqual } from './crypto.ts';

const VERSION = 's1';
const TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  userId: string;
  provider: 'notion' | 'drive';
  /** Where to send the student when it is over. Validated as an in-app path by the minting route. */
  next: string;
}

function secret(): string {
  return (
    Deno.env.get('INTEGRATION_STATE_SECRET') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    'local-dev'
  );
}

function encode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export async function mintState(state: OAuthState, now = Date.now()): Promise<string> {
  const body = `${VERSION}.${encode(JSON.stringify({ ...state, iat: now }))}`;
  return `${body}.${await hmac(secret(), body)}`;
}

export async function verifyState(
  value: string | null,
  now = Date.now(),
): Promise<OAuthState | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = await hmac(secret(), `${VERSION}.${payload}`);
  if (!timingSafeEqual(expected, signature)) return null;

  try {
    const parsed = JSON.parse(decode(payload)) as OAuthState & { iat: number };
    if (!parsed.userId || !parsed.provider) return null;
    // An expired state is refused rather than tolerated: the whole flow is a redirect and a
    // handshake, and ten minutes is already generous for one.
    if (!Number.isFinite(parsed.iat) || now - parsed.iat > TTL_MS) return null;
    return { userId: parsed.userId, provider: parsed.provider, next: parsed.next || '/app' };
  } catch {
    return null;
  }
}
