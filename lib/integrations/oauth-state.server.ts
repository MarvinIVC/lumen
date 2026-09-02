import { createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env.server';

/**
 * The Next half of the signed OAuth state (06 §3).
 *
 * It has to agree byte for byte with `supabase/functions/_shared/oauth-state.ts`, because one
 * mints and the other verifies — the app knows who the student is, the callback does not, and this
 * string is the only thing that crosses between them. Two implementations is the cost of the two
 * runtimes; the format is the contract and `tests/unit/oauth-state.test.ts` holds both to it.
 */
const VERSION = 's1';

export interface OAuthState {
  userId: string;
  provider: 'notion' | 'drive';
  next: string;
}

function secret(): string {
  const env = serverEnv();
  return env.INTEGRATION_STATE_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? 'local-dev';
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function hmacHex(message: string): string {
  return createHmac('sha256', secret()).update(message).digest('hex');
}

export function mintState(state: OAuthState, now = Date.now()): string {
  const body = `${VERSION}.${encode(JSON.stringify({ ...state, iat: now }))}`;
  return `${body}.${hmacHex(body)}`;
}

/** Exported for the test that proves the two runtimes agree. */
export function verifyState(value: string, now = Date.now()): OAuthState | null {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = hmacHex(`${VERSION}.${payload}`);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState & {
      iat: number;
    };
    if (!parsed.userId || !parsed.provider) return null;
    if (!Number.isFinite(parsed.iat) || now - parsed.iat > 10 * 60 * 1000) return null;
    return { userId: parsed.userId, provider: parsed.provider, next: parsed.next || '/app' };
  } catch {
    return null;
  }
}
