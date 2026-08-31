/**
 * Who is calling, and may they (02-ARCHITECTURE.md §5, §7 layer 3).
 *
 * Three kinds of caller, in the order they are checked:
 *
 *   signed in   — a Supabase access token, verified against /auth/v1/user.
 *   signed out  — a signed `anon_id`, minted by us and replayed by the browser. It is the quota
 *                 key, so it has to be unforgeable: an HMAC over a random id and its issue time.
 *                 Minting one requires passing Turnstile; replaying one does not, because the
 *                 human check belongs at the door rather than on every request.
 *   BYOK        — either of the above plus a ciphertext only this server can open. The key is
 *                 decrypted per request and never stored, here or in the browser.
 *
 * The anon id is deliberately not a cookie. The app is served from Cloudflare and the functions
 * from Supabase, so every call is cross-origin and a third-party cookie is exactly the thing
 * browsers are in the middle of removing. A header the client stores and replays does the same job
 * without depending on that.
 */
import { decryptSecret, hmac, timingSafeEqual } from './crypto.ts';
import { userIdFromJwt } from './db.ts';
import { verifyTurnstile } from './turnstile.ts';
import type { Caller } from '../../../lib/ai/router.ts';
import type { ProviderId } from '../../../lib/ai/provider.ts';

const ANON_PREFIX = 'a1';
const ANON_HEADER = 'x-lumen-anon-id';

/**
 * The signing secret. A dedicated `ANON_ID_SECRET` is preferred; the service-role key is the
 * fallback so a deployment works before anyone remembers to set one. Rotating either invalidates
 * outstanding ids, which costs a student nothing more than a fresh daily allowance.
 */
function signingSecret(): string {
  return Deno.env.get('ANON_ID_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'local-dev';
}

export async function mintAnonId(now = Date.now()): Promise<string> {
  const random = crypto.randomUUID().replace(/-/g, '');
  const body = `${ANON_PREFIX}.${random}.${now}`;
  return `${body}.${await hmac(signingSecret(), body)}`;
}

export async function verifyAnonId(value: string | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== ANON_PREFIX) return null;
  const [, random, issued, signature] = parts;
  if (!random || !issued || !signature) return null;
  const expected = await hmac(signingSecret(), `${ANON_PREFIX}.${random}.${issued}`);
  return timingSafeEqual(expected, signature) ? value : null;
}

export interface ByokRequest {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  /** What `byok` returned. Only this server can open it. */
  ciphertext: string;
}

export interface CallerRequest {
  turnstileToken?: string | null;
  byok?: ByokRequest | null;
}

export interface ResolvedCaller {
  caller: Caller;
  /** Set when a new id was minted this request; the client stores it and replays it. */
  issuedAnonId: string | null;
  ipHash: string | null;
  refusal?: { code: string; message: string; status: number };
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? request.headers.get('cf-connecting-ip') ?? null;
}

export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  // Salted with the signing secret so the ledger holds a rate-limit key, not a list of addresses.
  return await hmac(signingSecret(), `ip:${ip}`);
}

export async function resolveCaller(
  request: Request,
  body: CallerRequest,
): Promise<ResolvedCaller> {
  const ip = clientIp(request);
  const ipHash = await hashIp(ip);

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : null;
  // The anon key is sent as a bearer token by the Supabase client on every call; it is not a user.
  const isAnonKey = bearer === Deno.env.get('SUPABASE_ANON_KEY');
  const userId = bearer && !isAnonKey ? await userIdFromJwt(bearer) : null;

  let anonId: string | null = null;
  let issuedAnonId: string | null = null;

  if (!userId) {
    anonId = await verifyAnonId(request.headers.get(ANON_HEADER));
    if (!anonId) {
      const outcome = await verifyTurnstile(body.turnstileToken ?? null, ip);
      if (!outcome.ok) {
        return {
          caller: { tier: 'anon', userId: null, anonId: null },
          issuedAnonId: null,
          ipHash,
          refusal: {
            code: 'turnstile_failed',
            message: 'We could not confirm you are a person. Reload the page and try again.',
            status: 403,
          },
        };
      }
      anonId = await mintAnonId();
      issuedAnonId = anonId;
    }
  }

  const caller: Caller = {
    tier: 'anon',
    userId,
    anonId,
  };

  if (body.byok) {
    // A malformed record — an older client, a half-written localStorage entry, a request built by
    // hand — must read as "add your key again", not as a 500. `decryptSecret` is only safe on a
    // string, and everything reaching here came off the wire.
    const ciphertext = typeof body.byok.ciphertext === 'string' ? body.byok.ciphertext : '';
    const apiKey = ciphertext ? await decryptSecret(ciphertext) : null;
    if (!apiKey) {
      return {
        caller,
        issuedAnonId,
        ipHash,
        refusal: {
          code: 'byok_unreadable',
          message: 'We could not read your saved API key. Please add it again in Settings.',
          status: 400,
        },
      };
    }
    caller.byok = {
      provider: body.byok.provider,
      model: body.byok.model,
      apiKey,
      ...(body.byok.baseUrl ? { baseUrl: body.byok.baseUrl } : {}),
    };
    caller.tier = 'byok';
  } else {
    caller.tier = userId ? 'verified' : 'anon';
  }

  return { caller, issuedAnonId, ipHash };
}

export { ANON_HEADER };
